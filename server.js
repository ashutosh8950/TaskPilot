require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { config } = require('./src/config');

const authRoutes     = require('./src/routes/auth');
const projectRoutes  = require('./src/routes/projects');
const taskRoutes     = require('./src/routes/tasks');
const memberRoutes   = require('./src/routes/members');
const activityRoutes = require('./src/routes/activities');
const { initDB }     = require('./src/db');

const app = express();
app.disable('x-powered-by');
if (!app.get('trust proxy')) {
  app.set('trust proxy', 1);
}

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      'font-src': ['https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"]
    }
  }
}));

// Same-origin requests work without CORS headers; configured origins get them.
app.use(cors({
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Limit'],
  origin(origin, callback) {
    if (!config.isProduction) return callback(null, true);
    if (!origin) return callback(null, false);
    if (config.corsOrigins.includes(origin)) return callback(null, origin);
    return callback(null, false);
  },
  credentials: true
}));

// Request logging
app.use(morgan(config.isProduction ? 'combined' : 'dev'));

// Body parser with size limit
app.use(express.json({ limit: '1mb' }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  return next(err);
});

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  skip: req => req.path === '/health',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth',       authRoutes);
app.use('/api/projects',   projectRoutes);
app.use('/api/tasks',      taskRoutes);
app.use('/api/members',    memberRoutes);
app.use('/api/activities', activityRoutes);

// Health check (before SPA fallback)
app.get('/api/health', async (req, res) => {
  try {
    const db = require('./src/db');
    await db.query('SELECT 1');
    res.json({
      status: 'healthy',
      service: 'taskpilot',
      environment: config.nodeEnv,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

app.use((err, req, res, next) => {
  if (!req.path.startsWith('/api')) return next(err);
  console.error(err);
  return res.status(err.status || 500).json({ error: 'Server error' });
});

// SPA fallback
app.get('*', (req, res) => {
  if (path.extname(req.path)) return res.status(404).end();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;

if (require.main === module) {
  initDB().then(() => {
    const server = app.listen(config.port, () => {
      console.log(`TaskPilot running on port ${config.port}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully...');
      server.close(() => process.exit(0));
    });
  }).catch(err => {
    console.error('DB init failed:', err);
    process.exit(1);
  });
}
