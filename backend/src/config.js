const WEAK_SECRETS = ['', 'change-this-secret-before-production', 'secret', 'changeme', 'change-me'];
const WEAK_ADMIN_PASSWORDS = ['', 'admin123', 'admin', 'password', '123456'];

const isProduction = () => process.env.NODE_ENV === 'production';

function isWeakSecret(secret) {
  return WEAK_SECRETS.includes(String(secret || '').trim()) || String(secret || '').length < 32;
}

// Fails loudly in production, only warns during local development.
function validateEnv({ staffCount = 0 } = {}) {
  const problems = [];

  if (isWeakSecret(process.env.JWT_SECRET)) {
    problems.push('JWT_SECRET is missing, default, or shorter than 32 characters.');
  }
  if (staffCount === 0 && WEAK_ADMIN_PASSWORDS.includes(String(process.env.ADMIN_PASSWORD || '').trim())) {
    problems.push('ADMIN_PASSWORD is missing or weak (needed to create the first admin).');
  }

  if (problems.length === 0) return;

  if (isProduction()) {
    throw new Error(`Refusing to start in production:\n - ${problems.join('\n - ')}`);
  }
  problems.forEach((problem) => console.warn(`\x1b[33mWARNING (dev only): ${problem}\x1b[0m`));
}

function allowedOrigins() {
  return String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

module.exports = { validateEnv, isProduction, isWeakSecret, allowedOrigins };
