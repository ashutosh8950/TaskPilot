const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db');
const authMW   = require('../middleware/auth');
const { config } = require('../config');

const router = express.Router();

const ALLOW_REGISTRATION = String(process.env.ALLOW_REGISTRATION ?? 'true').toLowerCase() !== 'false';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = email => String(email || '').trim().toLowerCase();

const mapUser = u => ({
  id: u.id, name: u.name, email: u.email,
  role: u.role, createdAt: u.created_at
});

const signToken = u => jwt.sign(
  { id: u.id, name: u.name, email: u.email, role: u.role },
  config.jwtSecret,
  { expiresIn: '7d' }
);

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  if (!cleanName || !cleanEmail || !password)
    return res.status(400).json({ error: 'All fields are required' });
  if (typeof password !== 'string')
    return res.status(400).json({ error: 'Password must be a string' });
  if (cleanName.length > 100)
    return res.status(400).json({ error: 'Name must be 100 characters or less' });
  if (!EMAIL_REGEX.test(cleanEmail))
    return res.status(400).json({ error: 'Invalid email format' });
  if (password.length > 72)
    return res.status(400).json({ error: 'Password must be 72 characters or less' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [42]);

    const countResult = await client.query('SELECT COUNT(*)::int AS user_count FROM users');
    const userCount = Number(countResult.rows[0].user_count) || 0;

    if (!ALLOW_REGISTRATION && userCount > 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Registration is disabled. Please contact your administrator.' });
    }

    const exists = await client.query('SELECT id FROM users WHERE email=$1', [cleanEmail]);
    if (exists.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const role = userCount === 0 ? 'admin' : 'member';

    const r = await client.query(
      `INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING *`,
      [cleanName, cleanEmail, hash, role]
    );
    await client.query(`INSERT INTO activities (text) VALUES ($1)`, [`${cleanName} joined the workspace`]);
    await client.query('COMMIT');

    return res.status(201).json({ token: signToken(r.rows[0]), user: mapUser(r.rows[0]) });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (rollbackError) { /* ignore rollback errors */ }
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !password)
    return res.status(400).json({ error: 'Email and password required' });
  if (typeof password !== 'string')
    return res.status(400).json({ error: 'Password must be a string' });
  try {
    const r = await db.query('SELECT * FROM users WHERE email=$1', [cleanEmail]);
    if (!r.rows.length) return res.status(401).json({ error: 'Invalid email or password' });
    const user = r.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
    res.json({ token: signToken(user), user: mapUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/auth/me
router.get('/me', authMW, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(mapUser(r.rows[0]));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
