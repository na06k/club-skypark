const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { store, now, today, nextId } = require('./db');
const { requireAuth, requireRole, jwtSecret } = require('./middleware');

const router = express.Router();

const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const dateOnly = (value) => String(value || '').slice(0, 10);
const inRange = (value, from, to) => {
  const date = dateOnly(value);
  return (!from || date >= from) && (!to || date <= to);
};
const nightsBetween = (checkIn, checkOut) => {
  const nights = (new Date(checkOut) - new Date(checkIn)) / 86400000;
  return Math.max(1, Number.isFinite(nights) ? nights : 1);
};

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
  status: z.enum(['vacant', 'occupied', 'reserved', 'maintenance']).default('vacant')
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
  return safeStaff;
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

function runReservationAutomation(data) {
  const currentDate = today();
  const activeGuests = new Set(data.guests.filter((guest) => !guest.check_out_date).map((guest) => String(guest.room_id)));
  const activeReservations = new Set(
    data.bookings
      .filter((booking) => booking.room_id && ['reserved', 'confirmed', 'checked_in'].includes(booking.status))
      .filter((booking) => dateOnly(booking.check_out) >= currentDate)
      .map((booking) => String(booking.room_id))
  );

  data.rooms = data.rooms.map((room) => {
    if (room.status === 'maintenance') return room;
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
  const next = data.receipts.length + 1;
  return `CS-${year}-${String(next).padStart(4, '0')}`;
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

router.post('/public/bookings', (req, res) => {
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please complete all booking details correctly.' });

  const totalPrice = money(parsed.data.total_price);
  const paidAmount = money(parsed.data.paid_amount);
  if (paidAmount > totalPrice) {
    return res.status(400).json({ error: 'Paid amount cannot be greater than total amount.' });
  }

  const balanceAmount = money(totalPrice - paidAmount);
  const paymentStatus = paidAmount <= 0 ? 'unpaid' : balanceAmount <= 0 ? 'paid' : 'advance_paid';

  const result = store.transaction((data) => {
    const booking = {
      id: nextId(data.bookings),
      ...parsed.data,
      room_id: parsed.data.room_id ? String(parsed.data.room_id) : null,
      total_price: totalPrice,
      paid_amount: paidAmount,
      balance_amount: balanceAmount,
      payment_method: parsed.data.payment_method || 'pay_at_hotel',
      payment_reference: parsed.data.payment_reference || '',
      payment_notes: parsed.data.payment_notes || '',
      payment_status: paymentStatus,
      status: 'pending',
      created_at: now()
    };
    data.bookings.push(booking);

    let payment = null;
    if (paidAmount > 0) {
      payment = {
        id: nextId(data.payments),
        booking_id: booking.id,
        amount: paidAmount,
        method: booking.payment_method,
        reference: booking.payment_reference,
        notes: booking.payment_notes,
        status: 'pending',
        created_at: now()
      };
      data.payments.push(payment);
    }

    return { booking, payment };
  });

  res.status(201).json(result);
});

router.use(requireAuth);
router.use((req, res, next) => {
  store.transaction((data) => {
    runReservationAutomation(data);
    return null;
  });
  next();
});

router.get('/dashboard', (req, res) => {
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

router.get('/bookings', (req, res) => {
  const bookings = store.all('bookings').sort((a, b) => b.created_at.localeCompare(a.created_at)).map(withRoom);
  res.json({ bookings });
});

router.patch('/bookings/:id/status', (req, res) => {
  const parsed = z.object({ status: z.enum(['pending', 'reserved', 'confirmed', 'cancelled', 'checked_in', 'checked_out', 'completed']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid booking status.' });

  const booking = store.update('bookings', req.params.id, { status: parsed.data.status });
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  res.json({ booking: withRoom(booking) });
});

router.get('/rooms', (req, res) => {
  const floorOrder = { 'Ground Floor': 0, '1st Floor': 1, '2nd Floor': 2, '3rd Floor': 3 };
  const rooms = store.all('rooms').sort((a, b) => {
    const floorDiff = (floorOrder[a.floor] ?? 99) - (floorOrder[b.floor] ?? 99);
    return floorDiff || String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true });
  });
  res.json({ rooms });
});

router.post('/rooms', requireRole('super_admin', 'manager'), (req, res) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid room details.' });

  const exists = store.find('rooms', (room) => room.room_number === parsed.data.room_number);
  if (exists) return res.status(409).json({ error: 'Room number already exists.' });
  res.status(201).json({ room: store.insert('rooms', parsed.data) });
});

router.patch('/rooms/:id', requireRole('super_admin', 'manager'), (req, res) => {
  const parsed = roomSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid room details.' });

  const room = store.update('rooms', req.params.id, parsed.data);
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  res.json({ room });
});

router.delete('/rooms/:id', requireRole('super_admin', 'manager'), (req, res) => {
  store.delete('rooms', req.params.id);
  res.status(204).end();
});

router.get('/reservations', (req, res) => {
  const reservations = store.all('bookings')
    .filter((booking) => ['pending', 'reserved', 'confirmed'].includes(booking.status))
    .sort((a, b) => String(a.check_in).localeCompare(String(b.check_in)))
    .map(withRoom);
  res.json({ reservations });
});

router.post('/reservations', (req, res) => {
  const schema = bookingSchema.extend({ total_price: z.coerce.number().nonnegative().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid reservation details.' });
  if (!parsed.data.room_id) return res.status(400).json({ error: 'Please select a room for reservation.' });

  const room = store.find('rooms', (item) => String(item.id) === String(parsed.data.room_id));
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  if (room.status === 'occupied' || room.status === 'maintenance') return res.status(409).json({ error: 'Room is not available.' });

  const total_price = parsed.data.total_price ?? money(Number(room.price) * nightsBetween(parsed.data.check_in, parsed.data.check_out));
  const booking = store.transaction((data) => {
    const item = {
      id: nextId(data.bookings),
      ...parsed.data,
      room_id: String(parsed.data.room_id),
      room_name: parsed.data.room_name || room.room_type,
      total_price,
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

router.get('/guests/active', (req, res) => {
  const guests = store.all('guests')
    .filter((guest) => !guest.check_out_date)
    .map((guest) => {
      const room = store.find('rooms', (item) => String(item.id) === String(guest.room_id));
      return { ...guest, room_number: room?.room_number || null };
    })
    .sort((a, b) => b.check_in_date.localeCompare(a.check_in_date));
  res.json({ guests });
});

router.post('/checkins', (req, res) => {
  const parsed = z.object({
    name: z.string().min(2),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    room_id: z.coerce.number().int().positive(),
    booking_id: z.coerce.number().int().positive().optional().nullable(),
    documents: z.array(documentSchema).optional().default([])
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid guest details.' });

  const room = store.find('rooms', (item) => String(item.id) === String(parsed.data.room_id));
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  if (room.status === 'occupied' || room.status === 'maintenance') return res.status(409).json({ error: 'Room is not available for check-in.' });

  const guest = store.transaction((data) => {
    const item = {
      id: nextId(data.guests),
      name: parsed.data.name,
      email: parsed.data.email || '',
      phone: parsed.data.phone || '',
      room_id: String(parsed.data.room_id),
      booking_id: parsed.data.booking_id ? String(parsed.data.booking_id) : null,
      check_in_date: now(),
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
    return item;
  });

  res.status(201).json({ guest });
});

router.post('/checkouts/:guestId', (req, res) => {
  const guest = store.find('guests', (item) => String(item.id) === String(req.params.guestId) && !item.check_out_date);
  if (!guest) return res.status(404).json({ error: 'Active guest not found.' });

  const updated = store.transaction((data) => {
    const guestIndex = data.guests.findIndex((item) => String(item.id) === String(guest.id));
    data.guests[guestIndex] = { ...data.guests[guestIndex], check_out_date: now() };
    const roomIndex = data.rooms.findIndex((room) => String(room.id) === String(guest.room_id));
    if (roomIndex >= 0) data.rooms[roomIndex] = { ...data.rooms[roomIndex], status: 'vacant' };
    if (guest.booking_id) {
      const bookingIndex = data.bookings.findIndex((booking) => String(booking.id) === String(guest.booking_id));
      if (bookingIndex >= 0) data.bookings[bookingIndex] = { ...data.bookings[bookingIndex], status: 'checked_out' };
    }
    return data.guests[guestIndex];
  });

  res.json({ guest: updated });
});

router.get('/guests/:id/documents', (req, res) => {
  const documents = store.all('guest_documents')
    .filter((doc) => String(doc.guest_id) === String(req.params.id))
    .map(({ data_url, ...doc }) => doc);
  res.json({ documents });
});

router.post('/guest-documents', (req, res) => {
  const parsed = documentSchema.extend({ guest_id: z.coerce.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid document details.' });
  const guest = store.find('guests', (item) => String(item.id) === String(parsed.data.guest_id));
  if (!guest) return res.status(404).json({ error: 'Guest not found.' });
  const document = store.insert('guest_documents', { ...parsed.data, guest_id: String(parsed.data.guest_id), uploaded_at: now() });
  const { data_url, ...safeDocument } = document;
  res.status(201).json({ document: safeDocument });
});

router.get('/guest-documents/:id/download', (req, res) => {
  const doc = store.find('guest_documents', (item) => String(item.id) === String(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  const base64 = doc.data_url.includes(',') ? doc.data_url.split(',')[1] : doc.data_url;
  res.setHeader('Content-Type', doc.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`);
  res.send(Buffer.from(base64, 'base64'));
});

router.get('/payments', requireRole('super_admin', 'manager'), (req, res) => {
  const payments = store.all('payments').sort((a, b) => b.created_at.localeCompare(a.created_at)).map(withBooking);
  res.json({ payments });
});

router.post('/payments', requireRole('super_admin', 'manager'), (req, res) => {
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

router.get('/restaurant-orders', requireRole('super_admin', 'restaurant'), (req, res) => {
  const orders = store.all('restaurant_orders').sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({ orders });
});

router.post('/restaurant-orders', requireRole('super_admin', 'restaurant'), (req, res) => {
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

router.get('/items', (req, res) => {
  const type = req.query.type;
  const items = store.all('items').filter((item) => !type || item.item_type === type).sort((a, b) => a.name.localeCompare(b.name));
  res.json({ items });
});

router.post('/items', requireRole('super_admin', 'manager', 'restaurant'), (req, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid item details.' });
  res.status(201).json({ item: store.insert('items', parsed.data) });
});

router.patch('/items/:id', requireRole('super_admin', 'manager', 'restaurant'), (req, res) => {
  const parsed = itemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid item details.' });
  const item = store.update('items', req.params.id, parsed.data);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  res.json({ item });
});

router.get('/store-items', requireRole('super_admin', 'manager'), (req, res) => {
  const items = store.all('store_items').sort((a, b) => a.name.localeCompare(b.name));
  res.json({ items });
});

router.post('/store-items', requireRole('super_admin', 'manager'), (req, res) => {
  const parsed = storeItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid store item details.' });
  const item = store.insert('store_items', parsed.data);
  res.status(201).json({ item });
});

router.patch('/store-items/:id', requireRole('super_admin', 'manager'), (req, res) => {
  const parsed = storeItemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid store item details.' });
  const item = store.update('store_items', req.params.id, parsed.data);
  if (!item) return res.status(404).json({ error: 'Store item not found.' });
  res.json({ item });
});

router.post('/store-items/:id/movements', requireRole('super_admin', 'manager'), (req, res) => {
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

router.get('/stock-movements', requireRole('super_admin', 'manager'), (req, res) => {
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

router.get('/receipts', requireRole('super_admin', 'manager'), (req, res) => {
  const data = { receipts: store.all('receipts'), receipt_items: store.all('receipt_items') };
  const receipts = data.receipts.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((receipt) => listReceiptDetails(data, receipt));
  res.json({ receipts });
});

router.get('/receipts/:id', requireRole('super_admin', 'manager'), (req, res) => {
  const data = { receipts: store.all('receipts'), receipt_items: store.all('receipt_items') };
  const receipt = data.receipts.find((item) => String(item.id) === String(req.params.id));
  if (!receipt) return res.status(404).json({ error: 'Receipt not found.' });
  res.json({ receipt: listReceiptDetails(data, receipt) });
});

router.post('/receipts', requireRole('super_admin', 'manager'), (req, res) => {
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

router.get('/ledger', requireRole('super_admin', 'manager'), (req, res) => {
  const from = req.query.from || req.query.date;
  const to = req.query.to || req.query.date;
  const entries = store.all('ledger_entries').filter((entry) => inRange(entry.entry_date || entry.created_at, from, to)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const credit = money(entries.filter((entry) => entry.type === 'credit').reduce((sum, entry) => sum + Number(entry.amount), 0));
  const debit = money(entries.filter((entry) => entry.type === 'debit').reduce((sum, entry) => sum + Number(entry.amount), 0));
  res.json({ entries, summary: { credit, debit, balance: money(credit - debit) } });
});

router.post('/ledger', requireRole('super_admin', 'manager'), (req, res) => {
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

router.get('/reports/daily', requireRole('super_admin', 'manager'), (req, res) => {
  const reportDate = req.query.date || today();
  const rooms = store.all('rooms');
  const guests = store.all('guests');
  const orders = store.all('restaurant_orders').filter((order) => dateOnly(order.created_at) === reportDate);
  const movements = store.all('stock_movements').filter((movement) => dateOnly(movement.movement_date || movement.created_at) === reportDate);
  const receipts = store.all('receipts').filter((receipt) => dateOnly(receipt.receipt_date || receipt.created_at) === reportDate);
  const ledger = store.all('ledger_entries').filter((entry) => dateOnly(entry.entry_date || entry.created_at) === reportDate);
  const reservations = store.all('bookings').filter((booking) => dateOnly(booking.created_at) === reportDate || dateOnly(booking.check_in) === reportDate).map(withRoom);
  const checkins = guests.filter((guest) => dateOnly(guest.check_in_date) === reportDate);
  const checkouts = guests.filter((guest) => dateOnly(guest.check_out_date) === reportDate);

  res.json({
    date: reportDate,
    summary: {
      checkins: checkins.length,
      checkouts: checkouts.length,
      reservations: reservations.length,
      occupied_rooms: rooms.filter((room) => room.status === 'occupied').length,
      reserved_rooms: rooms.filter((room) => room.status === 'reserved').length,
      vacant_rooms: rooms.filter((room) => room.status === 'vacant').length,
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

router.post('/reports/daily/close', requireRole('super_admin', 'manager'), (req, res) => {
  const reportDate = req.body?.date || today();
  const existing = store.find('daily_report_closings', (closing) => closing.date === reportDate);
  if (existing) return res.status(409).json({ error: 'Daily report already closed for this date.' });
  const closing = store.insert('daily_report_closings', { date: reportDate, closed_by: req.user.email, closed_at: now() });
  res.status(201).json({ closing });
});

router.get('/reports/gst', requireRole('super_admin', 'manager'), (req, res) => {
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

router.get('/staff', requireRole('super_admin'), (req, res) => {
  const staff = store.all('staff').map(withoutPassword).sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({ staff });
});

router.post('/staff', requireRole('super_admin'), (req, res) => {
  const parsed = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['super_admin', 'manager', 'restaurant', 'reception'])
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid staff details.' });

  const exists = store.find('staff', (staff) => staff.email === parsed.data.email);
  if (exists) return res.status(409).json({ error: 'Staff email already exists.' });

  const staff = store.insert('staff', {
    name: parsed.data.name,
    email: parsed.data.email,
    password_hash: bcrypt.hashSync(parsed.data.password, 10),
    role: parsed.data.role
  });
  res.status(201).json({ staff: withoutPassword(staff) });
});

module.exports = router;
