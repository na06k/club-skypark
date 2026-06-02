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
  return process.env.HOTEL_PHONE_NUMBER || '+91 79748 23267';
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
    table_number: z.string().min(1),
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
    const items = parsed.data.items.map((line) => {
      const master = line.item_id ? data.items.find((item) => String(item.id) === String(line.item_id)) : null;
      return {
        item_id: line.item_id ? String(line.item_id) : null,
        name: line.name || master?.name || 'Item',
        quantity: Number(line.quantity),
        price: Number(line.price ?? master?.price ?? 0),
        gst_percent: Number(master?.gst_percent || 0)
      };
    });
    const total = money(items.reduce((sum, item) => sum + item.quantity * item.price, 0));
    const item = { id: nextId(data.restaurant_orders), table_number: parsed.data.table_number, items, total, status: parsed.data.status, created_at: now() };
    data.restaurant_orders.push(item);
    if (item.status === 'paid') addLedger(data, { source_type: 'restaurant_order', source_id: item.id, description: `Restaurant order table ${item.table_number}`, amount: total, payment_method: parsed.data.payment_method });
    return item;
  });
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

// ===== WEEK 1 FEATURES: GUEST PROFILES & PREFERENCES =====

router.get('/guest-profiles', requireAuth, (req, res) => {
  if (!can(req, 'bookings.view')) return forbidden(res);
  const profiles = store.list('guests').map(g => ({
    ...g,
    preferences: store.find('guest_preferences', p => String(p.guest_id) === String(g.id))
  }));
  res.json({ profiles });
});

router.get('/guest-profiles/:id', requireAuth, (req, res) => {
  if (!can(req, 'bookings.view')) return forbidden(res);
  const guest = store.find('guests', g => String(g.id) === String(req.params.id));
  if (!guest) return res.status(404).json({ error: 'Guest not found.' });
  const preferences = store.find('guest_preferences', p => String(p.guest_id) === String(guest.id));
  res.json({ guest: { ...guest, preferences } });
});

router.post('/guest-profiles/:id/preferences', requireAuth, (req, res) => {
  if (!can(req, 'bookings.edit')) return forbidden(res);
  const guest = store.find('guests', g => String(g.id) === String(req.params.id));
  if (!guest) return res.status(404).json({ error: 'Guest not found.' });

  const prefs = {
    id: nextId(store.list('guest_preferences')),
    guest_id: guest.id,
    room_preference: req.body.room_preference || 'any',
    bed_type: req.body.bed_type || 'any',
    meal_preference: req.body.meal_preference || 'regular',
    special_requests: req.body.special_requests || '',
    do_not_disturb: req.body.do_not_disturb || false,
    preferred_contact: req.body.preferred_contact || 'phone',
    birthday: req.body.birthday || '',
    anniversary: req.body.anniversary || '',
    created_at: now()
  };
  store.insert('guest_preferences', prefs);
  res.json({ preferences: prefs });
});

// ===== HOUSEKEEPING MANAGEMENT =====

router.get('/housekeeping/tasks', requireAuth, (req, res) => {
  if (!can(req, 'checkin.view')) return forbidden(res);
  const tasks = store.list('housekeeping_tasks').map(task => ({
    ...task,
    room: store.find('rooms', r => String(r.id) === String(task.room_id))
  }));
  res.json({ tasks });
});

router.post('/housekeeping/tasks', requireAuth, (req, res) => {
  if (!can(req, 'checkin.create')) return forbidden(res);

  const task = {
    id: nextId(store.list('housekeeping_tasks')),
    room_id: req.body.room_id,
    assigned_to_staff_id: req.body.assigned_to_staff_id || null,
    status: 'pending',
    priority: req.body.priority || 'normal',
    task_date: req.body.task_date || today(),
    checklist: req.body.checklist || ['Beds', 'Dusting', 'Cleaning', 'Bathroom', 'Amenities', 'AC', 'Water', 'Lights'],
    notes: req.body.notes || '',
    started_at: null,
    completed_at: null,
    created_at: now()
  };
  store.insert('housekeeping_tasks', task);
  res.json({ task });
});

router.put('/housekeeping/tasks/:id', requireAuth, (req, res) => {
  if (!can(req, 'checkin.create')) return forbidden(res);

  const updates = {
    status: req.body.status || undefined,
    assigned_to_staff_id: req.body.assigned_to_staff_id || undefined,
    started_at: req.body.started_at || undefined,
    completed_at: req.body.completed_at || undefined,
    notes: req.body.notes || undefined
  };
  Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

  const updated = store.update('housekeeping_tasks', req.params.id, updates);
  res.json({ task: updated });
});

