const express = require('express');
const db = require('../db');
const authMW = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { canModifyTask } = require('../middleware/taskAccess');

const router = express.Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

const mapLabel = label => ({
  id: label.id,
  name: label.name,
  color: label.color
});

router.param('id', (req, res, next, id) => {
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'Invalid label id' });
  return next();
});

router.param('taskId', (req, res, next, taskId) => {
  if (!UUID_REGEX.test(taskId)) return res.status(400).json({ error: 'Invalid task id' });
  return next();
});

// GET /api/labels
router.get('/labels', authMW, async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, color FROM labels ORDER BY name ASC');
    return res.json(result.rows.map(mapLabel));
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/labels
router.post('/labels', authMW, adminOnly, async (req, res) => {
  const name = req.body && req.body.name;
  const color = req.body && req.body.color;
  if (typeof name !== 'string') return res.status(400).json({ error: 'Label name must be a string' });
  if (typeof color !== 'string') return res.status(400).json({ error: 'Label color must be a string' });
  const cleanName = name.trim();
  if (!cleanName) return res.status(400).json({ error: 'Label name is required' });
  if (cleanName.length > 30) return res.status(400).json({ error: 'Label name must be 30 characters or less' });
  if (!COLOR_REGEX.test(color)) return res.status(400).json({ error: 'Label color must be a six-digit hex color' });

  try {
    const existing = await db.query('SELECT id FROM labels WHERE LOWER(name)=LOWER($1)', [cleanName]);
    if (existing.rows.length) return res.status(409).json({ error: 'Label name already exists' });
    const result = await db.query(
      'INSERT INTO labels (name, color, created_by) VALUES ($1,$2,$3) RETURNING id, name, color',
      [cleanName, color, req.user.id]
    );
    return res.status(201).json(mapLabel(result.rows[0]));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Label name already exists' });
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/labels/:id
router.delete('/labels/:id', authMW, adminOnly, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM labels WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Label not found' });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/tasks/:taskId/labels
router.put('/tasks/:taskId/labels', authMW, async (req, res) => {
  const labelIds = req.body && req.body.labelIds;
  if (!Array.isArray(labelIds)) return res.status(400).json({ error: 'labelIds must be an array' });
  if (labelIds.some(labelId => typeof labelId !== 'string' || !UUID_REGEX.test(labelId))) {
    return res.status(400).json({ error: 'labelIds must contain valid UUIDs' });
  }
  const uniqueLabelIds = [...new Set(labelIds)];
  if (uniqueLabelIds.length > 10) return res.status(400).json({ error: 'A task can have at most 10 labels' });

  try {
    const taskResult = await db.query('SELECT id, created_by, assignee_id FROM tasks WHERE id=$1', [req.params.taskId]);
    if (!taskResult.rows.length) return res.status(404).json({ error: 'Task not found' });
    if (!canModifyTask(req.user, taskResult.rows[0])) {
      return res.status(403).json({ error: 'Not authorized to modify this task' });
    }

    if (uniqueLabelIds.length) {
      const labels = await db.query('SELECT id FROM labels WHERE id = ANY($1::uuid[])', [uniqueLabelIds]);
      if (labels.rows.length !== uniqueLabelIds.length) return res.status(400).json({ error: 'One or more labels were not found' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM task_labels WHERE task_id=$1', [req.params.taskId]);
      if (uniqueLabelIds.length) {
        await client.query(
          'INSERT INTO task_labels (task_id, label_id) SELECT $1, UNNEST($2::uuid[])',
          [req.params.taskId, uniqueLabelIds]
        );
      }
      const result = await client.query(
        `SELECT l.id, l.name, l.color FROM task_labels tl
         JOIN labels l ON l.id=tl.label_id WHERE tl.task_id=$1 ORDER BY l.name ASC`,
        [req.params.taskId]
      );
      await client.query('COMMIT');
      return res.json(result.rows.map(mapLabel));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
