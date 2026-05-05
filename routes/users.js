const express      = require('express');
const router       = express.Router();
const pool         = require('../db/pool');
const authenticate = require('../middleware/auth');
const adminOnly    = require('../middleware/rbac');

router.use(authenticate);

// GET /api/users — all authenticated users can view team
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id/role — admin only: toggle role
router.put('/:id/role', adminOnly, async (req, res) => {
  try {
    const existing = await pool.query('SELECT id, role, name FROM users WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (existing.rows[0].id === req.user.id)
      return res.status(400).json({ error: 'Cannot change your own role' });
    const newRole = existing.rows[0].role === 'admin' ? 'member' : 'admin';
    const result = await pool.query(
      'UPDATE users SET role=$1 WHERE id=$2 RETURNING id,name,email,role,created_at',
      [newRole, req.params.id]
    );
    await pool.query('INSERT INTO activity(text) VALUES($1)',
      [`${req.user.name} changed ${existing.rows[0].name}'s role to ${newRole}`]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/users/:id — admin only: remove member
router.delete('/:id', adminOnly, async (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: 'Cannot remove yourself' });
  try {
    const existing = await pool.query('SELECT name FROM users WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    await pool.query('INSERT INTO activity(text) VALUES($1)',
      [`${req.user.name} removed ${existing.rows[0].name} from the workspace`]);
    res.json({ message: 'User removed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/activity — recent activity log
router.get('/activity', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM activity ORDER BY created_at DESC LIMIT 30'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
