require('dotenv').config();

const path = require('path');
const cors = require('cors');
const express = require('express');
const morgan = require('morgan');
const apiRoutes = require('./routes');
const { initDb } = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
const frontendPath = path.join(__dirname, '..', '..', 'frontend');

initDb();

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(morgan('dev'));
app.use('/api', apiRoutes);
app.use(express.static(frontendPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`Club Skypark backend running at http://localhost:${port}`);
});

