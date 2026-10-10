const express   = require('express');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const db        = require('../db');
const authMW    = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

const router = express.Router();
router.use(authMW);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = email => String(email || '').trim().toLowerCase();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const mapUser = u => ({
  id: u.id, name: u.name, email: u.email,
  role: u.role, created_at: u.created_at
});

router.param('id', (req, res, next, id) => {
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'Invalid member id' });
  return next();
});

// GET /api/members
router.get('/', async (req, res) => {
  try {
    const r = await db.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at ASC');
    res.json(r.rows.map(mapUser));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/members  (admin creates member directly)
router.post('/', adminOnly, async (req, res) => {
  const { name, email, password, role } = req.body;
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  const providedPassword = typeof password === 'string' ? password.trim() : '';
  if (!cleanName || !cleanEmail)
    return res.status(400).json({ error: 'Name and email are required' });
  if (cleanName.length > 100)
    return res.status(400).json({ error: 'Name must be 100 characters or less' });
  if (cleanEmail.length > 254)
    return res.status(400).json({ error: 'Email must be 254 characters or less' });
  if (!EMAIL_REGEX.test(cleanEmail))
    return res.status(400).json({ error: 'Invalid email format' });
  try {
    const exists = await db.query('SELECT id FROM users WHERE email=$1', [cleanEmail]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const generatedPassword = !providedPassword ? crypto.randomBytes(10).toString('hex') : null;
    const pwd = providedPassword || generatedPassword;
    if (typeof pwd !== 'string') return res.status(400).json({ error: 'Password must be a string' });
    if (pwd.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (pwd.length > 72) return res.status(400).json({ error: 'Password must be 72 characters or less' });
    const hash = await bcrypt.hash(pwd, 10);
    const validRole = ['admin', 'member'].includes(role) ? role : 'member';
    const r = await db.query(
      `INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING *`,
      [cleanName, cleanEmail, hash, validRole]
    );
    await db.query(`INSERT INTO activities (text) VALUES ($1)`,
      [`${req.user.name} added ${cleanName} to the team`]);

    const response = mapUser(r.rows[0]);
    if (generatedPassword) response.temporaryPassword = generatedPassword;
    return res.status(201).json(response);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/members/:id/role  (admin changes role)
router.put('/:id/role', adminOnly, async (req, res) => {
  const { role } = req.body;
  if (!['admin','member'].includes(role))
    return res.status(400).json({ error: 'Invalid role. Must be admin or member' });
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: 'Cannot change your own role' });
  try {
    const r = await db.query(
      'UPDATE users SET role=$1 WHERE id=$2 RETURNING *',
      [role, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(mapUser(r.rows[0]));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/members/:id  (admin removes member)
router.delete('/:id', adminOnly, async (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: 'Cannot remove yourself' });
  try {
    const u = await db.query('SELECT name FROM users WHERE id=$1', [req.params.id]);
    if (!u.rows.length) return res.status(404).json({ error: 'User not found' });
    await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    await db.query(`INSERT INTO activities (text) VALUES ($1)`,
      [`${req.user.name} removed ${u.rows[0].name} from the team`]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
