const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, installDatabaseHooks, registerUser, request } = require('./helpers');
const db = require('../src/db');

let adminToken;
let memberToken;

installDatabaseHooks(async () => {
  const admin = await registerUser({ name: 'Export Admin', email: 'export-admin@example.test', password: 'admin-password' });
  const member = await registerUser({ name: 'Export Member', email: 'export-member@example.test', password: 'member-password' });
  adminToken = admin.body.token;
  memberToken = member.body.token;
});

test('admin export contains sanitized workspace data and counts', async () => {
  await db.query('INSERT INTO activities (text) VALUES ($1)', ['Export activity']);
  const response = await request(app).get('/api/admin/export').set('Authorization', `Bearer ${adminToken}`);

  assert.equal(response.status, 200);
  assert.ok(response.body.exported_at);
  for (const key of ['counts', 'users', 'projects', 'tasks', 'comments', 'labels', 'task_labels', 'activities', 'notifications_count']) {
    assert.ok(Object.hasOwn(response.body, key), `missing ${key}`);
  }
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.match(response.headers['content-disposition'], /taskpilot-export-\d{4}-\d{2}-\d{2}\.json/);
  assert.deepEqual(Object.keys(response.body.users[0]).sort(), ['created_at', 'email', 'id', 'name', 'role']);
  assert.equal(JSON.stringify(response.body).includes('password_hash'), false);
  assert.equal(JSON.stringify(response.body).includes('token_version'), false);
  assert.equal((await request(app).get('/api/admin/export').set('Authorization', `Bearer ${memberToken}`)).status, 403);
  assert.equal((await request(app).get('/api/admin/export')).status, 401);
});
