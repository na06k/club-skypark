// Usage: npm run backup  -> copies the live data file into backend/backups/ (keeps the newest 30).
const fs = require('fs');
const path = require('path');

const dataFile = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(__dirname, '..', 'data', 'club-skypark.json');
const backupDir = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(__dirname, '..', 'backups');
const KEEP = 30;

if (!fs.existsSync(dataFile)) {
  console.error(`No data file found at ${dataFile}`);
  process.exit(1);
}

const contents = fs.readFileSync(dataFile, 'utf8');
JSON.parse(contents); // never back up a corrupt file

fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(backupDir, `club-skypark-${stamp}.json`);
fs.writeFileSync(target, contents);

fs.readdirSync(backupDir)
  .filter((name) => /^club-skypark-.*\.json$/.test(name))
  .sort()
  .slice(0, -KEEP)
  .forEach((name) => fs.unlinkSync(path.join(backupDir, name)));

console.log(`Backup saved: ${target}`);
