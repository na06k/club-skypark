const crypto = require('crypto');
const path = require('path');
const cors = require('cors');
const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const apiRoutes = require('./routes');
const { allowedOrigins, isProduction } = require('./config');

const frontendPath = path.join(__dirname, '..', '..', 'frontend');

function limiter(windowMs, max, error) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error }
  });
}

// options.limits lets tests use tiny limits; real values are the defaults.
function createApp(options = {}) {
  const limits = {
    login: 10,
    publicBooking: 10,
    publicEnquiry: 10,
    api: 600,
    ...(options.limits || {})
  };
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    req.id = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    if (isProduction()) {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  });

  // Same-origin requests need no CORS. Cross-origin only for CORS_ORIGINS (and localhost while developing).
  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const allowed = allowedOrigins();
      const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
      if (allowed.includes(origin) || (!isProduction() && isLocal)) return callback(null, true);
      return callback(null, false);
    }
  }));

  // Guest ID documents are the only requests allowed to be large.
  const largeJson = express.json({ limit: '12mb' });
  app.use('/api/guest-documents', largeJson);
  app.use('/api/checkins', largeJson);
  app.use(express.json({ limit: '1mb' }));

  if (options.logRequests !== false) {
    morgan.token('id', (req) => req.id);
    app.use(morgan(':id :method :url :status :response-time ms'));
  }

  app.use('/api', limiter(60 * 1000, limits.api, 'Too many requests. Please slow down.'));
  app.use('/api/auth/login', limiter(15 * 60 * 1000, limits.login, 'Too many login attempts. Please try again after 15 minutes.'));
  app.use('/api/public/bookings', limiter(60 * 60 * 1000, limits.publicBooking, 'Too many booking requests. Please call the hotel to book.'));
  app.use('/api/public/enquiries', limiter(60 * 60 * 1000, limits.publicEnquiry, 'Too many enquiries. Please call the hotel.'));

  app.use('/api', apiRoutes);

  // Old backup-before-* copies live inside frontend/. They must never be downloadable.
  app.use((req, res, next) => {
    let requested = req.path;
    try {
      requested = decodeURIComponent(req.path);
    } catch (error) {
      return res.status(400).end();
    }
    if (/(^|\/)backup-/i.test(requested)) return res.status(404).end();
    return next();
  });
  app.use(express.static(frontendPath));

  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API route not found.' });
    }
    return res.status(404).sendFile(path.join(frontendPath, 'index.html'));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON in request.' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request is too large.' });
    }
    console.error(`[${req.id}] Unhandled error:`, error);
    return res.status(500).json({ error: 'Something went wrong. Please try again.', request_id: req.id });
  });

  return app;
}

module.exports = { createApp };