router.put('/rooms/:id/status', requireAuth, (req, res) => {
  if (!can(req, 'rooms.status_update')) return forbidden(res);

  const validStatuses = ['vacant', 'occupied', 'reserved', 'dirty', 'maintenance'];
  if (!validStatuses.includes(req.body.status)) {
    return res.status(400).json({ error: 'Invalid room status.' });
  }

  const updated = store.update('rooms', req.params.id, { status: req.body.status });
  store.insert('room_status_history', {
    id: nextId(store.list('room_status_history')),
    room_id: req.params.id,
    previous_status: store.find('rooms', r => String(r.id) === String(req.params.id))?.status,
    new_status: req.body.status,
    changed_by_staff_id: req.user.id,
    reason: req.body.reason || '',
    changed_at: now()
  });
  res.json({ room: updated });
});

// ===== LAUNDRY MANAGEMENT =====

router.post('/laundry/orders', requireAuth, (req, res) => {
  if (!can(req, 'checkout.create')) return forbidden(res);

  const order = {
    id: nextId(store.list('laundry_orders')),
    booking_id: req.body.booking_id,
    guest_id: req.body.guest_id,
    items: req.body.items || [],
    quantity: req.body.quantity || 0,
    notes: req.body.notes || '',
    requested_at: now(),
    expected_delivery: req.body.expected_delivery || localDateTime(today(), '18:00').toISOString(),
    status: 'pending',
    delivered_at: null,
    charge: money(req.body.charge || 0),
    created_at: now()
  };
  store.insert('laundry_orders', order);
  res.json({ order });
});

router.get('/laundry/orders', requireAuth, (req, res) => {
  if (!can(req, 'checkout.view')) return forbidden(res);
  const orders = store.list('laundry_orders');
  res.json({ orders });
});

router.put('/laundry/orders/:id', requireAuth, (req, res) => {
  if (!can(req, 'checkout.create')) return forbidden(res);

  const updated = store.update('laundry_orders', req.params.id, {
    status: req.body.status || undefined,
    delivered_at: req.body.status === 'delivered' ? now() : undefined
  });
  res.json({ order: updated });
});

// ===== ROOM SERVICE ORDERS =====

router.post('/room-service/orders', requireAuth, (req, res) => {
  if (!can(req, 'restaurant.create_order')) return forbidden(res);

  const order = {
    id: nextId(store.list('room_service_orders')),
    booking_id: req.body.booking_id,
    guest_id: req.body.guest_id,
    room_id: req.body.room_id,
    items: req.body.items || [],
    special_requests: req.body.special_requests || '',
    requested_at: now(),
    expected_delivery: req.body.expected_delivery || localDateTime(today(), '11:30').toISOString(),
    status: 'pending',
    delivered_at: null,
    total_amount: money(req.body.total_amount || 0),
    charge_to_room: req.body.charge_to_room !== false,
    created_at: now()
  };
  store.insert('room_service_orders', order);
  res.json({ order });
});

router.get('/room-service/orders', requireAuth, (req, res) => {
  if (!can(req, 'restaurant.view')) return forbidden(res);
  const orders = store.list('room_service_orders');
  res.json({ orders });
});

router.put('/room-service/orders/:id', requireAuth, (req, res) => {
  if (!can(req, 'restaurant.create_order')) return forbidden(res);

  const updated = store.update('room_service_orders', req.params.id, {
    status: req.body.status || undefined,
    delivered_at: req.body.status === 'delivered' ? now() : undefined
  });
  res.json({ order: updated });
});

// ===== MINIBAR TRACKING =====

router.post('/minibar/items', requireAuth, (req, res) => {
  if (!can(req, 'restaurant.create_order')) return forbidden(res);

  const item = {
    id: nextId(store.list('minibar_items')),
    booking_id: req.body.booking_id,
    guest_id: req.body.guest_id,
    room_id: req.body.room_id,
    item_name: req.body.item_name,
    price: money(req.body.price || 0),
    consumed_at: now(),
    created_at: now()
  };
  store.insert('minibar_items', item);
  res.json({ item });
});

router.get('/minibar/items', requireAuth, (req, res) => {
  if (!can(req, 'restaurant.view')) return forbidden(res);
  const items = store.list('minibar_items');
  res.json({ items });
});

// ===== WEEK 2 FEATURES: STAFF SCHEDULING =====

