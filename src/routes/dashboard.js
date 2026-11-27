const express = require('express');
const db = require('../db');
const authMW = require('../middleware/auth');

const router = express.Router();
router.use(authMW);

router.get('/summary', async (req, res) => {
  try {
    const [totals, mine, overdueTasks] = await Promise.all([
      db.query(`
        SELECT
          (SELECT COUNT(*)::int FROM projects) AS projects,
          COUNT(*)::int AS tasks,
          COUNT(*) FILTER (WHERE status='done')::int AS done,
          COUNT(*) FILTER (WHERE status='inprogress')::int AS inprogress,
          COUNT(*) FILTER (WHERE status='todo')::int AS todo,
          COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status <> 'done')::int AS overdue
        FROM tasks
      `),
      db.query(`
        SELECT
          COUNT(*)::int AS assigned,
          COUNT(*) FILTER (WHERE status <> 'done')::int AS pending
        FROM tasks
        WHERE assignee_id=$1
      `, [req.user.id]),
      db.query(`
        SELECT t.id, t.title, t.project_id,
          p.name AS project_name, p.color AS project_color,
          t.assignee_id, u.name AS assignee_name,
          to_char(t.due_date, 'YYYY-MM-DD') AS due_date, t.priority
        FROM tasks t
        LEFT JOIN projects p ON p.id=t.project_id
        LEFT JOIN users u ON u.id=t.assignee_id
        WHERE t.due_date < CURRENT_DATE AND t.status <> 'done'
        ORDER BY t.due_date ASC, t.id ASC
        LIMIT 10
      `)
    ]);

    const total = totals.rows[0];
    return res.json({
      totals: {
        projects: Number(total.projects), tasks: Number(total.tasks), done: Number(total.done),
        inprogress: Number(total.inprogress), todo: Number(total.todo), overdue: Number(total.overdue)
      },
      my: {
        assigned: Number(mine.rows[0].assigned),
        pending: Number(mine.rows[0].pending)
      },
      overdue_tasks: overdueTasks.rows.map(task => ({
        id: task.id, title: task.title, project_id: task.project_id,
        project_name: task.project_name, project_color: task.project_color,
        assignee_id: task.assignee_id, assignee_name: task.assignee_name,
        due_date: task.due_date, priority: task.priority
      }))
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
