const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

test('backup then restore into a separate file gives identical data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-backup-'));
  const live = path.join(dir, 'live.json');
  fs.writeFileSync(live, JSON.stringify({ staff: [{ id: '1' }], bookings: [{ id: '7', guest_name: 'Test' }] }));
  const env = { ...process.env, DATA_FILE: live, BACKUP_DIR: path.join(dir, 'backups') };
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'backup.js')], { env });
  const [backupName] = fs.readdirSync(path.join(dir, 'backups'));
  const restored = path.join(dir, 'restored.json');
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'restore.js'), path.join(dir, 'backups', backupName), restored], { env });
  assert.equal(fs.readFileSync(restored, 'utf8'), fs.readFileSync(live, 'utf8'));
});

test('backup refuses a corrupt data file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-backup-'));
  const live = path.join(dir, 'live.json');
  fs.writeFileSync(live, '{broken');
  assert.throws(() => execFileSync('node', [path.join(__dirname, '..', 'scripts', 'backup.js')], { env: { ...process.env, DATA_FILE: live, BACKUP_DIR: path.join(dir, 'b') }, stdio: 'pipe' }));
});
