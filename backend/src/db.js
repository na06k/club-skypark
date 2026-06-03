const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { normalizePermissions } = require('./permissions');

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'club-skypark.json');

const emptyData = {
  staff: [],
  rooms: [],
  bookings: [],
  checkins: [],
  checkouts: [],
  guests: [],
  guest_preferences: [],
  guest_notes: [],
  guest_flags: [],
  guest_documents: [],
  payments: [],
  payment_reminders: [],
  restaurant_orders: [],
  receipts: [],
  receipt_items: [],
  items: [],
  store_items: [],
  stock_movements: [],
  ledger_entries: [],
  daily_report_closings: [],
  enquiries: [],
  housekeeping_tasks: [],
  housekeeping_checklists: [],
  room_status_history: [],
  laundry_orders: [],
  room_service_orders: [],
  minibar_items: [],
  guest_service_charges: [],
  staff_schedules: [],
  staff_attendance: [],
  attendance: [],
  staff_rosters: [],
  inventory_items: [],
  inventory_movements: [],
  inventory_wastage: [],
  suppliers: [],
  loyalty_members: [],
  loyalty_points: [],
  loyalty_vouchers: [],
  pricing_rules: [],
  notifications: [],
  notification_templates: [],
  email_logs: [],
  sms_logs: [],
  whatsapp_templates: [],
  print_logs: [],
  maintenance_requests: []
};

function now() {
  return new Date().toISOString();
}

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readData() {
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function writeDataIfChanged(data) {
  const next = JSON.stringify(data, null, 2);
  const current = fs.existsSync(dataFile) ? fs.readFileSync(dataFile, 'utf8') : '';
  if (current !== next) {
    fs.writeFileSync(dataFile, next);
  }
}

function nextId(items) {
  return String((items || []).reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1);
}

function seed(data) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@clubskypark.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (data.staff.length === 0) {
    data.staff.push({
      id: '1',
      name: 'Club Skypark Admin',
      email: adminEmail,
      password_hash: bcrypt.hashSync(adminPassword, 10),
      role: 'super_admin',
      permissions: normalizePermissions([], 'super_admin'),
      created_at: now()
    });
  }

  data.staff = data.staff.map((staff) => ({
    ...staff,
    permissions: normalizePermissions(staff.permissions, staff.role)
  }));

  if (data.rooms.length === 0) {
    [
      ['101', 'Presidential Suite', 7499, 'vacant'],
      ['102', 'Executive Suite', 5499, 'vacant'],
      ['103', 'Family Suite', 5499, 'vacant'],
      ['104', 'Club Family Room', 4999, 'vacant'],
      ['105', 'Platinum Room', 2999, 'vacant'],
      ['106', 'Premium Room', 2499, 'vacant']
    ].forEach(([room_number, room_type, price, status], index) => {
      data.rooms.push({
        id: String(index + 1),
        room_number,
        room_type,
        price,
        status,
        created_at: now()
      });
    });
  }

  if (data.items.length === 0) {
    [
      ['restaurant', 'Tea', 'Beverage', 'cup', 40, 5],
      ['restaurant', 'Coffee', 'Beverage', 'cup', 80, 5],
      ['restaurant', 'Paneer Tikka', 'Starter', 'plate', 250, 5],
      ['store', 'Water Bottle', 'Housekeeping', 'bottle', 20, 18]
    ].forEach(([item_type, name, category, unit, price, gst_percent], index) => {
      data.items.push({
        id: String(index + 1),
        item_type,
        name,
        category,
        unit,
        price,
        cost_price: 0,
        gst_percent,
        active: true,
        created_at: now()
      });
    });
  }
}

function initDb() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    writeData(emptyData);
  }
  const data = { ...emptyData, ...readData() };
  seed(data);
  writeDataIfChanged(data);
}

const store = {
  all(table) {
    return readData()[table] || [];
  },

  list(table) {
    return this.all(table);
  },

  find(table, predicate) {
    return this.all(table).find(predicate);
  },

  insert(table, record) {
    const data = { ...emptyData, ...readData() };
    const item = { id: nextId(data[table]), ...record, created_at: record.created_at || now() };
    data[table].push(item);
    writeData(data);
    return item;
  },

  update(table, id, changes) {
    const data = { ...emptyData, ...readData() };
    const index = data[table].findIndex((item) => String(item.id) === String(id));
    if (index === -1) return null;
    data[table][index] = { ...data[table][index], ...changes };
    writeData(data);
    return data[table][index];
  },

  delete(table, id) {
    const data = { ...emptyData, ...readData() };
    const before = data[table].length;
    data[table] = data[table].filter((item) => String(item.id) !== String(id));
    writeData(data);
    return data[table].length !== before;
  },

  transaction(callback) {
    const data = { ...emptyData, ...readData() };
    const result = callback(data);
    writeDataIfChanged(data);
    return result;
  }
};

module.exports = { store, initDb, now, today, nextId };
