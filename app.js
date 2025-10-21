// server/app.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const mongoose = require('mongoose');

const { connectDB, disconnectDB } = require('./db');

const themeRoutes = require('./routes/themeRoutes');
const resultRoutes = require('./routes/resultRoutes');
const mbtiRoutes = require('./routes/mbtiRoutes');

const app = express();
const PORT = process.env.PORT || 4000;
const ORIGIN = process.env.CORS_ORIGIN || '*';

// --- Middlewares ---
app.use(helmet());
app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// --- Health & Base routes ---
app.get('/', (_req, res) => {
  res.send('MBTI API is running.');
});

app.get('/healthz', (_req, res) => {
  // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  const dbState = mongoose.connection.readyState;
  const ok = dbState === 1;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    dbState,
    uptime: process.uptime(),
    env: process.env.NODE_ENV || 'development',
  });
});

app.use('/themes', themeRoutes);
app.use('/results', resultRoutes);
app.use('/mbti', mbtiRoutes);

connectDB()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });

    // Graceful shutdown
    const shutdown = (signal) => async () => {
      console.log(`\n${signal} received. Shutting down…`);
      server.close(async () => {
        try {
          await disconnectDB();
          console.log('HTTP server closed & MongoDB disconnected. Bye!');
          process.exit(0);
        } catch (err) {
          console.error('Error during shutdown:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', shutdown('SIGINT'));
    process.on('SIGTERM', shutdown('SIGTERM'));
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

module.exports = app;
