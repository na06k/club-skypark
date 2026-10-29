const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const helpers = require('../test-support/helpers');
helpers.setupEnv();

let app;
test.before(async () => { app = await helpers.startApp(); });
test.after(async () => { await app.close(); });

test('login works and returns a token without the password hash', async () => {
  const result = await app.call('POST', '/api/auth/login', { body: { email: helpers.ADMIN_EMAIL, password: helpers.ADMIN_PASSWORD } });
  assert.equal(result.status, 200);
  assert.ok(result.json.token);
  assert.equal(result.json.user.password_hash, undefined);
});

test('login email is case-insensitive', async () => {
  const result = await app.call('POST', '/api/auth/login', { body: { email: helpers.ADMIN_EMAIL.toUpperCase(), password: helpers.ADMIN_PASSWORD } });
  assert.equal(result.status, 200);
});

test('wrong password and unknown email give the identical answer', async () => {
  const wrongPassword = await app.call('POST', '/api/auth/login', { body: { email: helpers.ADMIN_EMAIL, password: 'nope-nope' } });
  const unknownEmail = await app.call('POST', '/api/auth/login', { body: { email: 'nobody@test.local', password: 'nope-nope' } });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(wrongPassword.json, unknownEmail.json);
});

test('every protected endpoint returns 401 without a token', async () => {
  const router = require('../src/routes');
  const publicPaths = new Set(['/health', '/auth/login', '/public/rooms', '/public/bookings', '/public/enquiries']);
  const protectedRoutes = [];
  router.stack.forEach((layer) => {
    if (!layer.route || publicPaths.has(layer.route.path)) return;
    Object.keys(layer.route.methods).forEach((method) => protectedRoutes.push({ method: method.toUpperCase(), path: layer.route.path }));
  });
  assert.ok(protectedRoutes.length > 80, 'expected to discover the full route list');
  for (const route of protectedRoutes) {
    const result = await app.call(route.method, `/api${route.path.replace(/:\w+/g, '1')}`, { body: {} });
    assert.equal(result.status, 401, `${route.method} ${route.path} should require login`);
  }
});

test('a staff member with no permissions gets 403 on every permission-guarded endpoint', async () => {
  const staff = app.createStaff({ role: 'reception', permissions: [] });
  const token = await app.login(staff.email, staff.password);
  assert.ok(token);
  const router = require('../src/routes');
  // Routes that intentionally allow any logged-in user or do their permission check after reading the body.
  const skip = new Set(['/auth/me', '/bookings/:id/status', '/staff/:id', '/restaurant-orders']);
  const failures = [];
  for (const layer of router.stack) {
    if (!layer.route || ['/health', '/auth/login', '/public/rooms', '/public/bookings', '/public/enquiries'].includes(layer.route.path) || skip.has(layer.route.path)) continue;
    for (const method of Object.keys(layer.route.methods)) {
      const result = await app.call(method.toUpperCase(), `/api${layer.route.path.replace(/:\w+/g, '1')}`, { token, body: {} });
      if (result.status !== 403) failures.push(`${method.toUpperCase()} ${layer.route.path} -> ${result.status}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('a token for a deleted staff member stops working immediately', async () => {
  const staff = app.createStaff({ role: 'manager' });
  const token = await app.login(staff.email, staff.password);
  assert.equal((await app.call('GET', '/api/auth/me', { token })).status, 200);
  app.store.delete('staff', staff.id);
  assert.equal((await app.call('GET', '/api/auth/me', { token })).status, 401);
});

test('a forged token signed with the old default secret is rejected', async () => {
  const forged = jwt.sign({ id: '1', role: 'super_admin' }, 'change-this-secret-before-production');
  assert.equal((await app.call('GET', '/api/auth/me', { token: forged })).status, 401);
});

test('bad JSON gets a clean 400 with no stack trace', async () => {
  const result = await app.call('POST', '/api/auth/login', { raw: '{not json' });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'Invalid JSON in request.');
  assert.ok(!result.text.includes('at '), 'must not leak a stack trace');
});

test('security headers and request id are present, x-powered-by is hidden', async () => {
  const result = await app.call('GET', '/api/health');
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(result.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.ok(result.headers.get('x-request-id'));
  assert.equal(result.headers.get('x-powered-by'), null);
});

test('login is rate limited with a Retry-After header', async () => {
  const limited = await helpers.startApp({ limits: { login: 3 } });
  let last;
  for (let i = 0; i < 4; i += 1) {
    last = await limited.call('POST', '/api/auth/login', { body: { email: 'x@test.local', password: 'wrong-wrong' } });
  }
  assert.equal(last.status, 429);
  assert.ok(last.headers.get('retry-after'));
  await limited.close();
});

test('old backup folders inside frontend are not downloadable', async () => {
  const result = await app.call('GET', '/backup-before-white-gold-theme-20260602-130134/index.html');
  assert.equal(result.status, 404);
});
