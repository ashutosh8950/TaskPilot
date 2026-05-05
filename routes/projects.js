const express   = require('express');
const router    = express.Router();
const pool      = require('../db/pool');
const authenticate = require('../middleware/auth');
const adminOnly    = require('../middleware/rbac');

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function normalizeProjectInput(body) {
  const name = String(body.name || '').trim();
  const description = body.description ? String(body.description).trim() : null;
  const color = body.color ? String(body.color).trim() : '#7c6af7';
  const dueDate = body.due_date ? String(body.due_date).trim() : null;
  return { name, description, color, dueDate };
}

// All project routes require authentication
router.use(authenticate);

// GET /api/projects — all users can read
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.name AS created_by_name
       FROM projects p
       LEFT JOIN users u ON p.created_by = u.id
       ORDER BY p.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/projects — admin only
router.post('/', adminOnly, async (req, res) => {
  const { name, description, color, dueDate } = normalizeProjectInput(req.body);
  if (!name) return res.status(400).json({ error: 'Project name is required' });
  if (name.length > 200) return res.status(400).json({ error: 'Project name is too long' });
  if (description && description.length > 2000) return res.status(400).json({ error: 'Description is too long' });
  if (!HEX_COLOR_REGEX.test(color)) return res.status(400).json({ error: 'Color must be a valid hex code like #7c6af7' });
  if (dueDate && !DATE_REGEX.test(dueDate)) return res.status(400).json({ error: 'Due date must be YYYY-MM-DD' });
  try {
    const result = await pool.query(
      `INSERT INTO projects (name, description, color, due_date, created_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [name, description || null, color, dueDate || null, req.user.id]
    );
    const project = result.rows[0];
    await pool.query('INSERT INTO activity(text) VALUES($1)',
      [`${req.user.name} created project "${name}"`]);
    res.status(201).json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/projects/:id — admin only
router.put('/:id', adminOnly, async (req, res) => {
  const { name, description, color, dueDate } = normalizeProjectInput(req.body);
  if (!name) return res.status(400).json({ error: 'Project name is required' });
  if (name.length > 200) return res.status(400).json({ error: 'Project name is too long' });
  if (description && description.length > 2000) return res.status(400).json({ error: 'Description is too long' });
  if (!HEX_COLOR_REGEX.test(color)) return res.status(400).json({ error: 'Color must be a valid hex code like #7c6af7' });
  if (dueDate && !DATE_REGEX.test(dueDate)) return res.status(400).json({ error: 'Due date must be YYYY-MM-DD' });
  try {
    const result = await pool.query(
      `UPDATE projects SET name=$1, description=$2, color=$3, due_date=$4
       WHERE id=$5 RETURNING *`,
      [name, description || null, color, dueDate || null, req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Project not found' });
    await pool.query('INSERT INTO activity(text) VALUES($1)',
      [`${req.user.name} updated project "${name}"`]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/projects/:id — admin only
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const proj = await pool.query('SELECT name FROM projects WHERE id=$1', [req.params.id]);
    if (proj.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    await pool.query('DELETE FROM projects WHERE id=$1', [req.params.id]); // tasks cascade
    await pool.query('INSERT INTO activity(text) VALUES($1)',
      [`${req.user.name} deleted project "${proj.rows[0].name}"`]);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
