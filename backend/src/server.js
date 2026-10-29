require('dotenv').config();

const { validateEnv } = require('./config');
const { initDb, existingStaffCount } = require('./db');

validateEnv({ staffCount: existingStaffCount() });
initDb();

const apiRoutes = require('./routes');
const { createApp } = require('./app');

const port = Number(process.env.PORT || 3000);

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

createApp().listen(port, () => {
  console.log(`Club Skypark backend running at http://localhost:${port}`);
});
