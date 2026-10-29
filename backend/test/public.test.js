const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const helpers = require('../test-support/helpers');
const dataFile = helpers.setupEnv();

let app;
test.before(async () => { app = await helpers.startApp(); });
test.after(async () => { await app.close(); });

const validBooking = (overrides = {}) => ({
  guest_name: 'Rahul Sharma',
  guest_email: 'rahul@example.com',
  guest_phone: '9876543210',
  room_name: 'Premium Rooms',
  guests: 2,
  check_in: helpers.futureDate(2),
  check_out: helpers.futureDate(4),
  ...overrides
});

test('server calculates the price and ignores the total sent by the browser', async () => {
  const result = await app.call('POST', '/api/public/bookings', { body: validBooking({ total_price: 1, paid_amount: 99999, payment_method: 'paid' }) });
  assert.equal(result.status, 201);
  assert.equal(result.json.booking.total_price, 2499 * 2);
  assert.equal(result.json.booking.paid_amount, 0);
  assert.equal(result.json.booking.status, 'pending');
  assert.equal(result.json.booking.payment_method, 'pay_at_hotel');
});

test('rejects past dates, check-out before check-in, too-long stays and unknown rooms', async () => {
  const cases = [
    validBooking({ check_in: '2020-01-01', check_out: '2020-01-03' }),
    validBooking({ check_in: helpers.futureDate(5), check_out: helpers.futureDate(3) }),
    validBooking({ check_in: helpers.futureDate(1), check_out: helpers.futureDate(60) }),
    validBooking({ room_name: 'Free Penthouse' })
  ];
  for (const body of cases) {
    const result = await app.call('POST', '/api/public/bookings', { body });
    assert.equal(result.status, 400, JSON.stringify(body));
  }
});

test('angle brackets are stripped from public text (no script can reach the admin panel)', async () => {
  const result = await app.call('POST', '/api/public/bookings', { body: validBooking({ guest_name: '<script>alert(1)</script>Asha', purpose: '<img src=x onerror=alert(1)>' }) });
  assert.equal(result.status, 201);
  assert.ok(!/[<>]/.test(result.json.booking.guest_name));
  assert.ok(!/[<>]/.test(result.json.booking.purpose));
});

test('public rooms shows only category, price and Available / Sold Out', async () => {
  const before = fs.readFileSync(dataFile, 'utf8');
  const result = await app.call('GET', '/api/public/rooms');
  assert.equal(result.status, 200);
  assert.ok(result.json.rooms.length > 0);
  result.json.rooms.forEach((room) => {
    assert.deepEqual(Object.keys(room).sort(), ['availability', 'price', 'room_type']);
    assert.ok(['Available', 'Sold Out'].includes(room.availability));
  });
  assert.equal(fs.readFileSync(dataFile, 'utf8'), before, 'public read must not write to the database');
});

test('enquiry needs a valid name and phone, and text is cleaned', async () => {
  assert.equal((await app.call('POST', '/api/public/enquiries', { body: { name: 'A', phone: 'abc' } })).status, 400);
  const ok = await app.call('POST', '/api/public/enquiries', { body: { name: 'Neha <b>Jain</b>', phone: '+91 98765 43210', message: '<script>x</script>Wedding for 200' } });
  assert.equal(ok.status, 201);
  assert.ok(!/[<>]/.test(ok.json.enquiry.name + ok.json.enquiry.message));
});

test('public booking is rate limited', async () => {
  const limited = await helpers.startApp({ limits: { publicBooking: 2 } });
  const statuses = [];
  for (let i = 0; i < 3; i += 1) {
    statuses.push((await limited.call('POST', '/api/public/bookings', { body: validBooking() })).status);
  }
  assert.deepEqual(statuses, [201, 201, 429]);
  await limited.close();
});

test('oversized public request body is refused', async () => {
  const result = await app.call('POST', '/api/public/enquiries', { body: { name: 'A'.repeat(2 * 1024 * 1024), phone: '9876543210' } });
  assert.equal(result.status, 413);
});
