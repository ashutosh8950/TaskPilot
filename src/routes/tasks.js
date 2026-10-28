const express   = require('express');
const db        = require('../db');
const authMW    = require('../middleware/auth');
const { canModifyTask } = require('../middleware/taskAccess');

const router = express.Router();
router.use(authMW);

const VALID_STATUS   = ['todo', 'inprogress', 'done'];
const VALID_PRIORITY = ['low', 'medium', 'high'];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TASK_SORT_COLUMNS = Object.freeze({
  created_at: 'created_at',
  due_date: 'due_date',
  priority: 'priority',
  title: 'title'
});
const TASK_QUERY_PARAMS = new Set([
  'projectId', 'q', 'status', 'priority', 'assigneeId', 'createdBy', 'labelId', 'sort', 'order', 'page', 'limit'
]);

function parsePositiveInteger(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

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
  created_by: t.created_by, created_at: t.created_at,
  labels: Array.isArray(t.labels) ? t.labels : []
});

const TASK_SELECT = `SELECT t.*,
  COALESCE((
    SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color) ORDER BY l.name)
    FROM task_labels tl
    JOIN labels l ON l.id = tl.label_id
    WHERE tl.task_id = t.id
  ), '[]'::json) AS labels
  FROM tasks t`;

// GET /api/tasks
router.get('/', async (req, res) => {
  try {
    const unknownParam = Object.keys(req.query).find(key => !TASK_QUERY_PARAMS.has(key));
    if (unknownParam) return res.status(400).json({ error: `Invalid query parameter: ${unknownParam}` });

    const hasParam = key => Object.prototype.hasOwnProperty.call(req.query, key);
    const stringParams = ['q', 'projectId', 'status', 'priority', 'assigneeId', 'createdBy', 'labelId', 'sort', 'order', 'page', 'limit'];
    const invalidType = stringParams.find(key => hasParam(key) && typeof req.query[key] !== 'string');
    if (invalidType) return res.status(400).json({ error: `${invalidType} must be a single string value` });

    if (hasParam('projectId') && !UUID_REGEX.test(req.query.projectId)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }
    if (hasParam('status') && !VALID_STATUS.includes(req.query.status)) {
      return res.status(400).json({ error: 'Invalid status. Must be: todo, inprogress, done' });
    }
    if (hasParam('priority') && !VALID_PRIORITY.includes(req.query.priority)) {
      return res.status(400).json({ error: 'Invalid priority. Must be: low, medium, high' });
    }
    for (const key of ['assigneeId', 'createdBy']) {
      if (hasParam(key) && !UUID_REGEX.test(req.query[key])) {
        return res.status(400).json({ error: `Invalid ${key === 'assigneeId' ? 'assignee' : 'creator'} id` });
      }
    }
    if (hasParam('labelId') && !UUID_REGEX.test(req.query.labelId)) {
      return res.status(400).json({ error: 'Invalid label id' });
    }

    const sort = hasParam('sort') ? req.query.sort : 'created_at';
    if (!Object.prototype.hasOwnProperty.call(TASK_SORT_COLUMNS, sort)) {
      return res.status(400).json({ error: 'Invalid sort. Must be: created_at, due_date, priority, title' });
    }
    const order = hasParam('order') ? req.query.order : 'desc';
    if (!['asc', 'desc'].includes(order)) {
      return res.status(400).json({ error: 'Invalid order. Must be: asc, desc' });
    }

    const page = hasParam('page') ? parsePositiveInteger(req.query.page) : 1;
    if (page === null) return res.status(400).json({ error: 'page must be an integer greater than or equal to 1' });
    const limit = hasParam('limit') ? parsePositiveInteger(req.query.limit) : 20;
    if (limit === null || limit > 100) return res.status(400).json({ error: 'limit must be an integer from 1 to 100' });
    const paginationRequested = hasParam('page') || hasParam('limit');
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset)) return res.status(400).json({ error: 'page and limit produce an invalid offset' });

    const conditions = [];
    const params = [];
    const addCondition = (sql, value) => {
      params.push(value);
      conditions.push(sql.replace('?', `$${params.length}`));
    };
    if (hasParam('projectId')) addCondition('t.project_id=?', req.query.projectId);
    if (hasParam('q')) {
      params.push(`%${req.query.q}%`);
      conditions.push(`(t.title ILIKE $${params.length} OR COALESCE(t.description, '') ILIKE $${params.length})`);
    }
    if (hasParam('status')) addCondition('t.status=?', req.query.status);
    if (hasParam('priority')) addCondition('t.priority=?', req.query.priority);
    if (hasParam('assigneeId')) addCondition('t.assignee_id=?', req.query.assigneeId);
    if (hasParam('createdBy')) addCondition('t.created_by=?', req.query.createdBy);
    if (hasParam('labelId')) addCondition('EXISTS (SELECT 1 FROM task_labels filter_tl WHERE filter_tl.task_id=t.id AND filter_tl.label_id=?)', req.query.labelId);

    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const query = `${TASK_SELECT}${where} ORDER BY t.${TASK_SORT_COLUMNS[sort]} ${order.toUpperCase()}`;
    if (paginationRequested) {
      const count = await db.query(`SELECT COUNT(*) FROM tasks t${where}`, params);
      const total = Number(count.rows[0].count);
      const result = await db.query(`${query} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      res.set({
        'X-Total-Count': String(total),
        'X-Page': String(page),
        'X-Limit': String(limit)
      });
      return res.json(result.rows.map(mapTask));
    }
    const r = await db.query(query, params);
    res.json(r.rows.map(mapTask));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/tasks/:id
router.get('/:id', async (req, res) => {
  try {
    const r = await db.query(`${TASK_SELECT} WHERE t.id=$1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(mapTask(r.rows[0]));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/tasks
router.post('/', async (req, res) => {
  const { title, description, projectId, assigneeId, priority, status, due } = req.body;
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanDescription = typeof description === 'string' ? description.trim() : '';
  const cleanAssigneeId = normalizeOptionalUuid(assigneeId);
  const cleanDue = normalizeDate(due);
  if (!cleanTitle) return res.status(400).json({ error: 'Task title is required' });
  if (cleanTitle.length > 300) return res.status(400).json({ error: 'Task title must be 300 characters or less' });
  if (cleanDescription.length > 5000) return res.status(400).json({ error: 'Task description must be 5000 characters or less' });
  if (!projectId || !UUID_REGEX.test(projectId)) return res.status(400).json({ error: 'Valid project is required' });
  if (cleanAssigneeId === undefined) return res.status(400).json({ error: 'Invalid assignee id' });
  if (cleanDue === undefined) return res.status(400).json({ error: 'Due date must use YYYY-MM-DD format' });
  if (priority && !VALID_PRIORITY.includes(priority))
    return res.status(400).json({ error: 'Invalid priority. Must be: low, medium, high' });
  if (status && !VALID_STATUS.includes(status))
    return res.status(400).json({ error: 'Invalid status. Must be: todo, inprogress, done' });
  try {
    const inserted = await db.query(
      `INSERT INTO tasks (title,description,project_id,assignee_id,priority,status,due_date,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [cleanTitle, cleanDescription || null, projectId, cleanAssigneeId,
       priority||'medium', status||'todo', cleanDue, req.user.id]
    );
    await db.query(`INSERT INTO activities (text) VALUES ($1)`,
      [`${req.user.name} created task "${cleanTitle}"`]);
    const result = await db.query(`${TASK_SELECT} WHERE t.id=$1`, [inserted.rows[0].id]);
    res.status(201).json(mapTask(result.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/tasks/:id
router.put('/:id', async (req, res) => {
  const { title, description, projectId, assigneeId, priority, status, due } = req.body;
  const cleanDescription = typeof description === 'string' ? description.trim() : null;
  if (title !== undefined && (typeof title !== 'string' || !title.trim()))
    return res.status(400).json({ error: 'Task title cannot be empty' });
  if (title !== undefined && title.trim().length > 300)
    return res.status(400).json({ error: 'Task title must be 300 characters or less' });
  if (cleanDescription !== null && cleanDescription.length > 5000)
    return res.status(400).json({ error: 'Task description must be 5000 characters or less' });
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
    if (!canModifyTask(req.user, task)) {
      return res.status(403).json({ error: 'Not authorized to modify this task' });
    }

    const updated = await db.query(
      `UPDATE tasks SET title=$1,description=$2,project_id=$3,assignee_id=$4,
       priority=$5,status=$6,due_date=$7 WHERE id=$8 RETURNING *`,
      [title!==undefined?title.trim():task.title, description!==undefined ? cleanDescription : task.description, projectId||task.project_id,
       assigneeId!==undefined?normalizeOptionalUuid(assigneeId):task.assignee_id,
       priority||task.priority, status||task.status, due!==undefined?cleanDue:task.due_date, req.params.id]
    );
    if (status === 'done') {
      await db.query(`INSERT INTO activities (text) VALUES ($1)`,
        [`${req.user.name} completed task "${updated.rows[0].title}"`]);
    }
    const result = await db.query(`${TASK_SELECT} WHERE t.id=$1`, [req.params.id]);
    res.json(mapTask(result.rows[0]));
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
    if (!canModifyTask(req.user, task)) {
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
    if (!canModifyTask(req.user, task)) {
      return res.status(403).json({ error: 'Not authorized to delete this task' });
    }
    await db.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    await db.query(`INSERT INTO activities (text) VALUES ($1)`,
      [`${req.user.name} deleted task "${task.title}"`]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
