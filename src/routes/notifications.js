const express = require('express');
const db = require('../db');
const authMW = require('../middleware/auth');

const router = express.Router();
router.use(authMW);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePositiveInteger(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function generateReminders(userId) {
  await db.query(`
    INSERT INTO notifications (user_id, task_id, type, message)
    SELECT t.assignee_id, t.id,
      CASE WHEN t.due_date < CURRENT_DATE THEN 'overdue' ELSE 'due_soon' END,
      CASE WHEN t.due_date < CURRENT_DATE
        THEN 'Task "' || t.title || '" is overdue'
        ELSE 'Task "' || t.title || '" is due on ' || to_char(t.due_date, 'YYYY-MM-DD')
      END
    FROM tasks t
    WHERE t.assignee_id = $1
      AND t.status <> 'done'
      AND t.due_date IS NOT NULL
      AND t.due_date <= CURRENT_DATE + 2
    ON CONFLICT DO NOTHING
  `, [userId]);
}

router.param('id', (req, res, next, id) => {
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'Invalid notification id' });
  return next();
});

router.get('/', async (req, res) => {
  try {
    const allowed = new Set(['unread', 'page', 'limit']);
    const unknown = Object.keys(req.query).find(key => !allowed.has(key));
    if (unknown) return res.status(400).json({ error: `Invalid query parameter: ${unknown}` });
    const has = key => Object.prototype.hasOwnProperty.call(req.query, key);
    for (const key of ['unread', 'page', 'limit']) {
      if (has(key) && typeof req.query[key] !== 'string') {
        return res.status(400).json({ error: `${key} must be a single string value` });
      }
    }
    if (has('unread') && !['true', 'false'].includes(req.query.unread)) {
      return res.status(400).json({ error: 'unread must be true or false' });
    }
    const page = has('page') ? parsePositiveInteger(req.query.page) : 1;
    const limit = has('limit') ? parsePositiveInteger(req.query.limit) : 50;
    if (page === null) return res.status(400).json({ error: 'page must be an integer greater than or equal to 1' });
    if (limit === null || limit > 100) return res.status(400).json({ error: 'limit must be an integer from 1 to 100' });
    const paginationRequested = has('page') || has('limit');
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset)) return res.status(400).json({ error: 'page and limit produce an invalid offset' });

    await generateReminders(req.user.id);
    const conditions = ['user_id=$1'];
    const params = [req.user.id];
    if (has('unread') && req.query.unread === 'true') conditions.push('read_at IS NULL');
    const where = conditions.join(' AND ');
    const count = paginationRequested
      ? await db.query(`SELECT COUNT(*) FROM notifications WHERE ${where}`, params)
      : null;
    const result = await db.query(
      `SELECT id, user_id, task_id, type, message, created_at, read_at
       FROM notifications WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
      [...params, limit, offset]
    );
    if (paginationRequested) {
      res.set({ 'X-Total-Count': String(count.rows[0].count), 'X-Page': String(page), 'X-Limit': String(limit) });
    }
    return res.json(result.rows);
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/unread-count', async (req, res) => {
  try {
    const result = await db.query('SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
    return res.json({ count: Number(result.rows[0].count) });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/read', async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE notifications SET read_at=COALESCE(read_at, NOW()) WHERE id=$1 AND user_id=$2 RETURNING id, user_id, task_id, type, message, created_at, read_at',
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(result.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/read-all', async (req, res) => {
  try {
    const result = await db.query('UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
    return res.json({ updated: result.rowCount });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

router.notifyAssigned = async function notifyAssigned({ userId, taskId, message }) {
  try {
    await db.query('INSERT INTO notifications (user_id, task_id, type, message) VALUES ($1,$2,\'assigned\',$3)', [userId, taskId, message]);
  } catch (e) { /* Notifications are best effort. */ }
};

router.notifyComment = async function notifyComment({ taskId, commenterId, message }) {
  try {
    await db.query(`
      INSERT INTO notifications (user_id, task_id, type, message)
      SELECT DISTINCT recipient_id, $1, 'comment', $3
      FROM (
        SELECT created_by AS recipient_id FROM tasks WHERE id=$1
        UNION ALL
        SELECT assignee_id FROM tasks WHERE id=$1
      ) recipients
      WHERE recipient_id IS NOT NULL AND recipient_id <> $2
    `, [taskId, commenterId, message]);
  } catch (e) { /* Notifications are best effort. */ }
};

module.exports = router;
