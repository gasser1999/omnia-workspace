'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { pool } = require('./db');

const authRoutes = require('./routes/auth');
const workspaceRoutes = require('./routes/workspace');
const fileRoutes = require('./routes/files');
const backupRoutes = require('./routes/backup');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: config.maxWorkspaceBytes + 1024 * 64 }));

// CORS only if the frontend is hosted on a different origin.
if (config.allowedOrigin) {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', config.allowedOrigin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'محاولات كثيرة، يرجى المحاولة بعد قليل.' },
});

app.get('/healthz', async (req, res) => {
  try {
    await pool.query('select 1');
    res.json({ ok: true, storage: require('./storage').driver, time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ ok: false, error: 'db_unavailable' });
  }
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/backup', backupRoutes);

// Static frontend (same origin => httpOnly session cookie works).
const publicDir = path.join(__dirname, '..', 'public');
app.use(
  express.static(publicDir, {
    index: 'index.html',
    maxAge: config.isProd ? '1h' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'not_found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'file_too_large', message: 'حجم الملف أكبر من الحد المسموح.' });
  }
  const status = err.status || 500;
  return res.status(status).json({
    error: err.code || 'server_error',
    message: config.isProd ? 'حدث خطأ غير متوقع.' : err.message,
  });
});

const server = app.listen(config.port, () => {
  console.log(`[omnia] listening on :${config.port} (storage=${require('./storage').driver}, env=${config.isProd ? 'production' : 'development'})`);
});

function shutdown(signal) {
  console.log(`[omnia] ${signal} received, shutting down`);
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
