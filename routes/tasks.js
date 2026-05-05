const express      = require('express');
const router       = express.Router();
const pool         = require('../db/pool');
const authenticate = require('../middleware/auth');
const adminOnly    = require('../middleware/rbac');

const ALLOWED_PRIORITIES = ['low', 'medium', 'high'];
const ALLOWED_STATUSES = ['todo', 'inprogress', 'done'];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function normalizeTaskInput(body) {
  return {
    title: String(body.title || '').trim(),
    description: body.description ? String(body.description).trim() : null,
    projectId: body.project_id,
    assigneeId: body.assignee_id || null,
    priority: body.priority,
    status: body.status,
    dueDate: body.due_date ? String(body.due_date).trim() : null,
  };
}

router.use(authenticate);

// GET /api/tasks — all tasks (any authenticated user)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*,
              u.name  AS assignee_name,
              p.name  AS project_name,
              p.color AS project_color
       FROM tasks t
       LEFT JOIN users    u ON t.assignee_id  = u.id
       LEFT JOIN projects p ON t.project_id   = p.id
       ORDER BY t.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tasks — any authenticated user can create
router.post('/', async (req, res) => {
  const { title, description, projectId, assigneeId, priority, status, dueDate } = normalizeTaskInput(req.body);
  if (!title)      return res.status(400).json({ error: 'Task title is required' });
  if (title.length > 300) return res.status(400).json({ error: 'Task title is too long' });
  if (description && description.length > 3000) return res.status(400).json({ error: 'Task description is too long' });
  if (!projectId) return res.status(400).json({ error: 'Project is required' });
  if (dueDate && !DATE_REGEX.test(dueDate)) return res.status(400).json({ error: 'Due date must be YYYY-MM-DD' });
  const validPriority = ALLOWED_PRIORITIES.includes(priority) ? priority : 'medium';
  const validStatus   = ALLOWED_STATUSES.includes(status) ? status : 'todo';
  try {
    const project = await pool.query('SELECT id FROM projects WHERE id=$1', [projectId]);
    if (!project.rows.length) return res.status(400).json({ error: 'Selected project does not exist' });

    if (assigneeId) {
      const assignee = await pool.query('SELECT id FROM users WHERE id=$1', [assigneeId]);
      if (!assignee.rows.length) return res.status(400).json({ error: 'Selected assignee does not exist' });
    }

    const result = await pool.query(
      `INSERT INTO tasks (title, description, project_id, assignee_id, priority, status, due_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title, description || null, projectId, assigneeId, validPriority, validStatus, dueDate || null, req.user.id]
    );
    const task = result.rows[0];
    // get assignee name for activity
    let assigneeName = '';
    if (assigneeId) {
      const u = await pool.query('SELECT name FROM users WHERE id=$1', [assigneeId]);
      if (u.rows.length) assigneeName = ' for ' + u.rows[0].name;
    }
    await pool.query('INSERT INTO activity(text) VALUES($1)',
      [`${req.user.name} created task "${title}"${assigneeName}`]);
    res.status(201).json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/tasks/:id — admin OR the assignee/creator can edit
router.put('/:id', async (req, res) => {
  const { title, description, projectId, assigneeId, priority, status, dueDate } = normalizeTaskInput(req.body);
  if (!title)      return res.status(400).json({ error: 'Task title is required' });
  if (title.length > 300) return res.status(400).json({ error: 'Task title is too long' });
  if (description && description.length > 3000) return res.status(400).json({ error: 'Task description is too long' });
  if (!projectId) return res.status(400).json({ error: 'Project is required' });
  if (dueDate && !DATE_REGEX.test(dueDate)) return res.status(400).json({ error: 'Due date must be YYYY-MM-DD' });
  try {
    const existing = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const t = existing.rows[0];
    // Permission check: admin, assignee, or creator
    const canEdit = req.user.role === 'admin' ||
                    t.assignee_id === req.user.id ||
                    t.created_by  === req.user.id;
    if (!canEdit) return res.status(403).json({ error: 'Permission denied' });

    const project = await pool.query('SELECT id FROM projects WHERE id=$1', [projectId]);
    if (!project.rows.length) return res.status(400).json({ error: 'Selected project does not exist' });
    if (assigneeId) {
      const assignee = await pool.query('SELECT id FROM users WHERE id=$1', [assigneeId]);
      if (!assignee.rows.length) return res.status(400).json({ error: 'Selected assignee does not exist' });
    }

    const validPriority = ALLOWED_PRIORITIES.includes(priority) ? priority : t.priority;
    const validStatus   = ALLOWED_STATUSES.includes(status) ? status : t.status;

    const result = await pool.query(
      `UPDATE tasks SET title=$1, description=$2, project_id=$3, assignee_id=$4,
              priority=$5, status=$6, due_date=$7
       WHERE id=$8 RETURNING *`,
      [title, description || null, projectId, assigneeId, validPriority, validStatus, dueDate || null, req.params.id]
    );
    await pool.query('INSERT INTO activity(text) VALUES($1)',
      [`${req.user.name} updated task "${title}"`]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/tasks/:id/status — quick status update
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatus = ALLOWED_STATUSES.includes(status) ? status : null;
  if (!validStatus) return res.status(400).json({ error: 'Invalid status' });
  try {
    const existing = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const t = existing.rows[0];
    const canEdit = req.user.role === 'admin' ||
                    t.assignee_id === req.user.id ||
                    t.created_by  === req.user.id;
    if (!canEdit) return res.status(403).json({ error: 'Permission denied' });

    const result = await pool.query(
      'UPDATE tasks SET status=$1 WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    await pool.query('INSERT INTO activity(text) VALUES($1)',
      [`${req.user.name} moved "${t.title}" to ${status}`]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/tasks/:id — admin only
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const existing = await pool.query('SELECT title FROM tasks WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    await pool.query('INSERT INTO activity(text) VALUES($1)',
      [`${req.user.name} deleted task "${existing.rows[0].title}"`]);
    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
