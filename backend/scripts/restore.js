// Usage: npm run restore -- <backup-file> <target-file>
// The target must be given explicitly so a test restore can never touch the live data by accident.
const fs = require('fs');
const path = require('path');

const [backupArg, targetArg] = process.argv.slice(2);
if (!backupArg || !targetArg) {
  console.error('Usage: npm run restore -- <backup-file> <target-file>');
  process.exit(1);
}

const backupFile = path.resolve(backupArg);
const targetFile = path.resolve(targetArg);
const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
if (!Array.isArray(data.staff) || !Array.isArray(data.bookings)) {
  console.error('This does not look like a Club Sky Park backup.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(targetFile), { recursive: true });
fs.copyFileSync(backupFile, targetFile);
console.log(`Restored ${backupFile} -> ${targetFile} (${data.bookings.length} bookings, ${data.staff.length} staff)`);
