const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('../test-support/helpers');
helpers.setupEnv();

let app;
let token;
let guestId;
test.before(async () => {
  app = await helpers.startApp();
  token = await app.login();
  guestId = app.store.insert('guests', { name: 'Doc Guest', status: 'active' }).id;
});
test.after(async () => { await app.close(); });

const png = 'data:image/png;base64,' + Buffer.from('fake-png-bytes-for-testing').toString('base64');

test('rejects file types that are not PDF/JPG/PNG/WEBP', async () => {
  const result = await app.call('POST', '/api/guest-documents', { token, body: { guest_id: guestId, document_type: 'ID', file_name: 'x.html', mime_type: 'text/html', data_url: 'data:text/html;base64,PGgxPmhpPC9oMT4=' } });
  assert.equal(result.status, 400);
});

test('rejects files larger than 8 MB', async () => {
  const big = 'data:application/pdf;base64,' + 'A'.repeat(11 * 1024 * 1024);
  const result = await app.call('POST', '/api/guest-documents', { token, body: { guest_id: guestId, document_type: 'ID', file_name: 'big.pdf', mime_type: 'application/pdf', data_url: big } });
  assert.equal(result.status, 400);
});

test('stores an allowed file and downloads it safely with a cleaned filename', async () => {
  const upload = await app.call('POST', '/api/guest-documents', { token, body: { guest_id: guestId, document_type: 'Aadhaar', file_name: 'aadhaar"\r\nX-Evil: 1.png', mime_type: 'image/png', data_url: png } });
  assert.equal(upload.status, 201);
  assert.equal(upload.json.document.data_url, undefined);
  const download = await app.call('GET', `/api/guest-documents/${upload.json.document.id}/download`, { token });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(download.headers.get('x-evil'), null);
  assert.ok(!/[\r\n"]/.test(download.headers.get('content-disposition').replace(/^attachment; filename="|"$/g, '')));
});

test('legacy documents with a dangerous type are served as an opaque download', async () => {
  const legacy = app.store.insert('guest_documents', { guest_id: String(guestId), document_type: 'old', file_name: 'old.html', mime_type: 'text/html', data_url: 'data:text/html;base64,PGgxPmhpPC9oMT4=' });
  const download = await app.call('GET', `/api/guest-documents/${legacy.id}/download`, { token });
  assert.equal(download.headers.get('content-type'), 'application/octet-stream');
});
