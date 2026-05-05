const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../db/pool');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  const safeName = String(name || '').trim();
  const safeEmail = String(email || '').trim().toLowerCase();
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password are required' });
  if (safeName.length < 2)
    return res.status(400).json({ error: 'Name must be at least 2 characters' });
  if (!EMAIL_REGEX.test(safeEmail))
    return res.status(400).json({ error: 'Please provide a valid email address' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const allowedRoles = ['admin', 'member'];
  let userRole = allowedRoles.includes(role) ? role : 'member';

  try {
    const existingUsers = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    const hasUsers = existingUsers.rows[0].count > 0;
    if (userRole === 'admin' && hasUsers) {
      return res.status(403).json({ error: 'Only the first user can self-register as admin' });
    }
    if (!hasUsers) {
      userRole = 'admin';
    }

    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [safeEmail]);
    if (exists.rows.length > 0)
      return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role,created_at',
      [safeName, safeEmail, hash, userRole]
    );
    const user = result.rows[0];
    await pool.query('INSERT INTO activity(text) VALUES($1)', [`${safeName} joined the workspace`]);
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const safeEmail = String(email || '').trim().toLowerCase();
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });
  if (!EMAIL_REGEX.test(safeEmail))
    return res.status(400).json({ error: 'Please provide a valid email address' });

  try {
    const result = await pool.query(
      'SELECT id,name,email,password_hash,role,created_at FROM users WHERE email=$1',
      [safeEmail]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Invalid email or password' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Invalid email or password' });

    delete user.password_hash;
    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