router.post('/staff-schedules', requireAuth, (req, res) => {
  if (!can(req, 'staff.create')) return forbidden(res);

  const schedule = {
    id: nextId(store.list('staff_schedules')),
    staff_id: req.body.staff_id,
    shift_date: req.body.shift_date || today(),
    shift_type: req.body.shift_type || 'morning',
    shift_start: req.body.shift_start || '06:00',
    shift_end: req.body.shift_end || '14:00',
    assigned_by_staff_id: req.user.id,
    status: 'scheduled',
    notes: req.body.notes || '',
    created_at: now()
  };
  store.insert('staff_schedules', schedule);
  res.json({ schedule });
});

router.get('/staff-schedules', requireAuth, (req, res) => {
  if (!can(req, 'staff.view')) return forbidden(res);
  const schedules = store.list('staff_schedules');
  res.json({ schedules });
});

router.post('/staff-attendance', requireAuth, (req, res) => {
  if (!can(req, 'staff.edit')) return forbidden(res);

  const attendance = {
    id: nextId(store.list('staff_attendance')),
    staff_id: req.body.staff_id,
    date: req.body.date || today(),
    clock_in: req.body.clock_in || now(),
    clock_out: req.body.clock_out || null,
    status: req.body.status || 'present',
    notes: req.body.notes || '',
    created_at: now()
  };
  store.insert('staff_attendance', attendance);
  res.json({ attendance });
});

// ===== INVENTORY MANAGEMENT =====

router.post('/inventory/items', requireAuth, (req, res) => {
  if (!can(req, 'store.create')) return forbidden(res);

  const item = {
    id: nextId(store.list('inventory_items')),
    category: req.body.category || 'supplies',
    name: req.body.name,
    unit: req.body.unit || 'pcs',
    current_stock: req.body.current_stock || 0,
    minimum_level: req.body.minimum_level || 10,
    reorder_qty: req.body.reorder_qty || 20,
    unit_cost: money(req.body.unit_cost || 0),
    supplier_id: req.body.supplier_id || null,
    expiry_date: req.body.expiry_date || null,
    created_at: now()
  };
  store.insert('inventory_items', item);
  res.json({ item });
});

router.get('/inventory/items', requireAuth, (req, res) => {
  if (!can(req, 'store.view')) return forbidden(res);
  const items = store.list('inventory_items').map(item => ({
    ...item,
    supplier: item.supplier_id ? store.find('suppliers', s => String(s.id) === String(item.supplier_id)) : null
  }));
  res.json({ items });
});

router.post('/inventory/movements', requireAuth, (req, res) => {
  if (!can(req, 'store.edit')) return forbidden(res);

  const movement = {
    id: nextId(store.list('inventory_movements')),
    item_id: req.body.item_id,
    movement_type: req.body.movement_type || 'in',
    quantity: req.body.quantity || 0,
    reason: req.body.reason || '',
    reference_id: req.body.reference_id || null,
    recorded_by_staff_id: req.user.id,
    recorded_at: now(),
    created_at: now()
  };
  store.insert('inventory_movements', movement);

  const item = store.find('inventory_items', i => String(i.id) === String(req.body.item_id));
  if (item) {
    const newStock = movement.movement_type === 'in'
      ? item.current_stock + movement.quantity
      : Math.max(0, item.current_stock - movement.quantity);
    store.update('inventory_items', req.body.item_id, { current_stock: newStock });
  }

  res.json({ movement });
});

router.get('/inventory/movements', requireAuth, (req, res) => {
  if (!can(req, 'store.view')) return forbidden(res);
  const movements = store.list('inventory_movements');
  res.json({ movements });
});

// ===== LOYALTY PROGRAM =====

router.post('/loyalty/members', requireAuth, (req, res) => {
  if (!can(req, 'bookings.create')) return forbidden(res);

  const member = {
    id: nextId(store.list('loyalty_members')),
    guest_id: req.body.guest_id,
    tier: 'silver',
    points: 0,
    total_spent: 0,
    joined_at: now(),
    created_at: now()
  };
  store.insert('loyalty_members', member);
  res.json({ member });
});

router.get('/loyalty/members', requireAuth, (req, res) => {
  if (!can(req, 'bookings.view')) return forbidden(res);
  const members = store.list('loyalty_members');
  res.json({ members });
});

