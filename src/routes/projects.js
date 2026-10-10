const express  = require('express');
const db       = require('../db');
const authMW   = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

const router = express.Router();
router.use(authMW);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : value;
}

router.param('id', (req, res, next, id) => {
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'Invalid project id' });
  return next();
});

const mapProject = p => ({
  id: p.id, name: p.name, description: p.description,
  color: p.color,
  due_date: p.due_date ? p.due_date.toISOString().split('T')[0] : null,
  created_by: p.created_by, created_at: p.created_at
});

// GET /api/projects
router.get('/', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM projects ORDER BY created_at DESC');
    res.json(r.rows.map(mapProject));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM projects WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(mapProject(r.rows[0]));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/projects  (admin only)
router.post('/', adminOnly, async (req, res) => {
  const { name, description, color, due } = req.body;
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanDescription = typeof description === 'string' ? description.trim() : '';
  const cleanDue = normalizeDate(due);
  if (!cleanName) return res.status(400).json({ error: 'Project name is required' });
  if (cleanName.length > 200) return res.status(400).json({ error: 'Project name must be 200 characters or less' });
  if (cleanDescription.length > 5000) return res.status(400).json({ error: 'Project description must be 5000 characters or less' });
  if (cleanDue === undefined) return res.status(400).json({ error: 'Due date must use YYYY-MM-DD format' });
  try {
    const r = await db.query(
      `INSERT INTO projects (name,description,color,due_date,created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [cleanName, cleanDescription || null, COLOR_REGEX.test(color || '') ? color : '#7c6af7', cleanDue, req.user.id]
    );
    await db.query(`INSERT INTO activities (text) VALUES ($1)`,
      [`${req.user.name} created project ${cleanName}`]);
    res.status(201).json(mapProject(r.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/projects/:id  (admin only)
router.put('/:id', adminOnly, async (req, res) => {
  const { name, description, color, due } = req.body;
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanDescription = typeof description === 'string' ? description.trim() : '';
  const cleanDue = normalizeDate(due);
  if (!cleanName) return res.status(400).json({ error: 'Project name is required' });
  if (cleanName.length > 200) return res.status(400).json({ error: 'Project name must be 200 characters or less' });
  if (cleanDescription.length > 5000) return res.status(400).json({ error: 'Project description must be 5000 characters or less' });
  if (cleanDue === undefined) return res.status(400).json({ error: 'Due date must use YYYY-MM-DD format' });
  try {
    const r = await db.query(
      `UPDATE projects SET name=$1,description=$2,color=$3,due_date=$4
       WHERE id=$5 RETURNING *`,
      [cleanName, cleanDescription || null, COLOR_REGEX.test(color || '') ? color : '#7c6af7', cleanDue, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    await db.query(`INSERT INTO activities (text) VALUES ($1)`,
      [`${req.user.name} updated project ${cleanName}`]);
    res.json(mapProject(r.rows[0]));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/projects/:id  (admin only)
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const p = await db.query('SELECT name FROM projects WHERE id=$1', [req.params.id]);
    if (!p.rows.length) return res.status(404).json({ error: 'Not found' });
    await db.query('DELETE FROM projects WHERE id=$1', [req.params.id]);
    await db.query(`INSERT INTO activities (text) VALUES ($1)`,
      [`${req.user.name} deleted project ${p.rows[0].name}`]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
