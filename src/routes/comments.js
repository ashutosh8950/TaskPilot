const express = require('express');
const db = require('../db');
const authMW = require('../middleware/auth');

const router = express.Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePositiveInteger(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function mapComment(comment) {
  return {
    id: comment.id,
    task_id: comment.task_id,
    author_id: comment.author_id,
    author_name: comment.author_name || null,
    body: comment.body,
    created_at: comment.created_at,
    updated_at: comment.updated_at
  };
}

async function taskExists(taskId) {
  const result = await db.query('SELECT id, title FROM tasks WHERE id=$1', [taskId]);
  return result.rows[0] || null;
}

router.param('taskId', (req, res, next, taskId) => {
  if (!UUID_REGEX.test(taskId)) return res.status(400).json({ error: 'Invalid task id' });
  return next();
});

router.param('id', (req, res, next, id) => {
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'Invalid comment id' });
  return next();
});

// GET /api/tasks/:taskId/comments
router.get('/tasks/:taskId/comments', authMW, async (req, res) => {
  try {
    const unknownParam = Object.keys(req.query).find(key => !['page', 'limit'].includes(key));
    if (unknownParam) return res.status(400).json({ error: `Invalid query parameter: ${unknownParam}` });

    const task = await taskExists(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const hasParam = key => Object.prototype.hasOwnProperty.call(req.query, key);
    const page = hasParam('page') ? parsePositiveInteger(req.query.page) : 1;
    if (page === null) return res.status(400).json({ error: 'page must be an integer greater than or equal to 1' });
    const limit = hasParam('limit') ? parsePositiveInteger(req.query.limit) : 20;
    if (limit === null || limit > 100) return res.status(400).json({ error: 'limit must be an integer from 1 to 100' });
    const paginationRequested = hasParam('page') || hasParam('limit');
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset)) return res.status(400).json({ error: 'page and limit produce an invalid offset' });

    const baseQuery = `FROM comments c
      LEFT JOIN users u ON u.id = c.author_id
      WHERE c.task_id=$1`;
    if (paginationRequested) {
      const count = await db.query(`SELECT COUNT(*) ${baseQuery}`, [req.params.taskId]);
      const result = await db.query(
        `SELECT c.id, c.task_id, c.author_id, u.name AS author_name, c.body, c.created_at, c.updated_at
         ${baseQuery} ORDER BY c.created_at ASC, c.id ASC LIMIT $2 OFFSET $3`,
        [req.params.taskId, limit, offset]
      );
      res.set({
        'X-Total-Count': String(count.rows[0].count),
        'X-Page': String(page),
        'X-Limit': String(limit)
      });
      return res.json(result.rows.map(mapComment));
    }

    const result = await db.query(
      `SELECT c.id, c.task_id, c.author_id, u.name AS author_name, c.body, c.created_at, c.updated_at
       ${baseQuery} ORDER BY c.created_at ASC, c.id ASC`,
      [req.params.taskId]
    );
    return res.json(result.rows.map(mapComment));
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tasks/:taskId/comments
router.post('/tasks/:taskId/comments', authMW, async (req, res) => {
  const body = req.body && req.body.body;
  if (typeof body !== 'string') return res.status(400).json({ error: 'Comment body must be a string' });
  const cleanBody = body.trim();
  if (!cleanBody) return res.status(400).json({ error: 'Comment body is required' });
  if (cleanBody.length > 2000) return res.status(400).json({ error: 'Comment body must be 2000 characters or less' });

  try {
    const task = await taskExists(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const inserted = await db.query(
      'INSERT INTO comments (task_id, author_id, body) VALUES ($1,$2,$3) RETURNING id, task_id, author_id, body, created_at, updated_at',
      [req.params.taskId, req.user.id, cleanBody]
    );
    const comment = await db.query(
      `SELECT c.id, c.task_id, c.author_id, u.name AS author_name, c.body, c.created_at, c.updated_at
       FROM comments c LEFT JOIN users u ON u.id=c.author_id WHERE c.id=$1`,
      [inserted.rows[0].id]
    );
    await db.query('INSERT INTO activities (text) VALUES ($1)',
      [`${req.user.name} commented on task "${task.title}"`]);
    return res.status(201).json(mapComment(comment.rows[0]));
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/comments/:id
router.put('/comments/:id', authMW, async (req, res) => {
  const body = req.body && req.body.body;
  if (typeof body !== 'string') return res.status(400).json({ error: 'Comment body must be a string' });
  const cleanBody = body.trim();
  if (!cleanBody) return res.status(400).json({ error: 'Comment body is required' });
  if (cleanBody.length > 2000) return res.status(400).json({ error: 'Comment body must be 2000 characters or less' });

  try {
    const existing = await db.query('SELECT id, author_id FROM comments WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Comment not found' });
    if (existing.rows[0].author_id !== req.user.id) return res.status(403).json({ error: 'Not authorized to edit this comment' });
    const updated = await db.query(
      `UPDATE comments SET body=$1, updated_at=NOW() WHERE id=$2 RETURNING id, task_id, author_id, body, created_at, updated_at`,
      [cleanBody, req.params.id]
    );
    const result = await db.query(
      `SELECT c.id, c.task_id, c.author_id, u.name AS author_name, c.body, c.created_at, c.updated_at
       FROM comments c LEFT JOIN users u ON u.id=c.author_id WHERE c.id=$1`,
      [updated.rows[0].id]
    );
    return res.json(mapComment(result.rows[0]));
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/comments/:id
router.delete('/comments/:id', authMW, async (req, res) => {
  try {
    const existing = await db.query('SELECT author_id FROM comments WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Comment not found' });
    const isAuthor = existing.rows[0].author_id === req.user.id;
    if (!isAuthor && req.user.role !== 'admin') return res.status(403).json({ error: 'Not authorized to delete this comment' });
    await db.query('DELETE FROM comments WHERE id=$1', [req.params.id]);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