router.post('/loyalty/points', requireAuth, (req, res) => {
  if (!can(req, 'bookings.create')) return forbidden(res);

  const member = store.find('loyalty_members', m => String(m.guest_id) === String(req.body.guest_id));
  if (!member) return res.status(404).json({ error: 'Member not found.' });

  const pointsRecord = {
    id: nextId(store.list('loyalty_points')),
    member_id: member.id,
    points: req.body.points || 0,
    type: req.body.type || 'earned',
    source: req.body.source || 'booking',
    reason: req.body.reason || '',
    recorded_at: now(),
    created_at: now()
  };
  store.insert('loyalty_points', pointsRecord);

  const newTotal = member.points + (req.body.points || 0);
  const newTier = newTotal >= 1500 ? 'platinum' : newTotal >= 500 ? 'gold' : 'silver';
  store.update('loyalty_members', member.id, {
    points: newTotal,
    total_spent: (member.total_spent || 0) + (req.body.points || 0),
    tier: newTier
  });

  res.json({ pointsRecord, newTier });
});

// ===== DYNAMIC PRICING =====

router.post('/pricing-rules', requireAuth, (req, res) => {
  if (!can(req, 'rooms.edit')) return forbidden(res);

  const rule = {
    id: nextId(store.list('pricing_rules')),
    room_type: req.body.room_type || 'all',
    rule_type: req.body.rule_type || 'seasonal',
    rate_multiplier: req.body.rate_multiplier || 1.0,
    discount_percent: req.body.discount_percent || 0,
    min_nights: req.body.min_nights || 1,
    from_date: req.body.from_date || today(),
    to_date: req.body.to_date || null,
    description: req.body.description || '',
    active: req.body.active !== false,
    created_at: now()
  };
  store.insert('pricing_rules', rule);
  res.json({ rule });
});

router.get('/pricing-rules', requireAuth, (req, res) => {
  if (!can(req, 'rooms.view')) return forbidden(res);
  const rules = store.list('pricing_rules');
  res.json({ rules });
});

router.get('/pricing/calculate', requireAuth, (req, res) => {
  const roomId = req.query.room_id;
  const checkIn = req.query.check_in;
  const checkOut = req.query.check_out;

  if (!roomId || !checkIn || !checkOut) {
    return res.status(400).json({ error: 'room_id, check_in, and check_out required.' });
  }

  const room = store.find('rooms', r => String(r.id) === String(roomId));
  if (!room) return res.status(404).json({ error: 'Room not found.' });

  const nights = nightsBetween(checkIn, checkOut);
  let baseRate = room.price || 0;

  const applicableRules = store.list('pricing_rules').filter(rule => {
    if (!rule.active) return false;
    if (rule.room_type !== 'all' && rule.room_type !== room.room_type) return false;
    if (rule.min_nights && nights < rule.min_nights) return false;
    return true;
  });

  let finalRate = baseRate;
  applicableRules.forEach(rule => {
    finalRate = finalRate * rule.rate_multiplier;
    finalRate = finalRate * (1 - rule.discount_percent / 100);
  });

  res.json({
    room_id: roomId,
    base_rate: baseRate,
    nights,
    applicable_rules: applicableRules.length,
    final_rate: money(finalRate),
    total: money(finalRate * nights)
  });
});

// ===== WEEK 3: ADVANCED ANALYTICS =====

router.get('/analytics/dashboard', requireAuth, (req, res) => {
  if (!can(req, 'reports.daily')) return forbidden(res);

  const bookings = store.list('bookings');
  const checkins = store.list('checkins');
  const checkouts = store.list('checkouts');
  const rooms = store.list('rooms');
  const ledger = store.list('ledger_entries');

  const occupiedCount = rooms.filter(r => r.status === 'occupied').length;
  const occupancyRate = ((occupiedCount / rooms.length) * 100).toFixed(2);

  const totalRevenue = ledger
    .filter(e => e.type === 'credit' && inRange(e.entry_date, `${today().split('-').slice(0, 2).join('-')}-01`))
    .reduce((sum, e) => sum + money(e.amount), 0);

  const avgDailyRate = bookings.length > 0
    ? money(bookings.reduce((sum, b) => sum + (b.total_price || 0), 0) / bookings.length)
    : 0;

  res.json({
    date: today(),
    occupancy_rate: occupancyRate,
    occupied_rooms: occupiedCount,
    total_rooms: rooms.length,
    total_revenue: money(totalRevenue),
    average_daily_rate: avgDailyRate,
    checkins_today: checkins.filter(c => c.check_in_date === today()).length,
    checkouts_today: checkouts.filter(c => c.check_out_date === today()).length,
    pending_bookings: bookings.filter(b => b.status === 'confirmed').length
  });
});

