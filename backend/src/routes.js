const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { store, now, today, nextId } = require('./db');
const { requireAuth, requirePermission, requireAnyPermission, requireRole, jwtSecret } = require('./middleware');
const { defaultPermissionsForRole, hasPermission, normalizePermissions, normalizeStaffPermissions, permissionGroups } = require('./permissions');

const router = express.Router();

const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const localDateValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '').slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const dateOnly = (value) => {
  const text = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return localDateValue(text);
};
const inRange = (value, from, to) => {
  const date = dateOnly(value);
  return (!from || date >= from) && (!to || date <= to);
};
const nightsBetween = (checkIn, checkOut) => {
  const nights = (new Date(checkOut) - new Date(checkIn)) / 86400000;
  return Math.max(1, Number.isFinite(nights) ? nights : 1);
};


function normalizeWhatsAppPhone(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('0')) phone = phone.slice(1);
  if (phone.length === 10) phone = `91${phone}`;
  return phone;
}

function formatBookingDate(value) {
  const date = dateOnly(value);
  const parts = date.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : date;
}

function formatBookingAmount(value) {
  return money(value).toLocaleString('en-IN');
}

function hotelPhoneNumber() {
  return process.env.HOTEL_PHONE_NUMBER || '+91 75879 00088';
}

function buildBookingWhatsAppMessage(booking) {
  return [
    `Hello ${booking.guest_name},`,
    '',
    'Greetings from Club Sky Park.',
    '',
    'We are pleased to confirm your booking with us.',
    '',
    'Booking Summary:',
    `Booking ID: ${booking.id}`,
    `Room Category: ${booking.room_name || booking.room_type || 'Room'}`,
    `Check-in: ${formatBookingDate(booking.check_in)}`,
    `Check-out: ${formatBookingDate(booking.check_out)}`,
    `No. of Guests: ${booking.guests || 1}`,
    `Total Amount: \u20B9${formatBookingAmount(booking.total_price)}`,
    'Payment Status: Due',
    '',
    'We look forward to welcoming you and making your stay comfortable and memorable.',
    '',
    'For assistance, please contact:',
    hotelPhoneNumber(),
    '',
    'Warm regards,',
    'Team Club SkyPark'
  ].join('\n');
}

function buildBookingWhatsAppTemplatePayload(booking, to) {
  const parameters = [
    booking.guest_name,
    booking.id,
    booking.room_name || booking.room_type || 'Room',
    formatBookingDate(booking.check_in),
    formatBookingDate(booking.check_out),
    booking.guests || 1,
    formatBookingAmount(booking.total_price),
    'Due',
    hotelPhoneNumber()
  ].map((value) => ({ type: 'text', text: String(value) }));

  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: process.env.WHATSAPP_TEMPLATE_NAME,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en' },
      components: [{ type: 'body', parameters }]
    }
  };
}

async function sendBookingWhatsAppConfirmation(booking) {
  const to = normalizeWhatsAppPhone(booking.guest_phone);
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || 'v25.0';
  const message = buildBookingWhatsAppMessage(booking);

  if (!to) return { status: 'skipped', reason: 'missing_guest_phone', message };
  if (!phoneNumberId || !token) return { status: 'not_configured', message };
  if (typeof fetch !== 'function') return { status: 'failed', error: 'Node fetch API is not available.', message };

  const payload = process.env.WHATSAPP_TEMPLATE_NAME
    ? buildBookingWhatsAppTemplatePayload(booking, to)
    : {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: message }
      };

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { status: 'failed', error: data.error?.message || 'WhatsApp API request failed.', details: data, message };
  }

  return { status: 'sent', provider_response: data };
}
const bookingSchema = z.object({
  guest_name: z.string().min(2),
  guest_email: z.string().email(),
  guest_phone: z.string().min(6),
  room_id: z.coerce.number().int().positive().optional().nullable(),
  room_name: z.string().min(1).optional().nullable(),
  booking_type: z.enum(['room', 'event', 'wedding', 'birthday', 'party', 'other']).default('room'),
  event_type: z.string().optional().nullable(),
  purpose: z.string().optional().nullable(),
  guests: z.coerce.number().int().positive().default(1),
  check_in: z.string().min(8),
  check_out: z.string().min(8),
  estimated_checkin_time: z.string().optional().default(''),
  total_price: z.coerce.number().nonnegative(),
  payment_method: z.string().min(2).optional().default('pay_at_hotel'),
  paid_amount: z.coerce.number().nonnegative().optional().default(0),
  payment_reference: z.string().optional().default(''),
  payment_notes: z.string().optional().default('')
});

const roomSchema = z.object({
  floor: z.string().optional().default(''),
  room_number: z.string().min(1),
  room_type: z.string().min(1),
  price: z.coerce.number().nonnegative(),
  status: z.enum(['vacant', 'occupied', 'reserved', 'dirty', 'maintenance']).default('vacant')
});

const documentSchema = z.object({
  document_type: z.string().min(1),
  file_name: z.string().min(1),
  mime_type: z.string().min(1),
  data_url: z.string().min(20)
});

const itemSchema = z.object({
  item_type: z.enum(['restaurant', 'store']),
  name: z.string().min(1),
  category: z.string().optional().default('General'),
  unit: z.string().optional().default('pcs'),
  price: z.coerce.number().nonnegative().default(0),
  cost_price: z.coerce.number().nonnegative().default(0),
  gst_percent: z.coerce.number().min(0).max(100).default(0),
  active: z.boolean().default(true)
});

const storeItemSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional().default('General'),
  unit: z.string().optional().default('pcs'),
  current_stock: z.coerce.number().default(0),
  reorder_level: z.coerce.number().default(0),
  cost_price: z.coerce.number().nonnegative().default(0),
  selling_price: z.coerce.number().nonnegative().default(0),
  gst_percent: z.coerce.number().min(0).max(100).default(0)
});

const receiptSchema = z.object({
  booking_id: z.coerce.number().int().positive().optional().nullable(),
  receipt_type: z.enum(['room_booking', 'event', 'restaurant', 'store', 'misc']).default('room_booking'),
  receipt_date: z.string().optional(),
  customer_name: z.string().min(2),
  customer_email: z.string().email().optional().or(z.literal('')),
  customer_phone: z.string().optional().default(''),
  customer_gstin: z.string().optional().default(''),
  event_type: z.string().optional().default(''),
  event_date: z.string().optional().default(''),
  venue: z.string().optional().default(''),
  payment_method: z.string().optional().default('cash'),
  paid_amount: z.coerce.number().nonnegative().default(0),
  discount_amount: z.coerce.number().nonnegative().default(0),
  notes: z.string().optional().default(''),
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.coerce.number().positive(),
    rate: z.coerce.number().nonnegative(),
    gst_percent: z.coerce.number().min(0).max(100).default(0)
  })).min(1)
});

function withoutPassword(staff) {
  const { password_hash, ...safeStaff } = staff;
  return normalizeStaffPermissions(safeStaff);
}

function can(req, permission) {
  return hasPermission(req.user, permission);
}

function forbidden(res) {
  return res.status(403).json({ error: 'You do not have permission for this action.' });
}

function withRoom(booking) {
  const room = booking.room_id
    ? store.find('rooms', (item) => String(item.id) === String(booking.room_id))
    : null;
  return { ...booking, room_number: room?.room_number || null, room_type: room?.room_type || null };
}

function withBooking(payment) {
  const booking = payment.booking_id
    ? store.find('bookings', (item) => String(item.id) === String(payment.booking_id))
    : null;
  return { ...payment, guest_name: booking?.guest_name || null };
}

function withGuestContext(guest) {
  const room = guest.room_id
    ? store.find('rooms', (item) => String(item.id) === String(guest.room_id))
    : null;
  const booking = guest.booking_id
    ? store.find('bookings', (item) => String(item.id) === String(guest.booking_id))
    : null;
  return {
    ...guest,
    room_number: room?.room_number || null,
    room_type: room?.room_type || null,
    room_rate: room?.price || null,
    booking_number: booking?.id || null,
    booking_status: booking?.status || null
  };
}

function addLedger(data, entry) {
  const item = {
    id: nextId(data.ledger_entries),
    entry_date: entry.entry_date || today(),
    type: entry.type || 'credit',
    source_type: entry.source_type || 'manual',
    source_id: entry.source_id || null,
    description: entry.description || '',
    amount: money(entry.amount),
    payment_method: entry.payment_method || '',
    created_at: now()
  };
  data.ledger_entries.push(item);
  return item;
}

function normalizeRoomNumber(value) {
  return String(value || '').trim().toUpperCase();
}

function parseRoomSelection(value) {
  const rooms = [];
  const source = String(value || '')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\bto\b/gi, '-')
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  source.forEach((part) => {
    const range = part.match(/^([A-Za-z]*)(\d+)\s*-\s*([A-Za-z]*)(\d+)$/);
    if (!range) {
      rooms.push(normalizeRoomNumber(part));
      return;
    }

    const startPrefix = range[1] || '';
    const endPrefix = range[3] || startPrefix;
    const start = Number(range[2]);
    const end = Number(range[4]);
    if (startPrefix.toUpperCase() !== endPrefix.toUpperCase() || !Number.isFinite(start) || !Number.isFinite(end)) {
      rooms.push(normalizeRoomNumber(part));
      return;
    }

    const step = start <= end ? 1 : -1;
    const width = Math.max(range[2].length, range[4].length);
    for (let roomNo = start; step > 0 ? roomNo <= end : roomNo >= end; roomNo += step) {
      rooms.push(normalizeRoomNumber(`${startPrefix}${String(roomNo).padStart(width, '0')}`));
    }
  });

  return [...new Set(rooms)];
}

function localDateTime(dateValue, timeValue = '11:00') {
  const date = dateOnly(dateValue);
  const safeTime = /^\d{2}:\d{2}$/.test(String(timeValue || '')) ? timeValue : '11:00';
  return new Date(`${date}T${safeTime}:00`);
}

function isRoomUnavailable(room) {
  return ['occupied', 'dirty', 'maintenance'].includes(room?.status);
}

function guestExistsForBooking(data, bookingId) {
  return data.guests.some((guest) => String(guest.booking_id) === String(bookingId) && guest.status !== 'cancelled');
}

function availableRoomForBooking(data, booking) {
  if (booking.room_id) {
    const room = data.rooms.find((item) => String(item.id) === String(booking.room_id));
    if (room && (room.status === 'vacant' || room.status === 'reserved')) return room;
  }

  const requestedType = String(booking.room_name || booking.room_type || '').trim().toLowerCase();
  return data.rooms
    .filter((room) => !isRoomUnavailable(room))
    .filter((room) => !requestedType || String(room.room_type || '').trim().toLowerCase() === requestedType)
    .sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true }))[0] || null;
}

function createGuestFromBooking(data, booking, room, options = {}) {
  const guestId = nextId(data.guests);
  const checkInAt = options.checkInAt || now();
  const guest = {
    id: guestId,
    status: 'active',
    bill_type: options.billType || 'gst',
    check_in_no: guestId,
    name: options.name || booking.guest_name,
    email: booking.guest_email || '',
    phone: booking.guest_phone || '',
    contact_2: '',
    dob: '',
    gender: '',
    days: nightsBetween(booking.check_in, booking.check_out),
    adults: Number(booking.guests || 1),
    children: 0,
    room_id: String(room.id),
    booking_id: String(booking.id),
    room_plan: options.roomPlan || 'CP',
    discount_percent: 0,
    discount_amount: 0,
    gst_no: '',
    company: options.company || '',
    department: '',
    designation: '',
    website: '',
    address: '',
    town_city: '',
    postal_code: '',
    state: '',
    country: 'India',
    nationality: 'Indian',
    purpose: booking.purpose || booking.booking_type || '',
    coming_from: '',
    going_to: '',
    vehicle_no: '',
    remark: options.remark || '',
    advance_amount: 0,
    payment_mode: 'pay_at_hotel',
    no_id_required: Boolean(options.noIdRequired || booking.no_id_required),
    grc_required: options.grcRequired !== undefined ? Boolean(options.grcRequired) : booking.grc_required !== false,
    bulk_group_id: booking.bulk_group_id || '',
    bulk_group_name: booking.bulk_group_name || '',
    check_in_date: new Date(checkInAt).toISOString(),
    check_out_date: null,
    created_at: now()
  };

  data.guests.push(guest);

  const roomIndex = data.rooms.findIndex((item) => String(item.id) === String(room.id));
  if (roomIndex >= 0) data.rooms[roomIndex] = { ...data.rooms[roomIndex], status: 'occupied' };

  const bookingIndex = data.bookings.findIndex((item) => String(item.id) === String(booking.id));
  if (bookingIndex >= 0) {
    data.bookings[bookingIndex] = {
      ...data.bookings[bookingIndex],
      room_id: String(room.id),
      room_name: data.bookings[bookingIndex].room_name || room.room_type,
      status: 'checked_in',
      checked_in_guest_id: guestId,
      auto_checkin_at: options.auto ? now() : data.bookings[bookingIndex].auto_checkin_at || ''
    };
  }

  return guest;
}

function shouldAutoCheckin(booking, current = new Date()) {
  if (booking.status !== 'confirmed') return false;
  if (booking.auto_checkin_enabled !== true) return false;
  const estimated = localDateTime(booking.check_in, booking.estimated_checkin_time || '11:00');
  const triggerAt = new Date(estimated.getTime() - 30 * 60 * 1000);
  const checkoutEnd = new Date(`${dateOnly(booking.check_out)}T23:59:59`);
  return current >= triggerAt && current <= checkoutEnd;
}

function runAutoCheckins(data) {
  const current = new Date();
  const created = [];
  data.bookings.forEach((booking) => {
    if (!shouldAutoCheckin(booking, current) || guestExistsForBooking(data, booking.id)) return;
    const room = availableRoomForBooking(data, booking);
    if (!room) {
      const bookingIndex = data.bookings.findIndex((item) => String(item.id) === String(booking.id));
      if (bookingIndex >= 0) data.bookings[bookingIndex] = { ...data.bookings[bookingIndex], auto_checkin_error: 'No available room found for selected category.' };
      return;
    }
    created.push(createGuestFromBooking(data, booking, room, { auto: true, checkInAt: current }));
  });
  return created;
}

function runReservationAutomation(data) {
  runAutoCheckins(data);
  const currentDate = today();
  const activeGuests = new Set(data.guests.filter((guest) => !guest.check_out_date).map((guest) => String(guest.room_id)));
  const activeReservations = new Set(
    data.bookings
      .filter((booking) => booking.room_id && ['reserved', 'confirmed', 'checked_in'].includes(booking.status))
      .filter((booking) => dateOnly(booking.check_out) >= currentDate)
      .map((booking) => String(booking.room_id))
  );

  data.rooms = data.rooms.map((room) => {
    if (room.status === 'maintenance' || room.status === 'dirty') return room;
    if (activeGuests.has(String(room.id))) return { ...room, status: 'occupied' };
    if (activeReservations.has(String(room.id))) return { ...room, status: 'reserved' };
    return { ...room, status: 'vacant' };
  });

  data.bookings = data.bookings.map((booking) => {
    if (!booking.room_id || !['reserved', 'confirmed'].includes(booking.status)) return booking;
    if (dateOnly(booking.check_out) < currentDate) return { ...booking, status: 'completed' };
    return booking;
  });
}

function generateReceiptNumber(data) {
  const year = new Date().getFullYear();
  const maxId = (data.receipts || []).reduce((max, receipt) => Math.max(max, Number(receipt.id || 0)), 0);
  return `CS-${year}-${String(maxId + 1).padStart(4, '0')}`;
}

