require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ───────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks',    require('./routes/tasks'));
app.use('/api/users',    require('./routes/users'));

// Activity endpoint (separate so it doesn't conflict with /users/:id)
app.get('/api/activity', require('./middleware/auth'), async (req, res) => {
  const pool = require('./db/pool');
  try {
    const result = await pool.query(
      'SELECT * FROM activity ORDER BY created_at DESC LIMIT 30'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Health check ─────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ─── Catch-all: serve index.html for SPA routing ──────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 ProjectPilot running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
});
