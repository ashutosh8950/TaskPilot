const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, installDatabaseHooks, registerUser, request } = require('./helpers');

installDatabaseHooks(async () => {
  const admin = await registerUser({ name: 'Labels Admin', email: 'labels-admin@example.test', password: 'admin-password' });
  const creator = await registerUser({ name: 'Labels Creator', email: 'labels-creator@example.test', password: 'creator-password' });
  const assignee = await registerUser({ name: 'Labels Assignee', email: 'labels-assignee@example.test', password: 'assignee-password' });
  const outsider = await registerUser({ name: 'Labels Outsider', email: 'labels-outsider@example.test', password: 'outsider-password' });
  adminToken = admin.body.token;
  creatorToken = creator.body.token;
  assigneeToken = assignee.body.token;
  outsiderToken = outsider.body.token;
  creatorId = creator.body.user.id;
  assigneeId = assignee.body.user.id;
  const project = await request(app).post('/api/projects').set(auth(adminToken)).send({ name: 'Labels Project' });
  projectId = project.body.id;
});

let adminToken;
let creatorToken;
let assigneeToken;
let outsiderToken;
let creatorId;
let assigneeId;
let projectId;

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createTask(token = creatorToken, assigneeIdValue) {
  const result = await request(app).post('/api/tasks').set(auth(token)).send({
    title: 'Label Task', projectId, assigneeId: assigneeIdValue
  });
  assert.equal(result.status, 201);
  return result.body;
}

async function createLabel(name, color = '#7c6af7') {
  const result = await request(app).post('/api/labels').set(auth(adminToken)).send({ name, color });
  assert.equal(result.status, 201);
  return result.body;
}

test('admins create labels; members cannot; duplicates and bad colors are rejected', async () => {
  const label = await createLabel('Urgent', '#f05252');
  const memberCreate = await request(app).post('/api/labels').set(auth(creatorToken)).send({ name: 'Member Label', color: '#38bdf8' });
  const duplicate = await request(app).post('/api/labels').set(auth(adminToken)).send({ name: ' urgent ', color: '#38bdf8' });
  const badColor = await request(app).post('/api/labels').set(auth(adminToken)).send({ name: 'Bad Color', color: 'red' });
  const memberDelete = await request(app).delete(`/api/labels/${label.id}`).set(auth(creatorToken));
  const listed = await request(app).get('/api/labels').set(auth(creatorToken));
  assert.equal(memberCreate.status, 403);
  assert.equal(duplicate.status, 409);
  assert.equal(badColor.status, 400);
  assert.equal(memberDelete.status, 403);
  assert.ok(listed.body.some(item => item.id === label.id));
});

test('task labels enforce permissions, limits, existence, and task responses', async () => {
  const labels = await Promise.all(Array.from({ length: 11 }, (_, index) => createLabel(`Label ${index + 1}`)));
  const task = await createTask(creatorToken, assigneeId);
  const creatorAssign = await request(app).put(`/api/tasks/${task.id}/labels`).set(auth(creatorToken)).send({ labelIds: [labels[0].id, labels[0].id, labels[1].id] });
  const assigneeAssign = await request(app).put(`/api/tasks/${task.id}/labels`).set(auth(assigneeToken)).send({ labelIds: [labels[2].id] });
  const outsiderAssign = await request(app).put(`/api/tasks/${task.id}/labels`).set(auth(outsiderToken)).send({ labelIds: [labels[0].id] });
  const adminAssign = await request(app).put(`/api/tasks/${task.id}/labels`).set(auth(adminToken)).send({ labelIds: labels.slice(0, 3).map(label => label.id) });
  const tooMany = await request(app).put(`/api/tasks/${task.id}/labels`).set(auth(adminToken)).send({ labelIds: labels.map(label => label.id) });
  const unknown = await request(app).put(`/api/tasks/${task.id}/labels`).set(auth(adminToken)).send({ labelIds: ['00000000-0000-4000-8000-000000000000'] });
  const listed = await request(app).get(`/api/tasks/${task.id}`).set(auth(adminToken));
  const filtered = await request(app).get(`/api/tasks?labelId=${labels[0].id}`).set(auth(adminToken));
  const invalidFilter = await request(app).get('/api/tasks?labelId=bad').set(auth(adminToken));
  const deleted = await request(app).delete(`/api/labels/${labels[0].id}`).set(auth(adminToken));
  const afterDelete = await request(app).get(`/api/tasks/${task.id}`).set(auth(adminToken));

  assert.equal(creatorAssign.status, 200);
  assert.equal(creatorAssign.body.length, 2);
  assert.equal(assigneeAssign.status, 200);
  assert.equal(outsiderAssign.status, 403);
  assert.equal(adminAssign.status, 200);
  assert.equal(tooMany.status, 400);
  assert.equal(unknown.status, 400);
  assert.ok(Array.isArray(listed.body.labels));
  assert.ok(Object.prototype.hasOwnProperty.call(listed.body, 'title'));
  assert.ok(filtered.body.some(item => item.id === task.id));
  assert.equal(invalidFilter.status, 400);
  assert.equal(deleted.status, 200);
  assert.ok(!afterDelete.body.labels.some(label => label.id === labels[0].id));
});

test('creator, assignee, and admin can assign labels while unrelated members cannot', async () => {
  const label = await createLabel('Permission Label');
  const creatorTask = await createTask(creatorToken);
  const assigneeTask = await createTask(creatorToken, assigneeId);
  const creator = await request(app).put(`/api/tasks/${creatorTask.id}/labels`).set(auth(creatorToken)).send({ labelIds: [label.id] });
  const assignee = await request(app).put(`/api/tasks/${assigneeTask.id}/labels`).set(auth(assigneeToken)).send({ labelIds: [label.id] });
  const admin = await request(app).put(`/api/tasks/${creatorTask.id}/labels`).set(auth(adminToken)).send({ labelIds: [] });
  const outsider = await request(app).put(`/api/tasks/${creatorTask.id}/labels`).set(auth(outsiderToken)).send({ labelIds: [label.id] });
  assert.equal(creator.status, 200);
  assert.equal(assignee.status, 200);
  assert.equal(admin.status, 200);
  assert.equal(outsider.status, 403);
});