function calculateReceipt(parsed) {
  const items = parsed.items.map((item) => {
    const taxable = money(item.quantity * item.rate);
    const gst_amount = money(taxable * Number(item.gst_percent || 0) / 100);
    return { ...item, taxable, gst_amount, line_total: money(taxable + gst_amount) };
  });
  const taxable_total = money(items.reduce((sum, item) => sum + item.taxable, 0));
  const gst_total = money(items.reduce((sum, item) => sum + item.gst_amount, 0));
  const grand_total = money(taxable_total + gst_total - Number(parsed.discount_amount || 0));
  const paid_amount = money(parsed.paid_amount);
  return { items, taxable_total, gst_total, grand_total, paid_amount, balance_amount: money(grand_total - paid_amount) };
}

function listReceiptDetails(data, receipt) {
  return {
    ...receipt,
    items: data.receipt_items.filter((item) => String(item.receipt_id) === String(receipt.id))
  };
}

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'club-skypark-backend' });
});

router.post('/auth/login', (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Email and password are required.' });

  const staff = store.find('staff', (item) => item.email === parsed.data.email);
  if (!staff || !bcrypt.compareSync(parsed.data.password, staff.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const user = withoutPassword(staff);
  const token = jwt.sign(user, jwtSecret(), { expiresIn: '12h' });
  res.json({ token, user });
});

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.get('/public/rooms', (req, res) => {
  const rooms = store.transaction((data) => {
    runReservationAutomation(data);
    return data.rooms.sort((a, b) => Number(b.price) - Number(a.price));
  });
  res.json({ rooms });
});

router.post('/public/bookings', async (req, res) => {
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please complete all booking details correctly.' });

  const totalPrice = money(parsed.data.total_price);
  const paidAmount = 0;
  const balanceAmount = totalPrice;
  const paymentStatus = 'due';

  const result = store.transaction((data) => {
    const booking = {
      id: nextId(data.bookings),
      ...parsed.data,
      room_id: parsed.data.room_id ? String(parsed.data.room_id) : null,
      total_price: totalPrice,
      paid_amount: paidAmount,
      balance_amount: balanceAmount,
      payment_method: 'pay_at_hotel',
      payment_reference: '',
      payment_notes: 'Payment due at hotel',
      payment_status: paymentStatus,
      auto_checkin_enabled: true,
      no_id_required: false,
      grc_required: true,
      status: 'pending',
      created_at: now()
    };
    data.bookings.push(booking);
    return { booking, payment: null };
  });

  let whatsapp = null;
  try {
    whatsapp = await sendBookingWhatsAppConfirmation(result.booking);
  } catch (error) {
    console.error('WhatsApp booking confirmation failed:', error);
    whatsapp = { status: 'failed', error: error.message || 'WhatsApp confirmation failed.' };
  }

  res.status(201).json({ ...result, whatsapp });
});

router.post('/public/enquiries', (req, res) => {
  const { name, phone, email, type, message } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!phone || !String(phone).trim()) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }
  const enquiry = store.insert('enquiries', {
    name: String(name).trim(),
    phone: String(phone).trim(),
    email: String(email || '').trim(),
    type: String(type || 'General').trim(),
    message: String(message || '').trim(),
    status: 'new'
  });
  return res.status(201).json({ success: true, enquiry });
});

router.use(requireAuth);
router.use((req, res, next) => {
  store.transaction((data) => {
    runReservationAutomation(data);
    return null;
  });
  next();
});

router.get('/dashboard', requirePermission('dashboard.view'), (req, res) => {
  const reportDate = today();
  const rooms = store.all('rooms');
  const bookings = store.all('bookings');
  const payments = store.all('payments');
  const recentBookings = [...bookings].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5).map(withRoom);

  res.json({
    totalRooms: rooms.length,
    occupied: rooms.filter((room) => room.status === 'occupied').length,
    vacant: rooms.filter((room) => room.status === 'vacant').length,
    reserved: rooms.filter((room) => room.status === 'reserved').length,
    bookingsToday: bookings.filter((booking) => dateOnly(booking.created_at) === reportDate).length,
    revenueToday: payments.filter((payment) => payment.status === 'paid' && dateOnly(payment.created_at) === reportDate).reduce((sum, payment) => sum + Number(payment.amount), 0),
    recentBookings
  });
});

router.get('/bookings', requireAnyPermission('bookings.view', 'dashboard.view'), (req, res) => {
  const bookings = store.all('bookings').sort((a, b) => b.created_at.localeCompare(a.created_at)).map(withRoom);
  res.json({ bookings });
});

router.patch('/bookings/:id/status', (req, res) => {
  const parsed = z.object({ status: z.enum(['pending', 'reserved', 'confirmed', 'cancelled', 'checked_in', 'checked_out', 'completed']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid booking status.' });
  if (parsed.data.status === 'cancelled' && !can(req, 'bookings.cancel')) return forbidden(res);
  if (parsed.data.status !== 'cancelled' && !can(req, 'bookings.edit')) return forbidden(res);

  const result = store.transaction((data) => {
    const bookingIndex = data.bookings.findIndex((booking) => String(booking.id) === String(req.params.id));
    if (bookingIndex === -1) return null;
    data.bookings[bookingIndex] = { ...data.bookings[bookingIndex], status: parsed.data.status };
    let guest = null;
    if (parsed.data.status === 'confirmed' && shouldAutoCheckin(data.bookings[bookingIndex]) && !guestExistsForBooking(data, data.bookings[bookingIndex].id)) {
      const room = availableRoomForBooking(data, data.bookings[bookingIndex]);
      if (room) {
        guest = createGuestFromBooking(data, data.bookings[bookingIndex], room, { auto: true });
      } else {
        data.bookings[bookingIndex] = { ...data.bookings[bookingIndex], auto_checkin_error: 'No available room found for selected category.' };
      }
    }
    return { booking: data.bookings[bookingIndex], guest };
  });
  if (!result) return res.status(404).json({ error: 'Booking not found.' });
  res.json({ booking: withRoom(result.booking), auto_checkin_guest: result.guest ? withGuestContext(result.guest) : null });
});

router.get('/rooms', requireAnyPermission('rooms.view', 'dashboard.view', 'checkin.view', 'checkin.create', 'checkin.room_swap', 'checkout.view', 'checkout.create', 'bookings.view', 'bookings.create', 'bookings.bulk'), (req, res) => {
  const floorOrder = { 'Ground Floor': 0, '1st Floor': 1, '2nd Floor': 2, '3rd Floor': 3 };
  const rooms = store.all('rooms').sort((a, b) => {
    const floorDiff = (floorOrder[a.floor] ?? 99) - (floorOrder[b.floor] ?? 99);
    return floorDiff || String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true });
  });
  res.json({ rooms });
});

router.post('/rooms', requirePermission('rooms.create'), (req, res) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid room details.' });

  const exists = store.find('rooms', (room) => room.room_number === parsed.data.room_number);
  if (exists) return res.status(409).json({ error: 'Room number already exists.' });
  res.status(201).json({ room: store.insert('rooms', parsed.data) });
});

router.patch('/rooms/:id', requireAnyPermission('rooms.edit', 'rooms.status_update'), (req, res) => {
  const parsed = roomSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid room details.' });
  const keys = Object.keys(parsed.data);
  const onlyStatus = keys.length === 1 && keys[0] === 'status';
  if (onlyStatus && !can(req, 'rooms.status_update')) return forbidden(res);
  if (!onlyStatus && !can(req, 'rooms.edit')) return forbidden(res);

  const room = store.update('rooms', req.params.id, parsed.data);
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  res.json({ room });
});

router.delete('/rooms/:id', requirePermission('rooms.delete'), (req, res) => {
  store.delete('rooms', req.params.id);
  res.status(204).end();
});

router.get('/reservations', requireAnyPermission('bookings.view', 'bookings.bulk', 'checkin.view', 'checkin.create', 'checkin.bulk'), (req, res) => {
  const reservations = store.all('bookings')
    .filter((booking) => ['pending', 'reserved', 'confirmed'].includes(booking.status))
    .sort((a, b) => String(a.check_in).localeCompare(String(b.check_in)))
    .map(withRoom);
  res.json({ reservations });
});

