const express   = require('express');
const db        = require('../db');
const authMW    = require('../middleware/auth');

const router = express.Router();
router.use(authMW);

const VALID_STATUS   = ['todo', 'inprogress', 'done'];
const VALID_PRIORITY = ['low', 'medium', 'high'];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : value;
}

function normalizeOptionalUuid(value) {
  if (!value) return null;
  return UUID_REGEX.test(value) ? value : undefined;
}

router.param('id', (req, res, next, id) => {
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'Invalid task id' });
  return next();
});

const mapTask = t => ({
  id: t.id, title: t.title, description: t.description,
  project_id: t.project_id, assignee_id: t.assignee_id,
  priority: t.priority, status: t.status,
  due_date: t.due_date ? t.due_date.toISOString().split('T')[0] : null,
  created_by: t.created_by, created_at: t.created_at
});

// GET /api/tasks  (optional ?projectId=)
router.get('/', async (req, res) => {
  try {
    let q = 'SELECT * FROM tasks';
    const params = [];
    if (req.query.projectId) {
      if (!UUID_REGEX.test(req.query.projectId)) {
        return res.status(400).json({ error: 'Invalid project id' });
      }
      q += ' WHERE project_id=$1';
      params.push(req.query.projectId);
    }
    q += ' ORDER BY created_at DESC';
    const r = await db.query(q, params);
    res.json(r.rows.map(mapTask));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/tasks/:id
router.get('/:id', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(mapTask(r.rows[0]));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/tasks
router.post('/', async (req, res) => {
  const { title, description, projectId, assigneeId, priority, status, due } = req.body;
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanAssigneeId = normalizeOptionalUuid(assigneeId);
  const cleanDue = normalizeDate(due);
  if (!cleanTitle) return res.status(400).json({ error: 'Task title is required' });
  if (cleanTitle.length > 300) return res.status(400).json({ error: 'Task title must be 300 characters or less' });
  if (!projectId || !UUID_REGEX.test(projectId)) return res.status(400).json({ error: 'Valid project is required' });
  if (cleanAssigneeId === undefined) return res.status(400).json({ error: 'Invalid assignee id' });
  if (cleanDue === undefined) return res.status(400).json({ error: 'Due date must use YYYY-MM-DD format' });
  if (priority && !VALID_PRIORITY.includes(priority))
    return res.status(400).json({ error: 'Invalid priority. Must be: low, medium, high' });
  if (status && !VALID_STATUS.includes(status))
    return res.status(400).json({ error: 'Invalid status. Must be: todo, inprogress, done' });
  try {
    const r = await db.query(
      `INSERT INTO tasks (title,description,project_id,assignee_id,priority,status,due_date,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [cleanTitle, description||null, projectId, cleanAssigneeId,
       priority||'medium', status||'todo', cleanDue, req.user.id]
    );
    await db.query(`INSERT INTO activities (text) VALUES ($1)`,
      [`${req.user.name} created task "${cleanTitle}"`]);
    res.status(201).json(mapTask(r.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/tasks/:id
router.put('/:id', async (req, res) => {
  const { title, description, projectId, assigneeId, priority, status, due } = req.body;
  if (title !== undefined && (typeof title !== 'string' || !title.trim()))
    return res.status(400).json({ error: 'Task title cannot be empty' });
  if (title !== undefined && title.trim().length > 300)
    return res.status(400).json({ error: 'Task title must be 300 characters or less' });
  if (projectId !== undefined && !UUID_REGEX.test(projectId))
    return res.status(400).json({ error: 'Invalid project id' });
  if (assigneeId !== undefined && normalizeOptionalUuid(assigneeId) === undefined)
    return res.status(400).json({ error: 'Invalid assignee id' });
  const cleanDue = due === undefined ? undefined : normalizeDate(due);
  if (cleanDue === undefined && due !== undefined)
    return res.status(400).json({ error: 'Due date must use YYYY-MM-DD format' });
  if (priority && !VALID_PRIORITY.includes(priority))
    return res.status(400).json({ error: 'Invalid priority' });
  if (status && !VALID_STATUS.includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  try {
    // Authorization: must be admin, creator, or assignee
    const existing = await db.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    const task = existing.rows[0];
    if (req.user.role !== 'admin' && task.created_by !== req.user.id && task.assignee_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to modify this task' });
    }

    const r = await db.query(
      `UPDATE tasks SET title=$1,description=$2,project_id=$3,assignee_id=$4,
       priority=$5,status=$6,due_date=$7 WHERE id=$8 RETURNING *`,
      [title!==undefined?title.trim():task.title, description!==undefined?description:task.description, projectId||task.project_id,
       assigneeId!==undefined?normalizeOptionalUuid(assigneeId):task.assignee_id,
       priority||task.priority, status||task.status, due!==undefined?cleanDue:task.due_date, req.params.id]
    );
    if (status === 'done') {
      await db.query(`INSERT INTO activities (text) VALUES ($1)`,
        [`${req.user.name} completed task "${r.rows[0].title}"`]);
    }
    res.json(mapTask(r.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/tasks/:id/status
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUS.includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  try {
    // Authorization check
    const existing = await db.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    const task = existing.rows[0];
    if (req.user.role !== 'admin' && task.created_by !== req.user.id && task.assignee_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to modify this task' });
    }

    const r = await db.query(
      'UPDATE tasks SET status=$1 WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    if (status === 'done') {
      await db.query(`INSERT INTO activities (text) VALUES ($1)`,
        [`${req.user.name} completed task "${r.rows[0].title}"`]);
    }
    res.json(mapTask(r.rows[0]));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const t = await db.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (!t.rows.length) return res.status(404).json({ error: 'Not found' });
    // Authorization: must be admin, creator, or assignee
    const task = t.rows[0];
    if (req.user.role !== 'admin' && task.created_by !== req.user.id && task.assignee_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this task' });
    }
    await db.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    await db.query(`INSERT INTO activities (text) VALUES ($1)`,
      [`${req.user.name} deleted task "${task.title}"`]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