router.get('/analytics/revenue/:period', requireAuth, (req, res) => {
  if (!can(req, 'reports.daily')) return forbidden(res);

  const ledger = store.list('ledger_entries');
  const period = req.params.period || 'monthly';

  const groupedRevenue = {};
  ledger.forEach(entry => {
    if (entry.type !== 'credit') return;
    const key = period === 'daily' ? entry.entry_date : entry.entry_date.slice(0, 7);
    groupedRevenue[key] = (groupedRevenue[key] || 0) + money(entry.amount);
  });

  res.json({ period, revenue: groupedRevenue });
});

router.get('/analytics/occupancy', requireAuth, (req, res) => {
  if (!can(req, 'reports.daily')) return forbidden(res);

  const bookings = store.list('bookings');
  const rooms = store.list('rooms');

  const roomTypeOccupancy = {};
  rooms.forEach(room => {
    const key = room.room_type;
    if (!roomTypeOccupancy[key]) roomTypeOccupancy[key] = { total: 0, occupied: 0 };
    roomTypeOccupancy[key].total++;
    if (room.status === 'occupied') roomTypeOccupancy[key].occupied++;
  });

  res.json({ by_room_type: roomTypeOccupancy });
});

// ===== NOTIFICATIONS =====

router.post('/notifications', requireAuth, (req, res) => {
  const notification = {
    id: nextId(store.list('notifications')),
    recipient_staff_id: req.body.recipient_staff_id,
    type: req.body.type || 'general',
    title: req.body.title || '',
    message: req.body.message || '',
    related_id: req.body.related_id || null,
    sent_at: now(),
    read_at: null,
    created_at: now()
  };
  store.insert('notifications', notification);
  res.json({ notification });
});

router.get('/notifications', requireAuth, (req, res) => {
  const notifications = store.list('notifications').filter(n => String(n.recipient_staff_id) === String(req.user.id));
  res.json({ notifications });
});

// ===== PRINT LAYOUTS (HTML Templates) =====

