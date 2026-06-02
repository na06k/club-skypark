require('dotenv').config();

const path = require('path');
const cors = require('cors');
const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const apiRoutes = require('./routes');
const { initDb } = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
const frontendPath = path.join(__dirname, '..', '..', 'frontend');

initDb();

if (typeof apiRoutes.runAutomations === 'function') {
  apiRoutes.runAutomations();
  const automationTimer = setInterval(() => {
    try {
      apiRoutes.runAutomations();
    } catch (error) {
      console.error('Reservation automation failed:', error);
    }
  }, 60000);
  automationTimer.unref?.();
}

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' }
}));
app.use(morgan('dev'));
app.use('/api', apiRoutes);
app.use(express.static(frontendPath));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found.' });
  }
  res.status(404).sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`Club Skypark backend running at http://localhost:${port}`);
});

