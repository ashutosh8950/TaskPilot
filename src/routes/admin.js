const express = require('express');
const db = require('../db');
const authMW = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

const router = express.Router();
router.use(authMW, adminOnly);

router.get('/export', async (req, res) => {
  try {
    const [users, projects, tasks, comments, labels, taskLabels, activities, notifications] = await Promise.all([
      db.query('SELECT id, name, email, role, created_at FROM users'),
      db.query('SELECT * FROM projects'),
      db.query('SELECT * FROM tasks'),
      db.query('SELECT * FROM comments'),
      db.query('SELECT * FROM labels'),
      db.query('SELECT * FROM task_labels'),
      db.query('SELECT * FROM activities'),
      db.query('SELECT COUNT(*) FROM notifications')
    ]);

    const date = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Disposition': `attachment; filename="taskpilot-export-${date}.json"`,
      'Cache-Control': 'no-store'
    });
    return res.json({
      exported_at: new Date().toISOString(),
      counts: {
        users: users.rows.length,
        projects: projects.rows.length,
        tasks: tasks.rows.length,
        comments: comments.rows.length,
        labels: labels.rows.length,
        task_labels: taskLabels.rows.length,
        activities: activities.rows.length,
        notifications: Number(notifications.rows[0].count)
      },
      users: users.rows,
      projects: projects.rows,
      tasks: tasks.rows,
      comments: comments.rows,
      labels: labels.rows,
      task_labels: taskLabels.rows,
      activities: activities.rows,
      notifications_count: Number(notifications.rows[0].count)
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
