// Shared test helpers. Every test file runs in its own process with its own temporary data file.
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');

const ADMIN_EMAIL = 'admin@test.local';
const ADMIN_PASSWORD = 'Test-Password-123';

function setupEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-skypark-test-'));
  process.env.DATA_FILE = path.join(dir, 'data.json');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-1234567890';
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  return process.env.DATA_FILE;
}

async function startApp(options = {}) {
  const { initDb, store } = require('../src/db');
  initDb();
  const { createApp } = require('../src/app');
  const server = createApp({ logRequests: false, ...options }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, route, { token, body, headers = {}, raw } = {}) {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: {
        ...(raw === undefined ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      body: ['GET', 'HEAD'].includes(method) ? undefined : (raw !== undefined ? raw : (body === undefined ? undefined : JSON.stringify(body)))
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (error) { /* not json */ }
    return { status: response.status, headers: response.headers, json, text };
  }

  async function login(email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
    const result = await call('POST', '/api/auth/login', { body: { email, password } });
    return result.json && result.json.token;
  }

  function createStaff({ role = 'reception', permissions, email } = {}) {
    const staffEmail = email || `${role}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const password = 'Another-Password-1';
    const record = store.insert('staff', {
      name: `Test ${role}`,
      email: staffEmail,
      password_hash: bcrypt.hashSync(password, 4),
      role,
      permissions: permissions || []
    });
    return { id: record.id, email: staffEmail, password };
  }

  return { base, call, login, createStaff, store, close: () => new Promise((resolve) => server.close(resolve)) };
}

function futureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

module.exports = { setupEnv, startApp, futureDate, ADMIN_EMAIL, ADMIN_PASSWORD };