function generateGRCHTML(guest, booking, room) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .certificate { background: white; padding: 40px; max-width: 600px; margin: 0 auto; border: 2px solid #C9A96E; }
        .header { text-align: center; border-bottom: 2px solid #C9A96E; padding-bottom: 20px; }
        .header h1 { margin: 0; color: #0D0D0D; font-size: 24px; }
        .header p { margin: 5px 0; color: #6B6B6B; font-size: 12px; }
        .content { margin: 30px 0; }
        .field { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ddd; }
        .label { font-weight: bold; color: #0D0D0D; }
        .value { color: #2C2C2C; }
        .footer { text-align: center; padding-top: 20px; border-top: 2px solid #C9A96E; margin-top: 30px; font-size: 11px; }
        .signature { margin-top: 30px; text-align: right; }
      </style>
    </head>
    <body>
      <div class="certificate">
        <div class="header">
          <h1>CLUB SKYPARK</h1>
          <p>Guest Registration Certificate</p>
          <p>Manasa Road, Neemuch, MP 458441</p>
          <p>Phone: +91 79748 23267</p>
        </div>
        <div class="content">
          <div class="field"><span class="label">Guest Name:</span><span class="value">${guest?.guest_name || 'N/A'}</span></div>
          <div class="field"><span class="label">Check-in:</span><span class="value">${booking?.check_in || 'N/A'}</span></div>
          <div class="field"><span class="label">Expected Check-out:</span><span class="value">${booking?.check_out || 'N/A'}</span></div>
          <div class="field"><span class="label">Room Number:</span><span class="value">${room?.room_number || 'N/A'}</span></div>
          <div class="field"><span class="label">Room Category:</span><span class="value">${room?.room_type || 'N/A'}</span></div>
          <div class="field"><span class="label">Number of Guests:</span><span class="value">${booking?.guests || 1}</span></div>
        </div>
        <div class="signature">
          <p>_________________________</p>
          <p style="font-size: 10px;">Guest Signature</p>
          <p style="margin-top: 20px;">_________________________</p>
          <p style="font-size: 10px;">Staff Signature & Stamp</p>
        </div>
        <div class="footer">
          <p>This is a temporary document. Please return your room key at checkout.</p>
          <p>Generated: ${new Date().toLocaleString('en-IN')}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateBillHTML(booking, room, charges) {
  const subtotal = charges.reduce((sum, c) => sum + c.amount, 0);
  const gst = money(subtotal * 0.18);
  const total = money(subtotal + gst);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .invoice { background: white; padding: 30px; max-width: 700px; margin: 0 auto; border: 1px solid #ddd; }
        .header { text-align: center; border-bottom: 2px solid #C9A96E; padding-bottom: 15px; }
        .header h1 { margin: 0; color: #0D0D0D; font-size: 22px; }
        .details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        .detail-section h3 { color: #0D0D0D; font-size: 12px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
        .detail-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; }
        .charges-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .charges-table th { background: #f0f0f0; border-bottom: 1px solid #ddd; padding: 8px; text-align: left; font-weight: bold; font-size: 12px; }
        .charges-table td { padding: 8px; border-bottom: 1px solid #ddd; font-size: 12px; }
        .charges-table .amount { text-align: right; }
        .summary { background: #f9f9f9; padding: 15px; margin: 20px 0; border: 1px solid #ddd; }
        .summary-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; }
        .summary-row.total { font-weight: bold; font-size: 14px; border-top: 1px solid #ddd; padding-top: 10px; }
        .footer { text-align: center; padding-top: 20px; border-top: 1px solid #ddd; font-size: 10px; color: #666; }
      </style>
    </head>
    <body>
      <div class="invoice">
        <div class="header">
          <h1>CLUB SKYPARK</h1>
          <p>FINAL BILL & INVOICE</p>
        </div>
        <div class="details">
          <div>
            <h3>GUEST INFORMATION</h3>
            <div class="detail-row"><strong>Name:</strong> <span>${booking?.guest_name || 'N/A'}</span></div>
            <div class="detail-row"><strong>Phone:</strong> <span>${booking?.guest_phone || 'N/A'}</span></div>
            <div class="detail-row"><strong>Email:</strong> <span>${booking?.guest_email || 'N/A'}</span></div>
          </div>
          <div>
            <h3>STAY DETAILS</h3>
            <div class="detail-row"><strong>Check-in:</strong> <span>${booking?.check_in || 'N/A'}</span></div>
            <div class="detail-row"><strong>Check-out:</strong> <span>${booking?.check_out || 'N/A'}</span></div>
            <div class="detail-row"><strong>Room:</strong> <span>${room?.room_number || 'N/A'} - ${room?.room_type || 'N/A'}</span></div>
          </div>
        </div>
        <table class="charges-table">
          <thead>
            <tr><th>Description</th><th class="amount">Amount (â‚¹)</th></tr>
          </thead>
          <tbody>
            ${charges.map(c => `<tr><td>${c.description}</td><td class="amount">${c.amount.toFixed(2)}</td></tr>`).join('')}
          </tbody>
        </table>
        <div class="summary">
          <div class="summary-row"><span>Subtotal:</span> <span>â‚¹${subtotal.toFixed(2)}</span></div>
          <div class="summary-row"><span>GST (18%):</span> <span>â‚¹${gst.toFixed(2)}</span></div>
          <div class="summary-row total"><span>TOTAL:</span> <span>â‚¹${total.toFixed(2)}</span></div>
        </div>
        <div class="footer">
          <p>Thank you for your stay! We look forward to seeing you again.</p>
          <p>Hotel Contact: +91 79748 23267 | Email: clubskyparkhotel@gmail.com</p>
          <p>Generated: ${new Date().toLocaleString('en-IN')}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

router.get('/print/grc/:booking_id', requireAuth, (req, res) => {
  const booking = store.find('bookings', b => String(b.id) === String(req.params.booking_id));
  const guest = store.find('guests', g => String(g.booking_id) === String(req.params.booking_id));
  const room = booking?.room_id ? store.find('rooms', r => String(r.id) === String(booking.room_id)) : null;

  if (!booking || !guest) return res.status(404).json({ error: 'Booking or guest not found.' });

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(generateGRCHTML(guest, booking, room));
});

router.get('/print/bill/:booking_id', requireAuth, (req, res) => {
  const booking = store.find('bookings', b => String(b.id) === String(req.params.booking_id));
  const room = booking?.room_id ? store.find('rooms', r => String(r.id) === String(booking.room_id)) : null;
  const checkoutRecord = store.find('checkouts', c => String(c.booking_id) === String(req.params.booking_id));

  if (!booking) return res.status(404).json({ error: 'Booking not found.' });

  const charges = [
    { description: `Room Charge (${room?.room_type})`, amount: booking.total_price || 0 }
  ];

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(generateBillHTML(booking, room, charges));
});

module.exports = router;

