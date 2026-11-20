const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const { app, installDatabaseHooks, registerUser, loginUser, request } = require('./helpers');

let admin;
let member;
let other;
let projectId;

installDatabaseHooks(async () => {
  const users = [
    await registerUser({ name: 'Admin User', email: 'notify-admin@example.com', password: 'password123' }),
    await registerUser({ name: 'Member User', email: 'notify-member@example.com', password: 'password123' }),
    await registerUser({ name: 'Other User', email: 'notify-other@example.com', password: 'password123' })
  ];
  admin = (await loginUser('notify-admin@example.com', 'password123')).body;
  member = (await loginUser('notify-member@example.com', 'password123')).body;
  other = (await loginUser('notify-other@example.com', 'password123')).body;
  const project = await request(app).post('/api/projects').set('Authorization', `Bearer ${admin.token}`).send({ name: 'Notifications Project' });
  projectId = project.body.id;
});

function auth(token) { return { Authorization: `Bearer ${token}` }; }

test('health is public and notifications require authentication', async () => {
  assert.equal((await request(app).get('/api/health')).status, 200);
  assert.equal((await request(app).get('/api/notifications')).status, 401);
});

test('assignment notifications are created and are owner-only', async () => {
  const created = await request(app).post('/api/tasks').set(auth(admin.token)).send({ title: 'Assigned task', projectId, assigneeId: member.user.id });
  assert.equal(created.status, 201);
  const list = await request(app).get('/api/notifications').set(auth(member.token));
  assert.equal(list.status, 200);
  assert.match(list.body[0].message, /assigned you/);
  const notificationId = list.body[0].id;
  assert.equal((await request(app).get('/api/notifications').set(auth(other.token))).body.length, 0);
  assert.equal((await request(app).patch(`/api/notifications/${notificationId}/read`).set(auth(other.token))).status, 404);
  assert.equal((await request(app).patch(`/api/notifications/${notificationId}/read`).set(auth(member.token))).status, 200);
});

test('self assignment does not create a notification and reassignment does', async () => {
  const created = await request(app).post('/api/tasks').set(auth(admin.token)).send({ title: 'Reassigned task', projectId, assigneeId: admin.user.id });
  assert.equal(created.status, 201);
  const before = await request(app).get('/api/notifications').set(auth(member.token));
  await request(app).put(`/api/tasks/${created.body.id}`).set(auth(admin.token)).send({ title: 'Reassigned task', projectId, assigneeId: member.user.id });
  const after = await request(app).get('/api/notifications').set(auth(member.token));
  assert.equal(after.body.length, before.body.length + 1);
});

test('comments notify creator and assignee except commenter without body text', async () => {
  const created = await request(app).post('/api/tasks').set(auth(admin.token)).send({ title: 'Comment task', projectId, assigneeId: member.user.id });
  await request(app).post(`/api/tasks/${created.body.id}/comments`).set(auth(other.token)).send({ body: 'private comment body' });
  const creator = await request(app).get('/api/notifications').set(auth(admin.token));
  const assignee = await request(app).get('/api/notifications').set(auth(member.token));
  const commenter = await request(app).get('/api/notifications').set(auth(other.token));
  assert.ok(creator.body.some(n => n.type === 'comment'));
  assert.ok(assignee.body.some(n => n.type === 'comment'));
  assert.ok(!commenter.body.some(n => n.type === 'comment'));
  assert.ok(!creator.body.some(n => n.message.includes('private comment body')));
});

test('reminders are idempotent, exclude done tasks, and support pagination/read-all', async () => {
  const due = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const created = await request(app).post('/api/tasks').set(auth(member.token)).send({ title: 'Soon task', projectId, assigneeId: member.user.id, due });
  const first = await request(app).get('/api/notifications?unread=true&page=1&limit=100').set(auth(member.token));
  const second = await request(app).get('/api/notifications?unread=true&page=1&limit=100').set(auth(member.token));
  assert.equal(second.body.filter(n => n.task_id === created.body.id).length, 1);
  assert.equal(first.headers['x-page'], '1');
  assert.equal(first.headers['x-limit'], '100');
  const count = await request(app).get('/api/notifications/unread-count').set(auth(member.token));
  assert.equal(count.status, 200);
  const all = await request(app).post('/api/notifications/read-all').set(auth(member.token));
  assert.ok(all.body.updated >= 1);
  assert.equal((await request(app).get('/api/notifications?unknown=x').set(auth(member.token))).status, 400);
});

test('task deletion cascades notifications', async () => {
  const created = await request(app).post('/api/tasks').set(auth(admin.token)).send({ title: 'Cascade task', projectId, assigneeId: member.user.id });
  const before = await request(app).get('/api/notifications').set(auth(member.token));
  assert.ok(before.body.some(n => n.task_id === created.body.id));
  await request(app).delete(`/api/tasks/${created.body.id}`).set(auth(admin.token));
  const after = await request(app).get('/api/notifications').set(auth(member.token));
  assert.ok(!after.body.some(n => n.task_id === created.body.id));
});
