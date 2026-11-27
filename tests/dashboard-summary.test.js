const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, installDatabaseHooks, registerUser, request } = require('./helpers');
const db = require('../src/db');

let adminToken;
let memberToken;
let adminId;
let memberId;
let projectId;

installDatabaseHooks(async () => {
  const admin = await registerUser({ name: 'Summary Admin', email: 'summary-admin@example.test', password: 'admin-password' });
  const member = await registerUser({ name: 'Summary Member', email: 'summary-member@example.test', password: 'member-password' });
  adminToken = admin.body.token;
  memberToken = member.body.token;
  adminId = admin.body.user.id;
  memberId = member.body.user.id;

  const project = await db.query(
    `INSERT INTO projects (name, color, created_by) VALUES ($1, $2, $3) RETURNING id`,
    ['Summary Project', '#7C3AED', admin.body.user.id]
  );
  projectId = project.rows[0].id;
  const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await db.query(`
    INSERT INTO tasks (title, project_id, assignee_id, priority, status, due_date, created_by)
    VALUES
      ('Done task', $1, $2, 'high', 'done', $3, $5),
      ('In progress task', $1, $2, 'medium', 'inprogress', $4, $5),
      ('Todo task', $1, $2, 'low', 'todo', $4, $5),
      ('Overdue task', $1, $2, 'high', 'todo', $3, $5)
  `, [projectId, memberId, past, future, adminId]);
});

test('dashboard summary returns grouped totals and member-specific counts', async () => {
  const response = await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${memberToken}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.totals.tasks, 4);
  assert.equal(response.body.totals.done, 1);
  assert.equal(response.body.totals.inprogress, 1);
  assert.equal(response.body.totals.todo, 2);
  assert.equal(response.body.totals.overdue, 1);
  assert.equal(response.body.my.assigned, 4);
  assert.equal(response.body.my.pending, 3);
  assert.equal(response.body.overdue_tasks.length, 1);
  assert.equal(response.body.overdue_tasks[0].title, 'Overdue task');
  assert.deepEqual(Object.keys(response.body.overdue_tasks[0]).sort(), [
    'assignee_id', 'assignee_name', 'due_date', 'id', 'priority',
    'project_color', 'project_id', 'project_name', 'title'
  ]);
  const adminResponse = await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(adminResponse.status, 200);
  assert.equal(adminResponse.body.my.assigned, 0);
  assert.equal(adminResponse.body.my.pending, 0);
  assert.deepEqual(adminResponse.body.totals, response.body.totals);
});

test('dashboard summary caps overdue tasks at ten and orders them by due date', async () => {
  const values = [];
  const placeholders = [];
  for (let index = 0; index < 12; index += 1) {
    const offset = index + 2;
    const dueDate = new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
    const base = index * 5;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, 'high', 'todo', $${base + 4}, $${base + 5})`);
    values.push(`Additional overdue ${index + 1}`, projectId, memberId, dueDate, adminId);
  }
  await db.query(`
    INSERT INTO tasks (title, project_id, assignee_id, priority, status, due_date, created_by)
    VALUES ${placeholders.join(', ')}
  `, values);

  const response = await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${memberToken}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.totals.overdue, 13);
  assert.equal(response.body.overdue_tasks.length, 10);
  const dates = response.body.overdue_tasks.map(task => task.due_date);
  assert.deepEqual(dates, [...dates].sort());
});

test('dashboard summary requires authentication', async () => {
  const response = await request(app).get('/api/dashboard/summary');
  assert.equal(response.status, 401);
});
