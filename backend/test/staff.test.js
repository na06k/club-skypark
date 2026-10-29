const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('../test-support/helpers');
helpers.setupEnv();

let app;
test.before(async () => { app = await helpers.startApp(); });
test.after(async () => { await app.close(); });

const newStaffBody = (role, extra = {}) => ({ name: 'New Person', email: `${role}-${Math.random().toString(36).slice(2, 8)}@test.local`, password: 'Long-Password-1', role, ...extra });

test('super admin can create a manager', async () => {
  const token = await app.login();
  const result = await app.call('POST', '/api/staff', { token, body: newStaffBody('manager') });
  assert.equal(result.status, 201);
  assert.equal(result.json.staff.password_hash, undefined);
});

test('someone with staff.create cannot create a super admin', async () => {
  const helper = app.createStaff({ role: 'reception', permissions: ['staff.create', 'staff.view'] });
  const token = await app.login(helper.email, helper.password);
  const result = await app.call('POST', '/api/staff', { token, body: newStaffBody('super_admin') });
  assert.equal(result.status, 403);
});

test('someone with staff.edit cannot take over the super admin account', async () => {
  const helper = app.createStaff({ role: 'reception', permissions: ['staff.edit', 'staff.view'] });
  const token = await app.login(helper.email, helper.password);
  const admin = app.store.find('staff', (staff) => staff.role === 'super_admin');
  const takeover = await app.call('PATCH', `/api/staff/${admin.id}`, { token, body: { password: 'Hacked-Password-1' } });
  assert.equal(takeover.status, 403);
  const promoteSelf = await app.call('PATCH', `/api/staff/${helper.id}`, { token, body: { role: 'super_admin' } });
  assert.equal(promoteSelf.status, 403);
  // admin can still log in with the real password
  assert.ok(await app.login());
});

test('someone cannot hand out permissions they do not hold', async () => {
  const helper = app.createStaff({ role: 'reception', permissions: ['staff.create', 'staff.permissions', 'staff.view'] });
  const token = await app.login(helper.email, helper.password);
  const result = await app.call('POST', '/api/staff', { token, body: newStaffBody('reception', { permissions: ['reports.gst', 'ledger.create'] }) });
  assert.equal(result.status, 403);
});

test('the last super admin cannot be demoted', async () => {
  const token = await app.login();
  const admin = app.store.find('staff', (staff) => staff.role === 'super_admin');
  const result = await app.call('PATCH', `/api/staff/${admin.id}`, { token, body: { role: 'manager' } });
  assert.equal(result.status, 400);
});

test('duplicate staff email is refused, ignoring letter case', async () => {
  const token = await app.login();
  const body = newStaffBody('manager');
  assert.equal((await app.call('POST', '/api/staff', { token, body })).status, 201);
  const again = await app.call('POST', '/api/staff', { token, body: { ...body, email: body.email.toUpperCase() } });
  assert.equal(again.status, 409);
});