router.post('/reservations', requirePermission('bookings.create'), (req, res) => {
  const schema = bookingSchema.extend({ total_price: z.coerce.number().nonnegative().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid reservation details.' });
  if (!parsed.data.room_id) return res.status(400).json({ error: 'Please select a room for reservation.' });

  const room = store.find('rooms', (item) => String(item.id) === String(parsed.data.room_id));
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  if (room.status === 'occupied' || room.status === 'dirty' || room.status === 'maintenance') return res.status(409).json({ error: 'Room is not available.' });

  const total_price = parsed.data.total_price ?? money(Number(room.price) * nightsBetween(parsed.data.check_in, parsed.data.check_out));
  const booking = store.transaction((data) => {
    const item = {
      id: nextId(data.bookings),
      ...parsed.data,
      room_id: String(parsed.data.room_id),
      room_name: parsed.data.room_name || room.room_type,
      total_price,
      paid_amount: 0,
      balance_amount: total_price,
      payment_method: 'pay_at_hotel',
      payment_status: 'due',
      auto_checkin_enabled: false,
      no_id_required: false,
      grc_required: true,
      status: 'reserved',
      created_at: now()
    };
    data.bookings.push(item);
    const roomIndex = data.rooms.findIndex((candidate) => String(candidate.id) === String(parsed.data.room_id));
    data.rooms[roomIndex] = { ...data.rooms[roomIndex], status: 'reserved' };
    return item;
  });
  res.status(201).json({ reservation: withRoom(booking) });
});

router.post('/reservations/bulk', requirePermission('bookings.bulk'), (req, res) => {
  const parsed = z.object({
    guest_name: z.string().min(2),
    guest_email: z.string().email().optional().or(z.literal('')),
    guest_phone: z.string().optional().default(''),
    room_numbers: z.string().min(1),
    booking_type: z.enum(['wedding', 'event', 'party', 'room', 'other']).default('wedding'),
    event_type: z.string().optional().default('Wedding'),
    purpose: z.string().optional().default('Bulk wedding reservation'),
    check_in: z.string().min(8),
    check_out: z.string().min(8),
    estimated_checkin_time: z.string().optional().default(''),
    guests_per_room: z.coerce.number().int().positive().default(1),
    total_price_per_room: z.coerce.number().nonnegative().optional().default(0),
    no_id_required: z.boolean().optional().default(true),
    grc_required: z.boolean().optional().default(false)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid bulk reservation details.' });

  const requestedNumbers = parseRoomSelection(parsed.data.room_numbers);
  if (!requestedNumbers.length) return res.status(400).json({ error: 'Please enter at least one room number.' });

  const result = store.transaction((data) => {
    const byNumber = new Map(data.rooms.map((room) => [normalizeRoomNumber(room.room_number), room]));
    const missing = requestedNumbers.filter((roomNo) => !byNumber.has(roomNo));
    if (missing.length) return { error: `Rooms not found: ${missing.join(', ')}` };

    const unavailable = requestedNumbers
      .map((roomNo) => byNumber.get(roomNo))
      .filter((room) => isRoomUnavailable(room) || room.status === 'reserved');
    if (unavailable.length) return { error: `Rooms not available: ${unavailable.map((room) => room.room_number).join(', ')}` };

    const groupId = `BULK-${Date.now()}`;
    const reservations = requestedNumbers.map((roomNo) => {
      const room = byNumber.get(roomNo);
      const totalPrice = parsed.data.total_price_per_room || money(Number(room.price || 0) * nightsBetween(parsed.data.check_in, parsed.data.check_out));
      const booking = {
        id: nextId(data.bookings),
        guest_name: parsed.data.guest_name,
        guest_email: parsed.data.guest_email || '',
        guest_phone: parsed.data.guest_phone || '',
        room_id: String(room.id),
        room_name: room.room_type,
        booking_type: parsed.data.booking_type,
        event_type: parsed.data.event_type,
        purpose: parsed.data.purpose,
        guests: parsed.data.guests_per_room,
        check_in: parsed.data.check_in,
        check_out: parsed.data.check_out,
        estimated_checkin_time: parsed.data.estimated_checkin_time || '',
        total_price: money(totalPrice),
        payment_method: 'pay_at_hotel',
        paid_amount: 0,
        balance_amount: money(totalPrice),
        payment_status: 'due',
        status: 'reserved',
        bulk_group_id: groupId,
        bulk_group_name: parsed.data.guest_name,
        no_id_required: parsed.data.no_id_required,
        grc_required: parsed.data.grc_required,
        auto_checkin_enabled: false,
        created_at: now()
      };
      data.bookings.push(booking);
      const roomIndex = data.rooms.findIndex((item) => String(item.id) === String(room.id));
      data.rooms[roomIndex] = { ...data.rooms[roomIndex], status: 'reserved' };
      return booking;
    });

    return { group_id: groupId, reservations };
  });

  if (result.error) return res.status(409).json({ error: result.error });
  res.status(201).json({ group_id: result.group_id, reservations: result.reservations.map(withRoom) });
});

router.post('/reservations/bulk/:groupId/checkin', requirePermission('checkin.bulk'), (req, res) => {
  const groupId = req.params.groupId;
  const guests = store.transaction((data) => {
    const bookings = data.bookings.filter((booking) => booking.bulk_group_id === groupId && ['reserved', 'confirmed'].includes(booking.status));
    if (!bookings.length) return null;
    return bookings.map((booking) => {
      const room = availableRoomForBooking(data, booking);
      if (!room) return null;
      return createGuestFromBooking(data, booking, room, {
        checkInAt: now(),
        noIdRequired: true,
        grcRequired: false,
        remark: 'Bulk wedding/group check-in. ID and GRC not required.',
        name: `${booking.guest_name} - ${room.room_number}`
      });
    }).filter(Boolean);
  });

  if (!guests) return res.status(404).json({ error: 'No pending bulk reservations found for this group.' });
  res.status(201).json({ guests: guests.map(withGuestContext) });
});

router.get('/guests', requireAnyPermission('checkin.list', 'checkin.create', 'checkin.room_swap', 'checkout.list', 'documents.view'), (req, res) => {
  const guests = store.all('guests')
    .map(withGuestContext)
    .sort((a, b) => String(b.check_in_date || '').localeCompare(String(a.check_in_date || '')));
  res.json({ guests });
});

router.get('/guests/active', requireAnyPermission('dashboard.view', 'checkin.list', 'checkin.room_swap', 'checkout.view', 'checkout.list', 'restaurant.view'), (req, res) => {
  const guests = store.all('guests')
    .filter((guest) => !guest.check_out_date && guest.status !== 'cancelled')
    .map(withGuestContext)
    .sort((a, b) => String(b.check_in_date || '').localeCompare(String(a.check_in_date || '')));
  res.json({ guests });
});

router.patch('/guests/:id/cancel', requirePermission('checkin.cancel'), (req, res) => {
  const guest = store.find('guests', (item) => String(item.id) === String(req.params.id));
  if (!guest) return res.status(404).json({ error: 'Guest check-in not found.' });
  if (guest.status === 'cancelled') return res.status(409).json({ error: 'Check-in is already cancelled.' });

  const cancelled = store.transaction((data) => {
    const guestIndex = data.guests.findIndex((item) => String(item.id) === String(guest.id));
    data.guests[guestIndex] = {
      ...data.guests[guestIndex],
      status: 'cancelled',
      cancelled_at: now(),
      check_out_date: data.guests[guestIndex].check_out_date || now()
    };

    const roomIndex = data.rooms.findIndex((room) => String(room.id) === String(guest.room_id));
    if (roomIndex >= 0 && data.rooms[roomIndex].status !== 'maintenance') {
      data.rooms[roomIndex] = { ...data.rooms[roomIndex], status: 'dirty' };
    }

    if (guest.booking_id) {
      const bookingIndex = data.bookings.findIndex((booking) => String(booking.id) === String(guest.booking_id));
      if (bookingIndex >= 0) data.bookings[bookingIndex] = { ...data.bookings[bookingIndex], status: 'cancelled' };
    }

    return data.guests[guestIndex];
  });

  res.json({ guest: withGuestContext(cancelled) });
});

router.patch('/guests/:id/room-swap', requirePermission('checkin.room_swap'), (req, res) => {
  const parsed = z.object({
    new_room_id: z.coerce.number().int().positive(),
    remark: z.string().optional().default('')
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Please select a valid room for swap.' });

  const result = store.transaction((data) => {
    const guestIndex = data.guests.findIndex((item) => String(item.id) === String(req.params.id) && !item.check_out_date && item.status !== 'cancelled');
    if (guestIndex === -1) return { error: 'Active guest not found.', status: 404 };

    const guest = data.guests[guestIndex];
    const currentRoomIndex = data.rooms.findIndex((room) => String(room.id) === String(guest.room_id));
    const newRoomIndex = data.rooms.findIndex((room) => String(room.id) === String(parsed.data.new_room_id));
    if (currentRoomIndex === -1 || newRoomIndex === -1) return { error: 'Room not found.', status: 404 };

    const currentRoom = data.rooms[currentRoomIndex];
    const newRoom = data.rooms[newRoomIndex];
    if (String(currentRoom.id) === String(newRoom.id)) return { error: 'Please select a different room.', status: 400 };
    if (String(currentRoom.room_type || '').toLowerCase() !== String(newRoom.room_type || '').toLowerCase()) {
      return { error: 'Room swap is allowed only within the same room category.', status: 409 };
    }
    if (!['vacant', 'reserved'].includes(newRoom.status)) {
      return { error: 'Selected room is not available for swap.', status: 409 };
    }

    const swapRecord = {
      from_room_id: String(currentRoom.id),
      from_room_number: currentRoom.room_number,
      to_room_id: String(newRoom.id),
      to_room_number: newRoom.room_number,
      room_type: currentRoom.room_type,
      swapped_by: req.user.email,
      swapped_at: now(),
      remark: parsed.data.remark || ''
    };

    data.guests[guestIndex] = {
      ...guest,
      room_id: String(newRoom.id),
      room_swaps: [...(Array.isArray(guest.room_swaps) ? guest.room_swaps : []), swapRecord]
    };

    data.rooms[currentRoomIndex] = { ...currentRoom, status: currentRoom.status === 'maintenance' ? 'maintenance' : 'dirty' };
    data.rooms[newRoomIndex] = { ...newRoom, status: 'occupied' };

    if (guest.booking_id) {
      const bookingIndex = data.bookings.findIndex((booking) => String(booking.id) === String(guest.booking_id));
      if (bookingIndex >= 0) {
        data.bookings[bookingIndex] = {
          ...data.bookings[bookingIndex],
          room_id: String(newRoom.id),
          room_name: data.bookings[bookingIndex].room_name || newRoom.room_type
        };
      }
    }

    return { guest: data.guests[guestIndex] };
  });

  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json({ guest: withGuestContext(result.guest) });
});

router.post('/checkins', requirePermission('checkin.create'), (req, res) => {
  const parsed = z.object({
    bill_type: z.enum(['gst', 'without_gst']).default('gst'),
    check_in_no: z.string().optional().default(''),
    check_in_at: z.string().optional(),
    name: z.string().min(2),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional().default(''),
    contact_2: z.string().optional().default(''),
    dob: z.string().optional().default(''),
    gender: z.string().optional().default('male'),
    days: z.coerce.number().int().nonnegative().optional().default(1),
    adults: z.coerce.number().int().nonnegative().optional().default(1),
    children: z.coerce.number().int().nonnegative().optional().default(0),
    room_id: z.coerce.number().int().positive(),
    booking_id: z.coerce.number().int().positive().optional().nullable(),
    room_plan: z.string().optional().default(''),
    discount_percent: z.coerce.number().nonnegative().optional().default(0),
    discount_amount: z.coerce.number().nonnegative().optional().default(0),
    gst_no: z.string().optional().default(''),
    company: z.string().optional().default(''),
    department: z.string().optional().default(''),
    designation: z.string().optional().default(''),
    website: z.string().optional().default(''),
    address: z.string().optional().default(''),
    town_city: z.string().optional().default(''),
    postal_code: z.string().optional().default(''),
    state: z.string().optional().default(''),
    country: z.string().optional().default(''),
    nationality: z.string().optional().default(''),
    purpose: z.string().optional().default(''),
    coming_from: z.string().optional().default(''),
    going_to: z.string().optional().default(''),
    vehicle_no: z.string().optional().default(''),
    remark: z.string().optional().default(''),
    advance_amount: z.coerce.number().nonnegative().optional().default(0),
    payment_mode: z.string().optional().default('cash'),
    documents: z.array(documentSchema).optional().default([])
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid guest details.' });

  const room = store.find('rooms', (item) => String(item.id) === String(parsed.data.room_id));
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  if (room.status === 'occupied' || room.status === 'dirty' || room.status === 'maintenance') return res.status(409).json({ error: 'Room is not available for check-in.' });

  const guest = store.transaction((data) => {
    const guestId = nextId(data.guests);
    const item = {
      id: guestId,
      status: 'active',
      bill_type: parsed.data.bill_type,
      check_in_no: parsed.data.check_in_no || guestId,
      name: parsed.data.name,
      email: parsed.data.email || '',
      phone: parsed.data.phone || '',
      contact_2: parsed.data.contact_2 || '',
      dob: parsed.data.dob || '',
      gender: parsed.data.gender || 'male',
      days: parsed.data.days || 1,
      adults: parsed.data.adults || 1,
      children: parsed.data.children || 0,
      room_id: String(parsed.data.room_id),
      booking_id: parsed.data.booking_id ? String(parsed.data.booking_id) : null,
      room_plan: parsed.data.room_plan || '',
      discount_percent: money(parsed.data.discount_percent),
      discount_amount: money(parsed.data.discount_amount),
      gst_no: parsed.data.gst_no || '',
      company: parsed.data.company || '',
      department: parsed.data.department || '',
      designation: parsed.data.designation || '',
      website: parsed.data.website || '',
      address: parsed.data.address || '',
      town_city: parsed.data.town_city || '',
      postal_code: parsed.data.postal_code || '',
      state: parsed.data.state || '',
      country: parsed.data.country || '',
      nationality: parsed.data.nationality || '',
      purpose: parsed.data.purpose || '',
      coming_from: parsed.data.coming_from || '',
      going_to: parsed.data.going_to || '',
      vehicle_no: parsed.data.vehicle_no || '',
      remark: parsed.data.remark || '',
      advance_amount: money(parsed.data.advance_amount),
      payment_mode: parsed.data.payment_mode || 'cash',
      check_in_date: parsed.data.check_in_at ? new Date(parsed.data.check_in_at).toISOString() : now(),
      check_out_date: null,
      created_at: now()
    };
    data.guests.push(item);

    parsed.data.documents.forEach((doc) => {
      data.guest_documents.push({ id: nextId(data.guest_documents), guest_id: item.id, ...doc, uploaded_at: now(), created_at: now() });
    });

    const roomIndex = data.rooms.findIndex((candidate) => String(candidate.id) === String(parsed.data.room_id));
    data.rooms[roomIndex] = { ...data.rooms[roomIndex], status: 'occupied' };

    if (parsed.data.booking_id) {
      const bookingIndex = data.bookings.findIndex((booking) => String(booking.id) === String(parsed.data.booking_id));
      if (bookingIndex >= 0) data.bookings[bookingIndex] = { ...data.bookings[bookingIndex], status: 'checked_in' };
    }

    if (Number(parsed.data.advance_amount || 0) > 0) {
      const amount = money(parsed.data.advance_amount);
      data.payments.push({
        id: nextId(data.payments),
        booking_id: parsed.data.booking_id ? String(parsed.data.booking_id) : null,
        amount,
        method: parsed.data.payment_mode || 'cash',
        status: 'paid',
        created_at: now()
      });
      addLedger(data, {
        type: 'credit',
        source_type: 'checkin_advance',
        source_id: item.id,
        description: `Advance amount from ${item.name}`,
        amount,
        payment_method: parsed.data.payment_mode || 'cash'
      });
    }

    return item;
  });

  res.status(201).json({ guest: withGuestContext(guest) });
});

router.post('/checkins/bulk', requirePermission('checkin.create'), (req, res) => {
  const parsed = z.object({
    bill_type: z.enum(['gst', 'without_gst']).default('gst'),
    check_in_no: z.string().optional().default(''),
    check_in_at: z.string().optional(),
    name: z.string().min(2),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional().default(''),
    contact_2: z.string().optional().default(''),
    dob: z.string().optional().default(''),
    gender: z.string().optional().default('male'),
    days: z.coerce.number().int().nonnegative().optional().default(1),
    adults: z.coerce.number().int().nonnegative().optional().default(1),
    children: z.coerce.number().int().nonnegative().optional().default(0),
    room_ids: z.array(z.coerce.number().int().positive()).min(1),
    booking_id: z.coerce.number().int().positive().optional().nullable(),
    room_plan: z.string().optional().default('CP'),
    discount_percent: z.coerce.number().nonnegative().optional().default(0),
    discount_amount: z.coerce.number().nonnegative().optional().default(0),
    per_room_details: z.array(z.object({
      room_id: z.coerce.number().int().positive(),
      room_plan: z.string().optional().default('CP'),
      discount_percent: z.coerce.number().nonnegative().optional().default(0),
      discount_amount: z.coerce.number().nonnegative().optional().default(0)
    })).optional().default([]),
    gst_no: z.string().optional().default(''),
    company: z.string().optional().default(''),
    department: z.string().optional().default(''),
    designation: z.string().optional().default(''),
    website: z.string().optional().default(''),
    address: z.string().optional().default(''),
    town_city: z.string().optional().default(''),
    postal_code: z.string().optional().default(''),
    state: z.string().optional().default(''),
    country: z.string().optional().default(''),
    nationality: z.string().optional().default(''),
    purpose: z.string().optional().default(''),
    coming_from: z.string().optional().default(''),
    going_to: z.string().optional().default(''),
    vehicle_no: z.string().optional().default(''),
    remark: z.string().optional().default(''),
    advance_amount: z.coerce.number().nonnegative().optional().default(0),
    payment_mode: z.string().optional().default('cash'),
    documents: z.array(documentSchema).optional().default([])
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid group check-in details.' });

  const roomIds = [...new Set(parsed.data.room_ids.map((id) => String(id)))];
  const rooms = roomIds.map((id) => store.find('rooms', (item) => String(item.id) === id));
  if (rooms.some((room) => !room)) return res.status(404).json({ error: 'One or more selected rooms were not found.' });
  const unavailable = rooms.find((room) => ['occupied', 'dirty', 'maintenance'].includes(room.status));
  if (unavailable) return res.status(409).json({ error: `Room ${unavailable.room_number} is not available for check-in.` });

  const result = store.transaction((data) => {
    const detailByRoom = new Map(parsed.data.per_room_details.map((detail) => [String(detail.room_id), detail]));
    const groupCheckinId = `GCI-${parsed.data.check_in_no || nextId(data.guests)}-${Date.now()}`;
    const checkInNo = parsed.data.check_in_no || String(nextId(data.guests));
    const checkInDate = parsed.data.check_in_at ? new Date(parsed.data.check_in_at).toISOString() : now();
    const createdAt = now();
    let primaryGuestId = null;
    const guests = [];

    roomIds.forEach((roomId) => {
      const guestId = nextId(data.guests);
      if (!primaryGuestId) primaryGuestId = guestId;
      const roomDetail = detailByRoom.get(String(roomId)) || {};
      const item = {
        id: guestId,
        status: 'active',
        bill_type: parsed.data.bill_type,
        check_in_no: checkInNo,
        group_checkin_id: groupCheckinId,
        group_primary_guest_id: String(primaryGuestId),
        group_room_count: roomIds.length,
        is_group_primary: guestId === primaryGuestId,
        name: parsed.data.name,
        email: parsed.data.email || '',
        phone: parsed.data.phone || '',
        contact_2: parsed.data.contact_2 || '',
        dob: parsed.data.dob || '',
        gender: parsed.data.gender || 'male',
        days: parsed.data.days || 1,
        adults: parsed.data.adults || 1,
        children: parsed.data.children || 0,
        room_id: String(roomId),
        booking_id: parsed.data.booking_id ? String(parsed.data.booking_id) : null,
        room_plan: roomDetail.room_plan || parsed.data.room_plan || 'CP',
        discount_percent: money(roomDetail.discount_percent ?? parsed.data.discount_percent),
        discount_amount: money(roomDetail.discount_amount ?? parsed.data.discount_amount),
        gst_no: parsed.data.gst_no || '',
        company: parsed.data.company || '',
        department: parsed.data.department || '',
        designation: parsed.data.designation || '',
        website: parsed.data.website || '',
        address: parsed.data.address || '',
        town_city: parsed.data.town_city || '',
        postal_code: parsed.data.postal_code || '',
        state: parsed.data.state || '',
        country: parsed.data.country || '',
        nationality: parsed.data.nationality || '',
        purpose: parsed.data.purpose || '',
        coming_from: parsed.data.coming_from || '',
        going_to: parsed.data.going_to || '',
        vehicle_no: parsed.data.vehicle_no || '',
        remark: parsed.data.remark || '',
        advance_amount: guestId === primaryGuestId ? money(parsed.data.advance_amount) : 0,
        payment_mode: parsed.data.payment_mode || 'cash',
        check_in_date: checkInDate,
        check_out_date: null,
        created_at: createdAt
      };

      data.guests.push(item);
      guests.push(item);

      const roomIndex = data.rooms.findIndex((candidate) => String(candidate.id) === String(roomId));
      if (roomIndex >= 0) data.rooms[roomIndex] = { ...data.rooms[roomIndex], status: 'occupied' };
    });

    parsed.data.documents.forEach((doc) => {
      data.guest_documents.push({ id: nextId(data.guest_documents), guest_id: primaryGuestId, ...doc, uploaded_at: now(), created_at: now() });
    });

    if (parsed.data.booking_id) {
      const bookingIndex = data.bookings.findIndex((booking) => String(booking.id) === String(parsed.data.booking_id));
      if (bookingIndex >= 0) data.bookings[bookingIndex] = { ...data.bookings[bookingIndex], status: 'checked_in', room_id: String(roomIds[0]) };
    }

    if (Number(parsed.data.advance_amount || 0) > 0) {
      const amount = money(parsed.data.advance_amount);
      data.payments.push({
        id: nextId(data.payments),
        booking_id: parsed.data.booking_id ? String(parsed.data.booking_id) : null,
        amount,
        method: parsed.data.payment_mode || 'cash',
        status: 'paid',
        created_at: now()
      });
      addLedger(data, {
        type: 'credit',
        source_type: 'group_checkin_advance',
        source_id: primaryGuestId,
        description: `Advance amount from ${parsed.data.name} for ${roomIds.length} rooms`,
        amount,
        payment_method: parsed.data.payment_mode || 'cash'
      });
    }

    return { guest: guests[0], guests };
  });

  res.status(201).json({ guest: withGuestContext(result.guest), guests: result.guests.map(withGuestContext) });
});

router.get('/checkouts', requirePermission('checkout.list'), (req, res) => {
  const status = req.query.status || '';
  let guests = store.all('guests').filter((guest) => guest.check_out_date);
  if (status === 'cancelled') {
    guests = guests.filter((guest) => guest.status === 'checkout_cancelled');
  } else if (status === 'completed') {
    guests = guests.filter((guest) => guest.status !== 'checkout_cancelled');
  }
  res.json({
    guests: guests
      .map(withGuestContext)
      .sort((a, b) => String(b.check_out_date || '').localeCompare(String(a.check_out_date || '')))
  });
});

router.post('/checkouts/:guestId', requirePermission('checkout.create'), (req, res) => {
  const parsed = z.object({
    checkout_at: z.string().optional(),
    room_rent: z.coerce.number().nonnegative().optional().default(0),
    food_charges: z.coerce.number().nonnegative().optional().default(0),
    gst_amount: z.coerce.number().nonnegative().optional().default(0),
    total_bill_amount: z.coerce.number().nonnegative().optional().default(0),
    less_advance: z.coerce.number().nonnegative().optional().default(0),
    net_payable: z.coerce.number().nonnegative().optional().default(0),
    discount_amount: z.coerce.number().nonnegative().optional().default(0),
    pay_after_discount: z.coerce.number().nonnegative().optional().default(0),
    payment_mode: z.string().optional().default('cash'),
    remark: z.string().optional().default(''),
    food_items: z.array(z.object({
      name: z.string().optional().default('Item'),
      item_amount: z.coerce.number().nonnegative().optional().default(0),
      quantity: z.coerce.number().nonnegative().optional().default(1),
      amount: z.coerce.number().nonnegative().optional().default(0),
      gst_percent: z.coerce.number().nonnegative().optional().default(0),
      total: z.coerce.number().nonnegative().optional().default(0),
      date: z.string().optional().default('')
    })).optional().default([])
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Invalid checkout details.' });
  if (Number(parsed.data.discount_amount || 0) > 0 && !can(req, 'checkout.discount')) return forbidden(res);

  const guest = store.find('guests', (item) => String(item.id) === String(req.params.guestId) && !item.check_out_date && item.status !== 'cancelled');
  if (!guest) return res.status(404).json({ error: 'Active guest not found.' });

  const updated = store.transaction((data) => {
    const guestIndex = data.guests.findIndex((item) => String(item.id) === String(guest.id));
    const checkoutAt = parsed.data.checkout_at ? new Date(parsed.data.checkout_at).toISOString() : now();
    const payable = money(parsed.data.pay_after_discount || parsed.data.net_payable || parsed.data.total_bill_amount);

    data.guests[guestIndex] = {
      ...data.guests[guestIndex],
      status: 'checked_out',
      check_out_date: checkoutAt,
      checkout_room_rent: money(parsed.data.room_rent),
      checkout_food_charges: money(parsed.data.food_charges),
      checkout_gst_amount: money(parsed.data.gst_amount),
      checkout_total_bill_amount: money(parsed.data.total_bill_amount),
      checkout_less_advance: money(parsed.data.less_advance),
      checkout_net_payable: money(parsed.data.net_payable),
      checkout_discount_amount: money(parsed.data.discount_amount),
      checkout_pay_after_discount: payable,
      checkout_payment_mode: parsed.data.payment_mode || 'cash',
      checkout_remark: parsed.data.remark || '',
      checkout_food_items: parsed.data.food_items.map((item) => ({
        name: item.name || 'Item',
        item_amount: money(item.item_amount),
        quantity: Number(item.quantity || 1),
        amount: money(item.amount),
        gst_percent: Number(item.gst_percent || 0),
        total: money(item.total),
        date: item.date || ''
      }))
    };

    const roomIndex = data.rooms.findIndex((room) => String(room.id) === String(guest.room_id));
    if (roomIndex >= 0 && data.rooms[roomIndex].status !== 'maintenance') {
      data.rooms[roomIndex] = { ...data.rooms[roomIndex], status: 'dirty' };
    }

    if (guest.booking_id) {
      const bookingIndex = data.bookings.findIndex((booking) => String(booking.id) === String(guest.booking_id));
      if (bookingIndex >= 0) data.bookings[bookingIndex] = { ...data.bookings[bookingIndex], status: 'checked_out' };
    }

    if (payable > 0 && parsed.data.payment_mode !== 'credit') {
      const payment = {
        id: nextId(data.payments),
        booking_id: guest.booking_id ? String(guest.booking_id) : null,
        amount: payable,
        method: parsed.data.payment_mode || 'cash',
        status: 'paid',
        created_at: now()
      };
      data.payments.push(payment);
      addLedger(data, {
        source_type: 'checkout',
        source_id: guest.id,
        description: `Checkout payment from ${guest.name}`,
        amount: payable,
        payment_method: parsed.data.payment_mode || 'cash'
      });
    }

    return data.guests[guestIndex];
  });

  res.json({ guest: withGuestContext(updated) });
});

router.patch('/checkouts/:guestId/cancel', requirePermission('checkout.cancel'), (req, res) => {
  const guest = store.find('guests', (item) => String(item.id) === String(req.params.guestId) && item.check_out_date);
  if (!guest) return res.status(404).json({ error: 'Completed checkout not found.' });
  if (guest.status === 'checkout_cancelled') return res.status(409).json({ error: 'Checkout is already cancelled.' });

  const updated = store.transaction((data) => {
    const guestIndex = data.guests.findIndex((item) => String(item.id) === String(guest.id));
    data.guests[guestIndex] = {
      ...data.guests[guestIndex],
      status: 'checkout_cancelled',
      checkout_cancelled_at: now()
    };
    return data.guests[guestIndex];
  });

  res.json({ guest: withGuestContext(updated) });
});
router.get('/guests/:id/documents', requirePermission('documents.view'), (req, res) => {
  const documents = store.all('guest_documents')
    .filter((doc) => String(doc.guest_id) === String(req.params.id))
    .map(({ data_url, ...doc }) => doc);
  res.json({ documents });
});

router.post('/guest-documents', requirePermission('documents.upload'), (req, res) => {
  const parsed = documentSchema.extend({ guest_id: z.coerce.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid document details.' });
  const guest = store.find('guests', (item) => String(item.id) === String(parsed.data.guest_id));
  if (!guest) return res.status(404).json({ error: 'Guest not found.' });
  const document = store.insert('guest_documents', { ...parsed.data, guest_id: String(parsed.data.guest_id), uploaded_at: now() });
  const { data_url, ...safeDocument } = document;
  res.status(201).json({ document: safeDocument });
});

router.get('/guest-documents/:id/download', requirePermission('documents.download'), (req, res) => {
  const doc = store.find('guest_documents', (item) => String(item.id) === String(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  const base64 = doc.data_url.includes(',') ? doc.data_url.split(',')[1] : doc.data_url;
  res.setHeader('Content-Type', doc.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`);
  res.send(Buffer.from(base64, 'base64'));
});

router.get('/payments', requirePermission('payments.view'), (req, res) => {
  const payments = store.all('payments').sort((a, b) => b.created_at.localeCompare(a.created_at)).map(withBooking);
  res.json({ payments });
});

router.post('/payments', requirePermission('payments.create'), (req, res) => {
  const parsed = z.object({
    booking_id: z.coerce.number().int().positive().optional().nullable(),
    amount: z.coerce.number().nonnegative(),
    method: z.string().min(2),
    status: z.enum(['pending', 'paid', 'failed', 'refunded']).default('paid')
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payment details.' });

  const payment = store.transaction((data) => {
    const item = { id: nextId(data.payments), ...parsed.data, booking_id: parsed.data.booking_id ? String(parsed.data.booking_id) : null, created_at: now() };
    data.payments.push(item);
    if (item.status === 'paid') {
      addLedger(data, { source_type: 'payment', source_id: item.id, description: 'Payment received', amount: item.amount, payment_method: item.method });
    }
    return item;
  });
  res.status(201).json({ payment });
});

router.get('/restaurant-orders', requirePermission('restaurant.view'), (req, res) => {
  const orders = store.all('restaurant_orders').sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({ orders });
});

router.post('/restaurant-orders', requireAnyPermission('restaurant.create_order', 'restaurant.update_status', 'restaurant.mark_paid'), (req, res) => {
  const parsed = z.object({
    table_number: z.string().optional().default(''),
    guest_id: z.coerce.number().int().positive().optional().nullable(),
    room_id: z.coerce.number().int().positive().optional().nullable(),
    items: z.array(z.object({
      item_id: z.coerce.number().int().positive().optional().nullable(),
      name: z.string().optional(),
      quantity: z.coerce.number().int().positive(),
      price: z.coerce.number().nonnegative().optional()
    })).min(1),
    status: z.enum(['pending', 'preparing', 'served', 'paid']).default('pending'),
    payment_method: z.string().optional().default('cash')
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid restaurant order.' });
  if (parsed.data.status === 'paid' && !can(req, 'restaurant.mark_paid')) return forbidden(res);
  if (parsed.data.status !== 'pending' && parsed.data.status !== 'paid' && !can(req, 'restaurant.update_status')) return forbidden(res);
  if (!can(req, 'restaurant.create_order')) return forbidden(res);

  const order = store.transaction((data) => {
    const guest = parsed.data.guest_id
      ? data.guests.find((item) => String(item.id) === String(parsed.data.guest_id) && !item.check_out_date && item.status !== 'cancelled')
      : null;
    const room = guest?.room_id
      ? data.rooms.find((item) => String(item.id) === String(guest.room_id))
      : parsed.data.room_id
        ? data.rooms.find((item) => String(item.id) === String(parsed.data.room_id))
        : null;
    const tableNumber = String(parsed.data.table_number || room?.room_number || '').trim();
    if (!tableNumber) return { error: 'Table or room number is required.' };

    const items = parsed.data.items.map((line) => {
      const master = line.item_id ? data.items.find((item) => String(item.id) === String(line.item_id)) : null;
      return {
        item_id: line.item_id ? String(line.item_id) : null,
        name: line.name || master?.name || 'Item',
        category: master?.category || 'General',
        quantity: Number(line.quantity),
        price: Number(line.price ?? master?.price ?? 0),
        gst_percent: Number(master?.gst_percent || 0)
      };
    });
    const total = money(items.reduce((sum, item) => sum + item.quantity * item.price, 0));
    const item = {
      id: nextId(data.restaurant_orders),
      table_number: tableNumber,
      guest_id: guest ? String(guest.id) : null,
      room_id: room ? String(room.id) : (parsed.data.room_id ? String(parsed.data.room_id) : null),
      room_number: room?.room_number || tableNumber,
      guest_name: guest?.name || '',
      items,
      total,
      status: parsed.data.status,
      created_at: now()
    };
    data.restaurant_orders.push(item);
    if (item.status === 'paid') addLedger(data, { source_type: 'restaurant_order', source_id: item.id, description: `Restaurant order table ${item.table_number}`, amount: total, payment_method: parsed.data.payment_method });
    return item;
  });
  if (order?.error) return res.status(400).json({ error: order.error });
  res.status(201).json({ order });
});

router.get('/items', requireAnyPermission('items.view', 'restaurant.view'), (req, res) => {
  const type = req.query.type;
  const items = store.all('items').filter((item) => !type || item.item_type === type).sort((a, b) => a.name.localeCompare(b.name));
  res.json({ items });
});

router.post('/items', requirePermission('items.create'), (req, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid item details.' });
  res.status(201).json({ item: store.insert('items', parsed.data) });
});

router.patch('/items/:id', requirePermission('items.edit'), (req, res) => {
  const parsed = itemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid item details.' });
  const item = store.update('items', req.params.id, parsed.data);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  res.json({ item });
});

router.get('/store-items', requirePermission('store.view'), (req, res) => {
  const items = store.all('store_items').sort((a, b) => a.name.localeCompare(b.name));
  res.json({ items });
});

router.post('/store-items', requirePermission('store.create'), (req, res) => {
  const parsed = storeItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid store item details.' });
  const item = store.insert('store_items', parsed.data);
  res.status(201).json({ item });
});

router.patch('/store-items/:id', requirePermission('store.edit'), (req, res) => {
  const parsed = storeItemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid store item details.' });
  const item = store.update('store_items', req.params.id, parsed.data);
  if (!item) return res.status(404).json({ error: 'Store item not found.' });
  res.json({ item });
});

router.post('/store-items/:id/movements', requirePermission('store.update_stock'), (req, res) => {
  const parsed = z.object({
    movement_type: z.enum(['in', 'out', 'adjustment', 'closing']),
    quantity: z.coerce.number(),
    reason: z.string().optional().default(''),
    note: z.string().optional().default(''),
    movement_date: z.string().optional().default(today())
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid stock movement.' });

  const movement = store.transaction((data) => {
    const itemIndex = data.store_items.findIndex((item) => String(item.id) === String(req.params.id));
    if (itemIndex === -1) return null;
    const current = Number(data.store_items[itemIndex].current_stock || 0);
    let next = current;
    if (parsed.data.movement_type === 'in') next = current + Number(parsed.data.quantity);
    if (parsed.data.movement_type === 'out') next = current - Number(parsed.data.quantity);
    if (parsed.data.movement_type === 'adjustment' || parsed.data.movement_type === 'closing') next = Number(parsed.data.quantity);
    data.store_items[itemIndex] = { ...data.store_items[itemIndex], current_stock: next };
    const record = { id: nextId(data.stock_movements), store_item_id: String(req.params.id), previous_stock: current, new_stock: next, ...parsed.data, created_at: now() };
    data.stock_movements.push(record);
    return record;
  });
  if (!movement) return res.status(404).json({ error: 'Store item not found.' });
  res.status(201).json({ movement });
});

router.get('/stock-movements', requirePermission('store.view'), (req, res) => {
  const date = req.query.date;
  const movements = store.all('stock_movements')
    .filter((movement) => !date || dateOnly(movement.movement_date || movement.created_at) === date)
    .map((movement) => {
      const item = store.find('store_items', (candidate) => String(candidate.id) === String(movement.store_item_id));
      return { ...movement, item_name: item?.name || null };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({ movements });
});

router.get('/receipts', requirePermission('receipts.view'), (req, res) => {
  const data = { receipts: store.all('receipts'), receipt_items: store.all('receipt_items') };
  const receipts = data.receipts.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((receipt) => listReceiptDetails(data, receipt));
  res.json({ receipts });
});

router.get('/receipts/:id', requirePermission('receipts.view'), (req, res) => {
  const data = { receipts: store.all('receipts'), receipt_items: store.all('receipt_items') };
  const receipt = data.receipts.find((item) => String(item.id) === String(req.params.id));
  if (!receipt) return res.status(404).json({ error: 'Receipt not found.' });
  res.json({ receipt: listReceiptDetails(data, receipt) });
});

router.post('/receipts', requirePermission('receipts.create'), (req, res) => {
  const parsed = receiptSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid receipt details.' });
  const totals = calculateReceipt(parsed.data);

  const receipt = store.transaction((data) => {
    const item = {
      id: nextId(data.receipts),
      receipt_number: generateReceiptNumber(data),
      booking_id: parsed.data.booking_id ? String(parsed.data.booking_id) : null,
      receipt_type: parsed.data.receipt_type,
      receipt_date: parsed.data.receipt_date || today(),
      customer_name: parsed.data.customer_name,
      customer_email: parsed.data.customer_email || '',
      customer_phone: parsed.data.customer_phone || '',
      customer_gstin: parsed.data.customer_gstin || '',
      event_type: parsed.data.event_type || '',
      event_date: parsed.data.event_date || '',
      venue: parsed.data.venue || '',
      payment_method: parsed.data.payment_method || 'cash',
      discount_amount: money(parsed.data.discount_amount),
      taxable_total: totals.taxable_total,
      gst_total: totals.gst_total,
      grand_total: totals.grand_total,
      paid_amount: totals.paid_amount,
      balance_amount: totals.balance_amount,
      notes: parsed.data.notes || '',
      created_at: now()
    };
    data.receipts.push(item);
    totals.items.forEach((line) => data.receipt_items.push({ id: nextId(data.receipt_items), receipt_id: item.id, ...line, created_at: now() }));
    if (item.paid_amount > 0) {
      const payment = { id: nextId(data.payments), booking_id: item.booking_id, amount: item.paid_amount, method: item.payment_method, status: 'paid', created_at: now() };
      data.payments.push(payment);
      addLedger(data, { source_type: 'receipt', source_id: item.id, description: `Receipt ${item.receipt_number}`, amount: item.paid_amount, payment_method: item.payment_method, entry_date: item.receipt_date });
    }
    return listReceiptDetails(data, item);
  });

  res.status(201).json({ receipt });
});

router.get('/ledger', requirePermission('ledger.view'), (req, res) => {
  const from = req.query.from || req.query.date;
  const to = req.query.to || req.query.date;
  const entries = store.all('ledger_entries').filter((entry) => inRange(entry.entry_date || entry.created_at, from, to)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const credit = money(entries.filter((entry) => entry.type === 'credit').reduce((sum, entry) => sum + Number(entry.amount), 0));
  const debit = money(entries.filter((entry) => entry.type === 'debit').reduce((sum, entry) => sum + Number(entry.amount), 0));
  res.json({ entries, summary: { credit, debit, balance: money(credit - debit) } });
});

router.post('/ledger', requirePermission('ledger.create'), (req, res) => {
  const parsed = z.object({
    entry_date: z.string().optional().default(today()),
    type: z.enum(['credit', 'debit']),
    description: z.string().min(1),
    amount: z.coerce.number().nonnegative(),
    payment_method: z.string().optional().default('cash')
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid ledger entry.' });
  const entry = store.transaction((data) => addLedger(data, parsed.data));
  res.status(201).json({ entry });
});

router.get('/reports/daily', requireAnyPermission('reports.daily', 'dashboard.view'), (req, res) => {
  const reportDate = req.query.date || today();
  const rooms = store.all('rooms');
  const guests = store.all('guests');
  const orders = store.all('restaurant_orders').filter((order) => dateOnly(order.created_at) === reportDate);
  const movements = store.all('stock_movements').filter((movement) => dateOnly(movement.movement_date || movement.created_at) === reportDate);
  const receipts = store.all('receipts').filter((receipt) => dateOnly(receipt.receipt_date || receipt.created_at) === reportDate);
  const ledger = store.all('ledger_entries').filter((entry) => dateOnly(entry.entry_date || entry.created_at) === reportDate);
  const reservations = store.all('bookings').filter((booking) => dateOnly(booking.created_at) === reportDate || dateOnly(booking.check_in) === reportDate).map(withRoom);
  const checkins = guests.filter((guest) => dateOnly(guest.check_in_date) === reportDate);
  const checkouts = guests.filter((guest) => guest.status !== 'checkout_cancelled' && dateOnly(guest.check_out_date) === reportDate);

  res.json({
    date: reportDate,
    summary: {
      checkins: checkins.length,
      checkouts: checkouts.length,
      reservations: reservations.length,
      occupied_rooms: rooms.filter((room) => room.status === 'occupied').length,
      reserved_rooms: rooms.filter((room) => room.status === 'reserved').length,
      vacant_rooms: rooms.filter((room) => room.status === 'vacant').length,
      dirty_rooms: rooms.filter((room) => room.status === 'dirty').length,
      restaurant_orders: orders.length,
      stock_updates: movements.length,
      receipt_total: money(receipts.reduce((sum, receipt) => sum + Number(receipt.grand_total), 0)),
      cash_received: money(ledger.filter((entry) => entry.type === 'credit').reduce((sum, entry) => sum + Number(entry.amount), 0))
    },
    checkins,
    checkouts,
    reservations,
    restaurant_orders: orders,
    stock_movements: movements,
    receipts,
    ledger_entries: ledger
  });
});

router.post('/reports/daily/close', requirePermission('reports.close_day'), (req, res) => {
  const reportDate = req.body?.date || today();
  if (reportDate >= today()) {
    return res.status(400).json({ error: 'Day can be closed only after that calendar date has ended according to this computer clock.' });
  }
  const existing = store.find('daily_report_closings', (closing) => closing.date === reportDate);
  if (existing) return res.status(409).json({ error: 'Daily report already closed for this date.' });
  const closing = store.insert('daily_report_closings', { date: reportDate, closed_by: req.user.email, closed_at: now() });
  res.status(201).json({ closing });
});

router.get('/reports/gst', requirePermission('reports.gst'), (req, res) => {
  const from = req.query.from || today();
  const to = req.query.to || from;
  const receipts = store.all('receipts').filter((receipt) => inRange(receipt.receipt_date || receipt.created_at, from, to));
  const receiptItems = store.all('receipt_items');
  const rows = [];

  receipts.forEach((receipt) => {
    receiptItems.filter((line) => String(line.receipt_id) === String(receipt.id)).forEach((line) => {
      const gst = money(line.gst_amount);
      rows.push({
        date: receipt.receipt_date,
        receipt_number: receipt.receipt_number,
        customer_name: receipt.customer_name,
        customer_gstin: receipt.customer_gstin,
        description: line.description,
        taxable_value: money(line.taxable),
        gst_percent: Number(line.gst_percent || 0),
        cgst: money(gst / 2),
        sgst: money(gst / 2),
        igst: 0,
        total_gst: gst,
        line_total: money(line.line_total)
      });
    });
  });

  const summary = rows.reduce((acc, row) => {
    acc.taxable_value = money(acc.taxable_value + row.taxable_value);
    acc.cgst = money(acc.cgst + row.cgst);
    acc.sgst = money(acc.sgst + row.sgst);
    acc.igst = money(acc.igst + row.igst);
    acc.total_gst = money(acc.total_gst + row.total_gst);
    acc.grand_total = money(acc.grand_total + row.line_total);
    return acc;
  }, { taxable_value: 0, cgst: 0, sgst: 0, igst: 0, total_gst: 0, grand_total: 0 });

  res.json({ from, to, summary, rows });
});

router.get('/staff', requireAnyPermission('staff.view', 'staff.create', 'staff.edit', 'staff.permissions'), (req, res) => {
  const staff = store.all('staff').map(withoutPassword).sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({ staff, permissionGroups });
});

router.post('/staff', requirePermission('staff.create'), (req, res) => {
  const parsed = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['super_admin', 'manager', 'restaurant', 'reception']),
    permissions: z.array(z.string()).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid staff details.' });

  const exists = store.find('staff', (staff) => staff.email === parsed.data.email);
  if (exists) return res.status(409).json({ error: 'Staff email already exists.' });

  const staff = store.insert('staff', {
    name: parsed.data.name,
    email: parsed.data.email,
    password_hash: bcrypt.hashSync(parsed.data.password, 10),
    role: parsed.data.role,
    permissions: normalizePermissions(parsed.data.permissions, parsed.data.role)
  });
  res.status(201).json({ staff: withoutPassword(staff) });
});

router.patch('/staff/:id', requireAnyPermission('staff.edit', 'staff.permissions'), (req, res) => {
  const parsed = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional().or(z.literal('')),
    role: z.enum(['super_admin', 'manager', 'restaurant', 'reception']).optional(),
    permissions: z.array(z.string()).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid staff details.' });

  const current = store.find('staff', (staff) => String(staff.id) === String(req.params.id));
  if (!current) return res.status(404).json({ error: 'Staff member not found.' });
  if (parsed.data.permissions && !can(req, 'staff.permissions')) return forbidden(res);
  if ((parsed.data.name || parsed.data.email || parsed.data.password || parsed.data.role) && !can(req, 'staff.edit')) return forbidden(res);

  const nextRole = parsed.data.role || current.role;
  const changes = {};
  ['name', 'email', 'role'].forEach((key) => {
    if (parsed.data[key]) changes[key] = parsed.data[key];
  });
  if (parsed.data.password) changes.password_hash = bcrypt.hashSync(parsed.data.password, 10);
  if (parsed.data.permissions || parsed.data.role) {
    changes.permissions = normalizePermissions(parsed.data.permissions || defaultPermissionsForRole(nextRole), nextRole);
  }

  const updated = store.update('staff', req.params.id, changes);
  res.json({ staff: withoutPassword(updated) });
});

router.runAutomations = () => store.transaction((data) => {
  runReservationAutomation(data);
  return null;
});

// ===== PMS SPRINT FEATURES: GUESTS, OPERATIONS, ANALYTICS & PRINTING =====

const housekeepingChecklist = ['Beds', 'Dusting', 'Cleaning', 'Bathroom', 'Amenities', 'AC', 'Water', 'Lights'];

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function listByDate(table, field, from, to) {
  return store.all(table).filter((item) => inRange(item[field] || item.created_at, from, to));
}

function resolveGuest(data, id) {
  return data.guests.find((guest) => String(guest.id) === String(id))
    || data.guests.find((guest) => String(guest.booking_id) === String(id));
}

function guestBookingHistory(data, guest) {
  const phone = String(guest.phone || guest.guest_phone || '').trim();
  const email = String(guest.email || guest.guest_email || '').trim().toLowerCase();
  return data.bookings.filter((booking) => (
    String(booking.id) === String(guest.booking_id)
    || (phone && String(booking.guest_phone || '').trim() === phone)
    || (email && String(booking.guest_email || '').trim().toLowerCase() === email)
  ));
}

function guestProfile(data, guest) {
  const history = guestBookingHistory(data, guest);
  const preferences = data.guest_preferences.find((item) => String(item.guest_id) === String(guest.id)) || null;
  const notes = data.guest_notes.filter((item) => String(item.guest_id) === String(guest.id));
  const flags = data.guest_flags.filter((item) => String(item.guest_id) === String(guest.id) && item.active !== false);
  const loyalty = data.loyalty_members.find((item) => String(item.guest_id) === String(guest.id)) || null;
  const totalSpent = history.reduce((sum, booking) => sum + numeric(booking.total_price), 0)
    + data.payments
      .filter((payment) => history.some((booking) => String(booking.id) === String(payment.booking_id)))
      .reduce((sum, payment) => sum + numeric(payment.amount), 0);
  return {
    ...withGuestContext(guest),
    booking_history: history,
    preferences,
    notes,
    flags,
    loyalty,
    segment: preferences?.segment || (loyalty?.tier ? loyalty.tier : totalSpent >= 50000 ? 'vip' : 'regular'),
    total_spent: money(totalSpent)
  };
}

function chargeServiceToGuest(data, sourceType, sourceId, guestId, amount, description) {
  const chargeAmount = money(amount);
  if (!guestId || chargeAmount <= 0) return null;
  const guest = data.guests.find((item) => String(item.id) === String(guestId));
  const charge = {
    id: nextId(data.guest_service_charges),
    guest_id: String(guestId),
    booking_id: guest?.booking_id || '',
    source_type: sourceType,
    source_id: String(sourceId),
    description,
    amount: chargeAmount,
    status: 'unbilled',
    created_at: now()
  };
  data.guest_service_charges.push(charge);
  return charge;
}

function loyaltyTier(points) {
  if (points > 1500) return 'platinum';
  if (points > 500) return 'gold';
  return 'silver';
}

function applyPricing(room, checkIn, checkOut, rules) {
  const nights = nightsBetween(checkIn, checkOut);
  let nightlyRate = numeric(room.price);
  const applicable = rules.filter((rule) => {
    if (rule.active === false) return false;
    if (rule.room_type && rule.room_type !== 'all' && rule.room_type !== room.room_type) return false;
    if (rule.from_date && dateOnly(checkIn) < dateOnly(rule.from_date)) return false;
    if (rule.to_date && dateOnly(checkIn) > dateOnly(rule.to_date)) return false;
    if (numeric(rule.min_nights, 1) > nights) return false;
    return true;
  });
  applicable.forEach((rule) => {
    nightlyRate *= numeric(rule.rate_multiplier, 1);
    nightlyRate *= (1 - numeric(rule.discount_percent) / 100);
    nightlyRate -= numeric(rule.flat_discount);
  });
  nightlyRate = Math.max(0, money(nightlyRate));
  return { room_id: room.id, room_type: room.room_type, base_rate: money(room.price), nightly_rate: nightlyRate, nights, total: money(nightlyRate * nights), applicable_rules: applicable };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function rupee(value) {
  return `&#8377;${money(value).toFixed(2)}`;
}

function ddmmyyyy(value) {
  const date = dateOnly(value || today());
  const parts = date.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : escapeHtml(value || '');
}

function rows(items, cells) {
  return items.map((item) => `<tr>${cells.map((cell) => `<td>${cell(item)}</td>`).join('')}</tr>`).join('');
}

function printPage(title, body) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)} | Club Skypark</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { margin: 0; color: #111; font-family: Arial, sans-serif; font-size: 12px; background: #fff; }
    .sheet { min-height: 267mm; border: 1px solid #111; padding: 18px; box-sizing: border-box; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 14px; }
    .brand { text-align: center; flex: 1; }
    .brand h1 { margin: 0; font-size: 25px; letter-spacing: 2px; }
    .brand p { margin: 3px 0; font-size: 11px; }
    h2 { margin: 12px 0; text-align: center; font-size: 18px; text-transform: uppercase; }
    h3 { margin: 14px 0 8px; font-size: 13px; border-bottom: 1px solid #999; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; }
    th, td { border: 1px solid #777; padding: 6px; vertical-align: top; }
    th { background: #eee; text-align: left; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .line { display: flex; justify-content: space-between; border-bottom: 1px solid #ccc; padding: 5px 0; gap: 12px; }
    .label { font-weight: 700; }
    .right { text-align: right; }
    .totals { width: 42%; margin-left: auto; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 36px; text-align: center; }
    .sig { padding-top: 36px; border-top: 1px solid #111; }
    .muted { color: #555; font-size: 11px; }
    @media print { .no-print { display: none; } body { background: #fff; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div style="width: 25%;">GST NO: 23AAOFC4777E1ZC</div>
      <div class="brand"><h1>CLUB SKYPARK</h1><p>Hotel & Resort</p><p>Manasa Road, Neemuch (MP) 458441</p><p>+91 75879 00088 | clubskyparkhotel@gmail.com</p></div>
      <div style="width: 25%; text-align: right;">Date: ${ddmmyyyy(today())}</div>
    </div>
    ${body}
  </div>
</body>
</html>`;
}

function sendPrint(res, title, html, req, sourceType, sourceId) {
  store.insert('print_logs', { title, source_type: sourceType, source_id: sourceId || '', printed_by_staff_id: req.user?.id || '', printed_at: now() });
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

// Guest profiles
router.get('/guest-profiles', requirePermission('bookings.view'), (req, res) => {
  const profiles = store.transaction((data) => data.guests.map((guest) => guestProfile(data, guest)));
  res.json({ profiles });
});

router.get('/guest-profiles/:id', requirePermission('bookings.view'), (req, res) => {
  const profile = store.transaction((data) => {
    const guest = resolveGuest(data, req.params.id);
    return guest ? guestProfile(data, guest) : null;
  });
  if (!profile) return res.status(404).json({ error: 'Guest profile not found.' });
  res.json({ profile });
});

router.patch('/guest-profiles/:id/preferences', requirePermission('bookings.edit'), (req, res) => {
  const parsed = z.object({
    room_preference: z.string().optional().default(''),
    bed_type: z.string().optional().default(''),
    meal_preference: z.string().optional().default(''),
    special_requests: z.string().optional().default(''),
    preferred_contact: z.string().optional().default('phone'),
    segment: z.enum(['regular', 'vip']).optional().default('regular'),
    notes: z.string().optional().default('')
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Invalid guest preference details.' });

  const preference = store.transaction((data) => {
    const guest = resolveGuest(data, req.params.id);
    if (!guest) return null;
    const existingIndex = data.guest_preferences.findIndex((item) => String(item.guest_id) === String(guest.id));
    const next = { ...parsed.data, guest_id: String(guest.id), updated_at: now() };
    if (existingIndex >= 0) {
      data.guest_preferences[existingIndex] = { ...data.guest_preferences[existingIndex], ...next };
      return data.guest_preferences[existingIndex];
    }
    const created = { id: nextId(data.guest_preferences), ...next, created_at: now() };
    data.guest_preferences.push(created);
    return created;
  });
  if (!preference) return res.status(404).json({ error: 'Guest not found.' });
  res.json({ preference });
});

router.post('/guest-profiles/:id/notes', requirePermission('bookings.edit'), (req, res) => {
  const note = store.transaction((data) => {
    const guest = resolveGuest(data, req.params.id);
    if (!guest) return null;
    const created = { id: nextId(data.guest_notes), guest_id: String(guest.id), note: String(req.body?.note || ''), created_by_staff_id: req.user.id, created_at: now() };
    data.guest_notes.push(created);
    return created;
  });
  if (!note) return res.status(404).json({ error: 'Guest not found.' });
  res.status(201).json({ note });
});

router.post('/guest-profiles/:id/flags', requirePermission('bookings.edit'), (req, res) => {
  const flag = store.transaction((data) => {
    const guest = resolveGuest(data, req.params.id);
    if (!guest) return null;
    const created = {
      id: nextId(data.guest_flags),
      guest_id: String(guest.id),
      label: String(req.body?.label || 'Important'),
      severity: req.body?.severity || 'normal',
      active: req.body?.active !== false,
      created_by_staff_id: req.user.id,
      created_at: now()
    };
    data.guest_flags.push(created);
    return created;
  });
  if (!flag) return res.status(404).json({ error: 'Guest not found.' });
  res.status(201).json({ flag });
});

// Housekeeping and maintenance
router.get('/housekeeping/tasks', requirePermission('housekeeping.view'), (req, res) => {
  const from = req.query.from || req.query.date || today();
  const to = req.query.to || from;
  const tasks = store.transaction((data) => data.housekeeping_tasks
    .filter((task) => inRange(task.task_date || task.created_at, from, to))
    .map((task) => ({ ...task, room: data.rooms.find((room) => String(room.id) === String(task.room_id)) || null, staff: data.staff.find((staff) => String(staff.id) === String(task.assigned_to_staff_id)) || null })));
  res.json({ from, to, tasks });
});

router.post('/housekeeping/tasks', requirePermission('housekeeping.create'), (req, res) => {
  const parsed = z.object({
    room_id: z.string().min(1),
    assigned_to_staff_id: z.string().optional().default(''),
    task_date: z.string().optional().default(today()),
    priority: z.enum(['urgent', 'normal', 'scheduled']).optional().default('normal'),
    checklist: z.array(z.string()).optional().default(housekeepingChecklist),
    notes: z.string().optional().default('')
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Invalid housekeeping task.' });
  const task = store.insert('housekeeping_tasks', {
    ...parsed.data,
    status: 'pending',
    started_at: '',
    completed_at: '',
    quality_checked_at: '',
    quality_checked_by_staff_id: ''
  });
  res.status(201).json({ task });
});

router.patch('/housekeeping/tasks/:id', requirePermission('housekeeping.edit'), (req, res) => {
  const updates = {};
  ['status', 'assigned_to_staff_id', 'priority', 'notes'].forEach((key) => {
    if (req.body?.[key] !== undefined) updates[key] = req.body[key];
  });
  if (req.body?.checklist) updates.checklist = req.body.checklist;
  if (req.body?.status === 'in_progress' && !updates.started_at) updates.started_at = now();
  if (req.body?.status === 'completed') updates.completed_at = now();
  if (req.body?.quality_checked_by_staff_id) {
    updates.quality_checked_by_staff_id = req.body.quality_checked_by_staff_id;
    updates.quality_checked_at = now();
  }
  const task = store.update('housekeeping_tasks', req.params.id, updates);
  if (!task) return res.status(404).json({ error: 'Housekeeping task not found.' });
  res.json({ task });
});

router.get('/maintenance-requests', requirePermission('housekeeping.maintenance'), (req, res) => {
  const requests = store.all('maintenance_requests').sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  res.json({ requests });
});

router.post('/maintenance-requests', requirePermission('housekeeping.maintenance'), (req, res) => {
  const request = store.insert('maintenance_requests', {
    room_id: req.body?.room_id || '',
    title: req.body?.title || 'Maintenance request',
    description: req.body?.description || '',
    priority: req.body?.priority || 'normal',
    status: 'open',
    requested_by_staff_id: req.user.id,
    scheduled_for: req.body?.scheduled_for || '',
    resolved_at: ''
  });
  res.status(201).json({ request });
});

router.patch('/maintenance-requests/:id', requirePermission('housekeeping.maintenance'), (req, res) => {
  const updates = {};
  ['status', 'priority', 'assigned_to_staff_id', 'scheduled_for', 'notes'].forEach((key) => {
    if (req.body?.[key] !== undefined) updates[key] = req.body[key];
  });
  if (req.body?.status === 'resolved') updates.resolved_at = now();
  const request = store.update('maintenance_requests', req.params.id, updates);
  if (!request) return res.status(404).json({ error: 'Maintenance request not found.' });
  res.json({ request });
});

router.put('/rooms/:id/status', requirePermission('rooms.status_update'), (req, res) => {
  const validStatuses = ['vacant', 'occupied', 'reserved', 'dirty', 'maintenance'];
  if (!validStatuses.includes(req.body?.status)) return res.status(400).json({ error: 'Invalid room status.' });
  const result = store.transaction((data) => {
    const roomIndex = data.rooms.findIndex((room) => String(room.id) === String(req.params.id));
    if (roomIndex < 0) return null;
    const previous = data.rooms[roomIndex].status;
    data.rooms[roomIndex] = { ...data.rooms[roomIndex], status: req.body.status };
    data.room_status_history.push({
      id: nextId(data.room_status_history),
      room_id: String(req.params.id),
      previous_status: previous,
      new_status: req.body.status,
      changed_by_staff_id: req.user.id,
      reason: req.body?.reason || '',
      changed_at: now(),
      created_at: now()
    });
    return data.rooms[roomIndex];
  });
  if (!result) return res.status(404).json({ error: 'Room not found.' });
  res.json({ room: result });
});

// Laundry, room service and minibar
router.get('/laundry/orders', requirePermission('services.view'), (req, res) => {
  res.json({ orders: store.all('laundry_orders') });
});

router.post('/laundry/orders', requirePermission('services.create'), (req, res) => {
  const order = store.transaction((data) => {
    const created = {
      id: nextId(data.laundry_orders),
      guest_id: req.body?.guest_id || '',
      booking_id: req.body?.booking_id || '',
      items: Array.isArray(req.body?.items) ? req.body.items : [],
      pickup_at: req.body?.pickup_at || now(),
      expected_delivery: req.body?.expected_delivery || localDateTime(today(), '18:00').toISOString(),
      delivered_at: '',
      status: 'pending',
      charge: money(req.body?.charge),
      notes: req.body?.notes || '',
      created_at: now()
    };
    data.laundry_orders.push(created);
    if (req.body?.charge_to_room !== false) chargeServiceToGuest(data, 'laundry', created.id, created.guest_id, created.charge, 'Laundry order');
    return created;
  });
  res.status(201).json({ order });
});

router.patch('/laundry/orders/:id', requirePermission('services.edit'), (req, res) => {
  const updates = {};
  ['status', 'notes', 'expected_delivery'].forEach((key) => {
    if (req.body?.[key] !== undefined) updates[key] = req.body[key];
  });
  if (req.body?.status === 'delivered') updates.delivered_at = now();
  const order = store.update('laundry_orders', req.params.id, updates);
  if (!order) return res.status(404).json({ error: 'Laundry order not found.' });
  res.json({ order });
});

router.get('/room-service/orders', requirePermission('services.view'), (req, res) => {
  res.json({ orders: store.all('room_service_orders') });
});

router.post('/room-service/orders', requirePermission('services.create'), (req, res) => {
  const order = store.transaction((data) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const total = money(req.body?.total_amount || items.reduce((sum, item) => sum + numeric(item.quantity, 1) * numeric(item.price || item.rate), 0));
    const created = {
      id: nextId(data.room_service_orders),
      guest_id: req.body?.guest_id || '',
      booking_id: req.body?.booking_id || '',
      room_id: req.body?.room_id || '',
      items,
      special_requests: req.body?.special_requests || '',
      requested_at: now(),
      expected_delivery: req.body?.expected_delivery || localDateTime(today(), '11:30').toISOString(),
      delivered_at: '',
      status: 'pending',
      total_amount: total,
      charge_to_room: req.body?.charge_to_room !== false,
      created_at: now()
    };
    data.room_service_orders.push(created);
    if (created.charge_to_room) chargeServiceToGuest(data, 'room_service', created.id, created.guest_id, total, 'Room service order');
    return created;
  });
  res.status(201).json({ order });
});

router.patch('/room-service/orders/:id', requirePermission('services.edit'), (req, res) => {
  const updates = {};
  ['status', 'special_requests', 'expected_delivery'].forEach((key) => {
    if (req.body?.[key] !== undefined) updates[key] = req.body[key];
  });
  if (req.body?.status === 'delivered') updates.delivered_at = now();
  const order = store.update('room_service_orders', req.params.id, updates);
  if (!order) return res.status(404).json({ error: 'Room service order not found.' });
  res.json({ order });
});

router.get('/minibar/items', requirePermission('services.view'), (req, res) => {
  res.json({ items: store.all('minibar_items') });
});

router.post('/minibar/items', requirePermission('services.create'), (req, res) => {
  const item = store.transaction((data) => {
    const created = {
      id: nextId(data.minibar_items),
      guest_id: req.body?.guest_id || '',
      booking_id: req.body?.booking_id || '',
      room_id: req.body?.room_id || '',
      item_name: req.body?.item_name || 'Minibar item',
      quantity: numeric(req.body?.quantity, 1),
      price: money(req.body?.price),
      consumed_at: req.body?.consumed_at || now(),
      created_at: now()
    };
    data.minibar_items.push(created);
    chargeServiceToGuest(data, 'minibar', created.id, created.guest_id, created.price * created.quantity, `Minibar: ${created.item_name}`);
    return created;
  });
  res.status(201).json({ item });
});

router.get('/guest-service-charges', requirePermission('services.view'), (req, res) => {
  res.json({ charges: store.all('guest_service_charges') });
});

// Staff scheduling and attendance
router.get('/staff-schedules', requirePermission('staff.schedule'), (req, res) => {
  const from = req.query.from || req.query.date || today();
  const to = req.query.to || from;
  res.json({ from, to, schedules: listByDate('staff_schedules', 'shift_date', from, to) });
});

router.post('/staff-schedules', requirePermission('staff.schedule'), (req, res) => {
  const schedule = store.insert('staff_schedules', {
    staff_id: req.body?.staff_id || '',
    shift_date: req.body?.shift_date || today(),
    shift_type: req.body?.shift_type || 'morning',
    shift_start: req.body?.shift_start || '06:00',
    shift_end: req.body?.shift_end || '14:00',
    location: req.body?.location || '',
    status: 'scheduled',
    notes: req.body?.notes || '',
    assigned_by_staff_id: req.user.id
  });
  res.status(201).json({ schedule });
});

router.patch('/staff-schedules/:id', requirePermission('staff.schedule'), (req, res) => {
  const updates = {};
  ['shift_date', 'shift_type', 'shift_start', 'shift_end', 'location', 'status', 'notes', 'staff_id'].forEach((key) => {
    if (req.body?.[key] !== undefined) updates[key] = req.body[key];
  });
  const schedule = store.update('staff_schedules', req.params.id, updates);
  if (!schedule) return res.status(404).json({ error: 'Staff schedule not found.' });
  res.json({ schedule });
});

router.get('/staff-attendance', requirePermission('staff.attendance'), (req, res) => {
  const from = req.query.from || req.query.date || today();
  const to = req.query.to || from;
  res.json({ from, to, attendance: listByDate('staff_attendance', 'date', from, to) });
});

router.post('/staff-attendance', requirePermission('staff.attendance'), (req, res) => {
  const attendance = store.insert('staff_attendance', {
    staff_id: req.body?.staff_id || '',
    date: req.body?.date || today(),
    clock_in: req.body?.clock_in || now(),
    clock_out: req.body?.clock_out || '',
    status: req.body?.status || 'present',
    notes: req.body?.notes || ''
  });
  res.status(201).json({ attendance });
});

router.patch('/staff-attendance/:id', requirePermission('staff.attendance'), (req, res) => {
  const updates = {};
  ['clock_in', 'clock_out', 'status', 'notes'].forEach((key) => {
    if (req.body?.[key] !== undefined) updates[key] = req.body[key];
  });
  const attendance = store.update('staff_attendance', req.params.id, updates);
  if (!attendance) return res.status(404).json({ error: 'Attendance record not found.' });
  res.json({ attendance });
});

router.get('/staff-rosters', requirePermission('staff.schedule'), (req, res) => {
  res.json({ rosters: store.all('staff_rosters') });
});

router.post('/staff-rosters', requirePermission('staff.schedule'), (req, res) => {
  const roster = store.insert('staff_rosters', {
    roster_name: req.body?.roster_name || `Roster ${today()}`,
    from_date: req.body?.from_date || today(),
    to_date: req.body?.to_date || today(),
    coverage_notes: req.body?.coverage_notes || '',
    shifts: Array.isArray(req.body?.shifts) ? req.body.shifts : [],
    created_by_staff_id: req.user.id
  });
  res.status(201).json({ roster });
});

// Suppliers and inventory
router.get('/suppliers', requirePermission('store.suppliers'), (req, res) => {
  res.json({ suppliers: store.all('suppliers') });
});

router.post('/suppliers', requirePermission('store.suppliers'), (req, res) => {
  const supplier = store.insert('suppliers', {
    name: req.body?.name || '',
    contact_person: req.body?.contact_person || '',
    phone: req.body?.phone || '',
    email: req.body?.email || '',
    address: req.body?.address || '',
    gstin: req.body?.gstin || '',
    notes: req.body?.notes || '',
    active: req.body?.active !== false
  });
  res.status(201).json({ supplier });
});

router.patch('/suppliers/:id', requirePermission('store.suppliers'), (req, res) => {
  const supplier = store.update('suppliers', req.params.id, req.body || {});
  if (!supplier) return res.status(404).json({ error: 'Supplier not found.' });
  res.json({ supplier });
});

router.get('/inventory/items', requirePermission('store.view'), (req, res) => {
  const items = store.transaction((data) => data.inventory_items.map((item) => ({
    ...item,
    supplier: item.supplier_id ? data.suppliers.find((supplier) => String(supplier.id) === String(item.supplier_id)) || null : null,
    low_stock: numeric(item.current_stock) <= numeric(item.minimum_level || item.reorder_level)
  })));
  res.json({ items });
});

router.post('/inventory/items', requirePermission('store.create'), (req, res) => {
  const item = store.insert('inventory_items', {
    category: req.body?.category || 'General',
    name: req.body?.name || '',
    unit: req.body?.unit || 'pcs',
    current_stock: numeric(req.body?.current_stock),
    minimum_level: numeric(req.body?.minimum_level || req.body?.reorder_level),
    reorder_qty: numeric(req.body?.reorder_qty),
    unit_cost: money(req.body?.unit_cost || req.body?.cost_price),
    supplier_id: req.body?.supplier_id || '',
    expiry_date: req.body?.expiry_date || '',
    active: req.body?.active !== false
  });
  res.status(201).json({ item });
});

router.patch('/inventory/items/:id', requirePermission('store.edit'), (req, res) => {
  const item = store.update('inventory_items', req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: 'Inventory item not found.' });
  res.json({ item });
});

router.post('/inventory/movements', requirePermission('store.update_stock'), (req, res) => {
  const result = store.transaction((data) => {
    const itemIndex = data.inventory_items.findIndex((item) => String(item.id) === String(req.body?.item_id));
    if (itemIndex < 0) return null;
    const quantity = numeric(req.body?.quantity);
    const type = req.body?.movement_type || 'in';
    const previousStock = numeric(data.inventory_items[itemIndex].current_stock);
    const nextStock = type === 'in' ? previousStock + quantity : Math.max(0, previousStock - quantity);
    const movement = {
      id: nextId(data.inventory_movements),
      item_id: String(req.body.item_id),
      movement_type: type,
      quantity,
      previous_stock: previousStock,
      new_stock: nextStock,
      reason: req.body?.reason || '',
      reference_id: req.body?.reference_id || '',
      recorded_by_staff_id: req.user.id,
      recorded_at: now(),
      created_at: now()
    };
    data.inventory_items[itemIndex] = { ...data.inventory_items[itemIndex], current_stock: nextStock };
    data.inventory_movements.push(movement);
    return movement;
  });
  if (!result) return res.status(404).json({ error: 'Inventory item not found.' });
  res.status(201).json({ movement: result });
});

router.get('/inventory/movements', requirePermission('store.view'), (req, res) => {
  const from = req.query.from || '';
  const to = req.query.to || '';
  const movements = store.all('inventory_movements').filter((movement) => inRange(movement.recorded_at || movement.created_at, from, to));
  res.json({ movements });
});

router.post('/inventory/wastage', requirePermission('store.wastage'), (req, res) => {
  const result = store.transaction((data) => {
    const item = data.inventory_items.find((entry) => String(entry.id) === String(req.body?.item_id));
    if (!item) return null;
    const wastage = {
      id: nextId(data.inventory_wastage),
      item_id: String(item.id),
      quantity: numeric(req.body?.quantity),
      reason: req.body?.reason || '',
      wastage_date: req.body?.wastage_date || today(),
      recorded_by_staff_id: req.user.id,
      created_at: now()
    };
    data.inventory_wastage.push(wastage);
    item.current_stock = Math.max(0, numeric(item.current_stock) - wastage.quantity);
    return wastage;
  });
  if (!result) return res.status(404).json({ error: 'Inventory item not found.' });
  res.status(201).json({ wastage: result });
});

router.get('/inventory/alerts', requirePermission('store.view'), (req, res) => {
  const todayValue = today();
  const items = store.all('inventory_items');
  res.json({
    low_stock: items.filter((item) => numeric(item.current_stock) <= numeric(item.minimum_level || item.reorder_level)),
    expiring: items.filter((item) => item.expiry_date && item.expiry_date >= todayValue && item.expiry_date <= localDateValue(new Date(Date.now() + 7 * 86400000)))
  });
});

// Loyalty
router.get('/loyalty/members', requirePermission('loyalty.view'), (req, res) => {
  res.json({ members: store.all('loyalty_members') });
});

router.post('/loyalty/members', requirePermission('loyalty.create'), (req, res) => {
  const member = store.insert('loyalty_members', {
    guest_id: req.body?.guest_id || '',
    phone: req.body?.phone || '',
    tier: 'silver',
    points: 0,
    total_spent: 0,
    joined_at: now(),
    active: true
  });
  res.status(201).json({ member });
});

router.post('/loyalty/points', requirePermission('loyalty.points'), (req, res) => {
  const result = store.transaction((data) => {
    const memberIndex = data.loyalty_members.findIndex((member) => String(member.id) === String(req.body?.member_id) || String(member.guest_id) === String(req.body?.guest_id));
    if (memberIndex < 0) return null;
    const points = numeric(req.body?.points);
    const record = {
      id: nextId(data.loyalty_points),
      member_id: String(data.loyalty_members[memberIndex].id),
      points,
      type: req.body?.type || 'earned',
      source: req.body?.source || 'manual',
      reason: req.body?.reason || '',
      recorded_by_staff_id: req.user.id,
      recorded_at: now(),
      created_at: now()
    };
    data.loyalty_points.push(record);
    const nextPoints = Math.max(0, numeric(data.loyalty_members[memberIndex].points) + points);
    data.loyalty_members[memberIndex] = {
      ...data.loyalty_members[memberIndex],
      points: nextPoints,
      total_spent: req.body?.type === 'earned' ? money(numeric(data.loyalty_members[memberIndex].total_spent) + Math.max(points, 0)) : numeric(data.loyalty_members[memberIndex].total_spent),
      tier: loyaltyTier(nextPoints)
    };
    return { points_record: record, member: data.loyalty_members[memberIndex] };
  });
  if (!result) return res.status(404).json({ error: 'Loyalty member not found.' });
  res.status(201).json(result);
});

router.post('/loyalty/vouchers', requirePermission('loyalty.points'), (req, res) => {
  const voucher = store.insert('loyalty_vouchers', {
    member_id: req.body?.member_id || '',
    code: req.body?.code || `CSP-${Date.now()}`,
    value: money(req.body?.value),
    status: 'active',
    expires_on: req.body?.expires_on || '',
    notes: req.body?.notes || ''
  });
  res.status(201).json({ voucher });
});

// Dynamic pricing
router.get('/pricing-rules', requirePermission('pricing.view'), (req, res) => {
  res.json({ rules: store.all('pricing_rules') });
});

router.post('/pricing-rules', requirePermission('pricing.create'), (req, res) => {
  const rule = store.insert('pricing_rules', {
    name: req.body?.name || 'Pricing rule',
    room_type: req.body?.room_type || 'all',
    rule_type: req.body?.rule_type || 'seasonal',
    rate_multiplier: numeric(req.body?.rate_multiplier, 1),
    discount_percent: numeric(req.body?.discount_percent),
    flat_discount: numeric(req.body?.flat_discount),
    min_nights: numeric(req.body?.min_nights, 1),
    from_date: req.body?.from_date || today(),
    to_date: req.body?.to_date || '',
    description: req.body?.description || '',
    active: req.body?.active !== false
  });
  res.status(201).json({ rule });
});

router.patch('/pricing-rules/:id', requirePermission('pricing.edit'), (req, res) => {
  const rule = store.update('pricing_rules', req.params.id, req.body || {});
  if (!rule) return res.status(404).json({ error: 'Pricing rule not found.' });
  res.json({ rule });
});

router.get('/pricing/calculate', requirePermission('pricing.calculate'), (req, res) => {
  const room = store.find('rooms', (item) => String(item.id) === String(req.query.room_id));
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  res.json(applyPricing(room, req.query.check_in || today(), req.query.check_out || today(), store.all('pricing_rules')));
});

// Analytics, accounting and notifications
router.get('/analytics/dashboard', requirePermission('reports.analytics'), (req, res) => {
  const reportDate = req.query.date || today();
  const data = store.transaction((source) => {
    const rooms = source.rooms;
    const occupied = rooms.filter((room) => room.status === 'occupied').length;
    const roomRevenue = source.bookings.filter((booking) => inRange(booking.check_in || booking.created_at, reportDate, reportDate)).reduce((sum, booking) => sum + numeric(booking.total_price), 0);
    const foodRevenue = source.restaurant_orders.filter((order) => inRange(order.created_at, reportDate, reportDate)).reduce((sum, order) => sum + numeric(order.total), 0);
    const serviceRevenue = source.guest_service_charges.filter((charge) => inRange(charge.created_at, reportDate, reportDate)).reduce((sum, charge) => sum + numeric(charge.amount), 0);
    const availableRooms = rooms.length || 1;
    const adr = occupied ? roomRevenue / occupied : 0;
    return {
      date: reportDate,
      occupancy_percent: money(occupied * 100 / availableRooms),
      occupied_rooms: occupied,
      total_rooms: rooms.length,
      adr: money(adr),
      revpar: money(roomRevenue / availableRooms),
      revenue: { rooms: money(roomRevenue), food: money(foodRevenue), services: money(serviceRevenue), total: money(roomRevenue + foodRevenue + serviceRevenue) },
      pending_payments: source.bookings.filter((booking) => numeric(booking.balance_amount) > 0 || booking.payment_status === 'due').length,
      checkins: source.guests.filter((guest) => inRange(guest.check_in_date, reportDate, reportDate)).length,
      checkouts: source.guests.filter((guest) => guest.check_out_date && inRange(guest.check_out_date, reportDate, reportDate)).length
    };
  });
  res.json(data);
});

router.get('/analytics/revenue', requirePermission('reports.analytics'), (req, res) => {
  const from = req.query.from || `${today().slice(0, 8)}01`;
  const to = req.query.to || today();
  const ledger = store.all('ledger_entries').filter((entry) => inRange(entry.entry_date || entry.created_at, from, to));
  const bySource = ledger.reduce((acc, entry) => {
    const key = entry.source_type || 'manual';
    acc[key] = money((acc[key] || 0) + numeric(entry.amount));
    return acc;
  }, {});
  res.json({ from, to, total: money(ledger.reduce((sum, entry) => sum + numeric(entry.amount), 0)), by_source: bySource, rows: ledger });
});

router.get('/analytics/occupancy', requirePermission('reports.analytics'), (req, res) => {
  const rooms = store.all('rooms');
  const byType = {};
  rooms.forEach((room) => {
    byType[room.room_type] = byType[room.room_type] || { total: 0, occupied: 0, reserved: 0, dirty: 0, maintenance: 0 };
    byType[room.room_type].total += 1;
    if (byType[room.room_type][room.status] !== undefined) byType[room.room_type][room.status] += 1;
  });
  res.json({ total_rooms: rooms.length, by_room_type: byType });
});

router.get('/analytics/guests', requirePermission('reports.analytics'), (req, res) => {
  const guests = store.all('guests');
  const repeatPhones = guests.reduce((acc, guest) => {
    const phone = guest.phone || guest.guest_phone || '';
    if (phone) acc[phone] = (acc[phone] || 0) + 1;
    return acc;
  }, {});
  res.json({
    total_guests: guests.length,
    repeat_guest_count: Object.values(repeatPhones).filter((count) => count > 1).length,
    top_guests: Object.entries(repeatPhones).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([phone, visits]) => ({ phone, visits }))
  });
});

router.get('/payments/outstanding', requirePermission('payments.view'), (req, res) => {
  const bookings = store.all('bookings').filter((booking) => numeric(booking.balance_amount) > 0 || booking.payment_status === 'due');
  res.json({ outstanding: bookings });
});

router.post('/payment-reminders', requirePermission('payments.create'), (req, res) => {
  const reminder = store.insert('payment_reminders', {
    booking_id: req.body?.booking_id || '',
    guest_id: req.body?.guest_id || '',
    amount_due: money(req.body?.amount_due),
    channel: req.body?.channel || 'whatsapp',
    message: req.body?.message || '',
    status: 'pending',
    scheduled_for: req.body?.scheduled_for || now(),
    created_by_staff_id: req.user.id
  });
  res.status(201).json({ reminder });
});

router.get('/notifications', requirePermission('notifications.view'), (req, res) => {
  const notifications = store.all('notifications').filter((item) => !item.recipient_staff_id || String(item.recipient_staff_id) === String(req.user.id));
  res.json({ notifications });
});

router.post('/notifications', requirePermission('notifications.create'), (req, res) => {
  const notification = store.insert('notifications', {
    recipient_staff_id: req.body?.recipient_staff_id || '',
    type: req.body?.type || 'general',
    title: req.body?.title || '',
    message: req.body?.message || '',
    related_type: req.body?.related_type || '',
    related_id: req.body?.related_id || '',
    sent_at: now(),
    read_at: ''
  });
  res.status(201).json({ notification });
});

router.patch('/notifications/:id/read', requirePermission('notifications.view'), (req, res) => {
  const notification = store.update('notifications', req.params.id, { read_at: now() });
  if (!notification) return res.status(404).json({ error: 'Notification not found.' });
  res.json({ notification });
});

router.get('/notification-templates', requirePermission('notifications.templates'), (req, res) => {
  res.json({ templates: store.all('notification_templates'), whatsapp_templates: store.all('whatsapp_templates') });
});

router.post('/notification-templates', requirePermission('notifications.templates'), (req, res) => {
  const template = store.insert('notification_templates', {
    channel: req.body?.channel || 'email',
    name: req.body?.name || '',
    subject: req.body?.subject || '',
    body: req.body?.body || '',
    active: req.body?.active !== false
  });
  res.status(201).json({ template });
});

// Print layouts
function roomForGuest(data, guest) {
  return guest?.room_id ? data.rooms.find((room) => String(room.id) === String(guest.room_id)) || null : null;
}

function bookingForGuest(data, guest) {
  return guest?.booking_id ? data.bookings.find((booking) => String(booking.id) === String(guest.booking_id)) || null : null;
}

function guestCharges(data, guest) {
  const booking = bookingForGuest(data, guest);
  const room = roomForGuest(data, guest);
  const roomCharge = money(guest?.checkout_room_rent || booking?.total_price || room?.price || 0);
  const serviceCharges = data.guest_service_charges.filter((charge) => String(charge.guest_id) === String(guest?.id));
  const foodItems = Array.isArray(guest?.checkout_food_items) ? guest.checkout_food_items : [];
  const lines = [];
  if (roomCharge > 0) lines.push({ description: `Room charge ${room?.room_number || ''}`, taxable: roomCharge, gst_percent: 5, total: money(roomCharge * 1.05), type: 'room' });
  foodItems.forEach((item) => lines.push({ description: item.name || 'Food item', taxable: money(item.amount || item.item_amount), gst_percent: numeric(item.gst_percent), total: money(item.total || item.amount), type: 'food' }));
  serviceCharges.forEach((charge) => lines.push({ description: charge.description, taxable: money(charge.amount), gst_percent: 0, total: money(charge.amount), type: 'service' }));
  return lines;
}

function renderGrc(data, guest) {
  const booking = bookingForGuest(data, guest);
  const room = roomForGuest(data, guest);
  return printPage('Guest Registration Certificate', `
    <h2>Guest Registration Certificate</h2>
    <div class="grid">
      <div>
        <div class="line"><span class="label">GRC No.</span><span>${escapeHtml(guest.check_in_no || guest.id)}</span></div>
        <div class="line"><span class="label">Guest Name</span><span>${escapeHtml(guest.name || booking?.guest_name)}</span></div>
        <div class="line"><span class="label">Mobile</span><span>${escapeHtml(guest.phone || booking?.guest_phone)}</span></div>
        <div class="line"><span class="label">Address</span><span>${escapeHtml(guest.address || '')}</span></div>
        <div class="line"><span class="label">ID Proof</span><span>${guest.no_id_required ? 'Bulk / ID not required' : escapeHtml(guest.id_proof || '')}</span></div>
      </div>
      <div>
        <div class="line"><span class="label">Room No.</span><span>${escapeHtml(room?.room_number)}</span></div>
        <div class="line"><span class="label">Room Type</span><span>${escapeHtml(room?.room_type)}</span></div>
        <div class="line"><span class="label">Check-in</span><span>${ddmmyyyy(guest.check_in_date || booking?.check_in)}</span></div>
        <div class="line"><span class="label">Expected Checkout</span><span>${ddmmyyyy(booking?.check_out)}</span></div>
        <div class="line"><span class="label">Plan</span><span>${escapeHtml(guest.room_plan || 'CP')}</span></div>
      </div>
    </div>
    <h3>Terms & Conditions</h3>
    <ol><li>Checkout time and hotel rules apply as informed by reception.</li><li>Guest is responsible for room key and hotel property.</li><li>Management is not responsible for valuables left unattended.</li></ol>
    <div class="signatures"><div class="sig">Guest Signature</div><div class="sig">Reception</div><div class="sig">Stamp</div></div>`);
}

function renderFinalBill(data, guest) {
  const booking = bookingForGuest(data, guest);
  const room = roomForGuest(data, guest);
  const lines = guestCharges(data, guest);
  const subtotal = money(lines.reduce((sum, line) => sum + numeric(line.taxable), 0));
  const gst = money(lines.reduce((sum, line) => sum + numeric(line.taxable) * numeric(line.gst_percent) / 100, 0));
  const total = money(lines.reduce((sum, line) => sum + numeric(line.total), 0));
  const advance = money(guest.checkout_less_advance || guest.advance_amount || booking?.paid_amount || 0);
  const discount = money(guest.checkout_discount_amount || 0);
  const payable = money(total - advance - discount);
  return printPage('Final Bill', `
    <h2>Final Bill / Invoice</h2>
    <div class="grid">
      <div><div class="line"><span class="label">Guest</span><span>${escapeHtml(guest.name || booking?.guest_name)}</span></div><div class="line"><span class="label">Mobile</span><span>${escapeHtml(guest.phone || booking?.guest_phone)}</span></div><div class="line"><span class="label">Address</span><span>${escapeHtml(guest.address || '')}</span></div></div>
      <div><div class="line"><span class="label">Bill No.</span><span>${escapeHtml(guest.id)}</span></div><div class="line"><span class="label">Room</span><span>${escapeHtml(room?.room_number)} - ${escapeHtml(room?.room_type)}</span></div><div class="line"><span class="label">Stay</span><span>${ddmmyyyy(guest.check_in_date || booking?.check_in)} to ${ddmmyyyy(guest.check_out_date || booking?.check_out)}</span></div></div>
    </div>
    <table><thead><tr><th>Description</th><th>Type</th><th>GST%</th><th class="right">Taxable</th><th class="right">Total</th></tr></thead><tbody>${rows(lines, [
      (line) => escapeHtml(line.description),
      (line) => escapeHtml(line.type),
      (line) => numeric(line.gst_percent).toFixed(2),
      (line) => `<span class="right">${rupee(line.taxable)}</span>`,
      (line) => `<span class="right">${rupee(line.total)}</span>`
    ])}</tbody></table>
    <table class="totals"><tr><th>Subtotal</th><td class="right">${rupee(subtotal)}</td></tr><tr><th>GST</th><td class="right">${rupee(gst)}</td></tr><tr><th>Advance</th><td class="right">${rupee(advance)}</td></tr><tr><th>Discount</th><td class="right">${rupee(discount)}</td></tr><tr><th>Payable</th><td class="right">${rupee(payable)}</td></tr></table>
    <div class="signatures"><div class="sig">Guest Signature</div><div class="sig">Cashier</div><div class="sig">FO Signature</div></div>`);
}

function renderReceipt(data, receipt) {
  const items = data.receipt_items.filter((item) => String(item.receipt_id) === String(receipt.id));
  return printPage('Receipt', `
    <h2>Receipt</h2>
    <div class="grid"><div><div class="line"><span class="label">Receipt No.</span><span>${escapeHtml(receipt.receipt_number || receipt.id)}</span></div><div class="line"><span class="label">Guest</span><span>${escapeHtml(receipt.customer_name)}</span></div><div class="line"><span class="label">Purpose</span><span>${escapeHtml(receipt.receipt_type)}</span></div></div><div><div class="line"><span class="label">Date</span><span>${ddmmyyyy(receipt.receipt_date || receipt.created_at)}</span></div><div class="line"><span class="label">Payment Method</span><span>${escapeHtml(receipt.payment_method)}</span></div><div class="line"><span class="label">Balance</span><span>${rupee(receipt.balance_amount)}</span></div></div></div>
    <table><thead><tr><th>Description</th><th>Qty</th><th>GST%</th><th class="right">Amount</th></tr></thead><tbody>${rows(items, [
      (item) => escapeHtml(item.description),
      (item) => escapeHtml(item.quantity),
      (item) => numeric(item.gst_percent).toFixed(2),
      (item) => `<span class="right">${rupee(item.line_total)}</span>`
    ])}</tbody></table>
    <table class="totals"><tr><th>Paid</th><td class="right">${rupee(receipt.paid_amount)}</td></tr><tr><th>Total</th><td class="right">${rupee(receipt.grand_total)}</td></tr></table>
    <div class="signatures"><div class="sig">Guest Signature</div><div></div><div class="sig">Staff Signature</div></div>`);
}

function dailyClosingData(data, reportDate) {
  const guestsIn = data.guests.filter((guest) => inRange(guest.check_in_date, reportDate, reportDate));
  const guestsOut = data.guests.filter((guest) => guest.check_out_date && inRange(guest.check_out_date, reportDate, reportDate));
  const roomRevenue = data.bookings.filter((booking) => inRange(booking.check_in || booking.created_at, reportDate, reportDate)).reduce((sum, booking) => sum + numeric(booking.total_price), 0);
  const foodRevenue = data.restaurant_orders.filter((order) => inRange(order.created_at, reportDate, reportDate)).reduce((sum, order) => sum + numeric(order.total), 0);
  const serviceRevenue = data.guest_service_charges.filter((charge) => inRange(charge.created_at, reportDate, reportDate)).reduce((sum, charge) => sum + numeric(charge.amount), 0);
  const occupied = data.rooms.filter((room) => room.status === 'occupied').length;
  return { reportDate, guestsIn, guestsOut, roomRevenue: money(roomRevenue), foodRevenue: money(foodRevenue), serviceRevenue: money(serviceRevenue), occupied, totalRooms: data.rooms.length, dues: data.bookings.filter((booking) => numeric(booking.balance_amount) > 0 || booking.payment_status === 'due') };
}

function renderDailyClosing(data, reportDate) {
  const report = dailyClosingData(data, reportDate);
  const totalRevenue = money(report.roomRevenue + report.foodRevenue + report.serviceRevenue);
  return printPage('Daily Closing Report', `
    <h2>Daily Closing Report - ${ddmmyyyy(reportDate)}</h2>
    <table><tr><th>Total Rooms</th><td>${report.totalRooms}</td><th>Occupied</th><td>${report.occupied}</td><th>Occupancy %</th><td>${report.totalRooms ? money(report.occupied * 100 / report.totalRooms) : 0}%</td></tr></table>
    <table><tr><th>Room Revenue</th><td class="right">${rupee(report.roomRevenue)}</td></tr><tr><th>Food Revenue</th><td class="right">${rupee(report.foodRevenue)}</td></tr><tr><th>Service Revenue</th><td class="right">${rupee(report.serviceRevenue)}</td></tr><tr><th>Total Revenue</th><td class="right">${rupee(totalRevenue)}</td></tr><tr><th>Outstanding Dues</th><td class="right">${rupee(report.dues.reduce((sum, booking) => sum + numeric(booking.balance_amount || booking.total_price), 0))}</td></tr></table>
    <table><tr><th>Check-ins</th><td>${report.guestsIn.length}</td><th>Check-outs</th><td>${report.guestsOut.length}</td></tr></table>
    <div class="signatures"><div class="sig">Prepared By</div><div class="sig">Manager</div><div class="sig">Accounts</div></div>`);
}

function renderGstReport(data, from, to) {
  const receiptItems = [];
  data.receipts.filter((receipt) => inRange(receipt.receipt_date || receipt.created_at, from, to)).forEach((receipt) => {
    data.receipt_items.filter((item) => String(item.receipt_id) === String(receipt.id)).forEach((item) => receiptItems.push({ receipt, item }));
  });
  const summary = receiptItems.reduce((acc, row) => {
    const key = String(row.item.gst_percent || 0);
    acc[key] = acc[key] || { taxable: 0, cgst: 0, sgst: 0, total: 0 };
    acc[key].taxable = money(acc[key].taxable + numeric(row.item.taxable));
    acc[key].cgst = money(acc[key].cgst + numeric(row.item.gst_amount) / 2);
    acc[key].sgst = money(acc[key].sgst + numeric(row.item.gst_amount) / 2);
    acc[key].total = money(acc[key].total + numeric(row.item.line_total));
    return acc;
  }, {});
  return printPage('GST Report', `
    <h2>GST Report</h2><p>Date Range: ${ddmmyyyy(from)} to ${ddmmyyyy(to)}</p>
    <table><thead><tr><th>GST%</th><th class="right">Taxable</th><th class="right">CGST</th><th class="right">SGST</th><th class="right">Total</th></tr></thead><tbody>${Object.entries(summary).map(([gst, values]) => `<tr><td>${escapeHtml(gst)}%</td><td class="right">${rupee(values.taxable)}</td><td class="right">${rupee(values.cgst)}</td><td class="right">${rupee(values.sgst)}</td><td class="right">${rupee(values.total)}</td></tr>`).join('')}</tbody></table>`);
}

function renderCheckoutSummary(data, guest) {
  const booking = bookingForGuest(data, guest);
  const room = roomForGuest(data, guest);
  const loyalty = data.loyalty_members.find((member) => String(member.guest_id) === String(guest.id));
  return printPage('Checkout Summary', `
    <h2>Thank you for staying with Club Skypark</h2>
    <div class="grid"><div><div class="line"><span class="label">Guest</span><span>${escapeHtml(guest.name || booking?.guest_name)}</span></div><div class="line"><span class="label">Room</span><span>${escapeHtml(room?.room_number)} - ${escapeHtml(room?.room_type)}</span></div><div class="line"><span class="label">Stay</span><span>${ddmmyyyy(guest.check_in_date || booking?.check_in)} to ${ddmmyyyy(guest.check_out_date || booking?.check_out)}</span></div></div><div><div class="line"><span class="label">Final Amount</span><span>${rupee(guest.checkout_pay_after_discount || booking?.total_price)}</span></div><div class="line"><span class="label">Loyalty Points</span><span>${escapeHtml(loyalty?.points || 0)}</span></div><div class="line"><span class="label">Feedback QR</span><span>[ QR Code Space ]</span></div></div></div>
    <h3>Feedback</h3><table><tr><th>Rating</th><td>1 2 3 4 5</td></tr><tr><th>Comments</th><td style="height: 55px;"></td></tr></table>`);
}

function renderHousekeepingSheet(data, reportDate) {
  const tasks = data.housekeeping_tasks.filter((task) => inRange(task.task_date || task.created_at, reportDate, reportDate));
  return printPage('Housekeeping Daily Sheet', `
    <h2>Housekeeping Daily Sheet - ${ddmmyyyy(reportDate)}</h2>
    <table><thead><tr><th>Room</th><th>Category</th><th>Checklist</th><th>Status</th><th>Started</th><th>Completed</th><th>Notes</th></tr></thead><tbody>${rows(tasks, [
      (task) => escapeHtml((data.rooms.find((room) => String(room.id) === String(task.room_id)) || {}).room_number || task.room_id),
      (task) => escapeHtml((data.rooms.find((room) => String(room.id) === String(task.room_id)) || {}).room_type || ''),
      (task) => escapeHtml((task.checklist || housekeepingChecklist).join(', ')),
      (task) => escapeHtml(task.status),
      (task) => escapeHtml(task.started_at || ''),
      (task) => escapeHtml(task.completed_at || ''),
      (task) => escapeHtml(task.notes || '')
    ])}</tbody></table>
    <div class="signatures"><div class="sig">Staff Signature</div><div class="sig">Supervisor Signature</div><div class="sig">Manager</div></div>`);
}

router.get('/print/grc/:id', requirePermission('checkin.print_grc'), (req, res) => {
  const html = store.transaction((data) => {
    const guest = resolveGuest(data, req.params.id);
    return guest ? renderGrc(data, guest) : null;
  });
  if (!html) return res.status(404).json({ error: 'Guest or booking not found.' });
  sendPrint(res, 'GRC', html, req, 'guest', req.params.id);
});

router.get('/print/bill/:id', requirePermission('checkout.print_bill'), (req, res) => {
  const html = store.transaction((data) => {
    const guest = resolveGuest(data, req.params.id);
    return guest ? renderFinalBill(data, guest) : null;
  });
  if (!html) return res.status(404).json({ error: 'Guest or booking not found.' });
  sendPrint(res, 'Final Bill', html, req, 'guest', req.params.id);
});

router.get('/print/receipt/:id', requirePermission('receipts.print'), (req, res) => {
  const html = store.transaction((data) => {
    const receipt = data.receipts.find((item) => String(item.id) === String(req.params.id) || String(item.receipt_number) === String(req.params.id));
    return receipt ? renderReceipt(data, receipt) : null;
  });
  if (!html) return res.status(404).json({ error: 'Receipt not found.' });
  sendPrint(res, 'Receipt', html, req, 'receipt', req.params.id);
});

router.get('/print/daily-closing', requirePermission('reports.export'), (req, res) => {
  const reportDate = req.query.date || today();
  const html = store.transaction((data) => renderDailyClosing(data, reportDate));
  sendPrint(res, 'Daily Closing Report', html, req, 'daily_report', reportDate);
});

router.get('/print/gst', requirePermission('reports.gst'), (req, res) => {
  const from = req.query.from || today();
  const to = req.query.to || from;
  const html = store.transaction((data) => renderGstReport(data, from, to));
  sendPrint(res, 'GST Report', html, req, 'gst_report', `${from}_${to}`);
});

router.get('/print/checkout-summary/:id', requirePermission('checkout.print_bill'), (req, res) => {
  const html = store.transaction((data) => {
    const guest = resolveGuest(data, req.params.id);
    return guest ? renderCheckoutSummary(data, guest) : null;
  });
  if (!html) return res.status(404).json({ error: 'Guest or booking not found.' });
  sendPrint(res, 'Checkout Summary', html, req, 'guest', req.params.id);
});

router.get('/print/housekeeping-daily-sheet', requirePermission('reports.export'), (req, res) => {
  const reportDate = req.query.date || today();
  const html = store.transaction((data) => renderHousekeepingSheet(data, reportDate));
  sendPrint(res, 'Housekeeping Daily Sheet', html, req, 'housekeeping', reportDate);
});

module.exports = router;

