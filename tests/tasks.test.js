const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const {
  app,
  installDatabaseHooks,
  registerUser,
  request,
  resetDb
} = require('./helpers');

installDatabaseHooks();

let adminToken;
let memberToken;
let outsiderToken;
let memberId;
let projectId;

function withToken(token) {
  return { Authorization: `Bearer ${token}` };
}

beforeEach(async () => {
  await resetDb();
  const admin = await registerUser({ name: 'Admin', email: 'admin@example.test', password: 'admin-password' });
  const member = await registerUser({ name: 'Member', email: 'member@example.test', password: 'member-password' });
  const outsider = await registerUser({ name: 'Outsider', email: 'outsider@example.test', password: 'outsider-password' });
  adminToken = admin.body.token;
  memberToken = member.body.token;
  outsiderToken = outsider.body.token;
  memberId = member.body.user.id;
  const project = await request(app)
    .post('/api/projects')
    .set(withToken(adminToken))
    .send({ name: 'Test Project' });
  projectId = project.body.id;
});

test('tasks support create, list, read, update, status update, and delete', async () => {
  const created = await request(app)
    .post('/api/tasks')
    .set(withToken(adminToken))
    .send({ title: 'Initial task', projectId, assigneeId: memberId });
  const listed = await request(app).get(`/api/tasks?projectId=${projectId}`).set(withToken(adminToken));
  const read = await request(app).get(`/api/tasks/${created.body.id}`).set(withToken(adminToken));
  const updated = await request(app)
    .put(`/api/tasks/${created.body.id}`)
    .set(withToken(adminToken))
    .send({ title: 'Updated task' });
  const status = await request(app)
    .patch(`/api/tasks/${created.body.id}/status`)
    .set(withToken(adminToken))
    .send({ status: 'done' });
  const deleted = await request(app)
    .delete(`/api/tasks/${created.body.id}`)
    .set(withToken(adminToken));

  assert.equal(created.status, 201);
  assert.ok(listed.body.some(task => task.id === created.body.id));
  assert.equal(read.body.title, 'Initial task');
  assert.equal(updated.body.title, 'Updated task');
  assert.equal(status.body.status, 'done');
  assert.equal(deleted.status, 200);
});

test('task validation rejects empty or oversized titles and oversized descriptions', async () => {
  const emptyTitle = await request(app)
    .post('/api/tasks')
    .set(withToken(adminToken))
    .send({ title: '  ', projectId });
  const longTitle = await request(app)
    .post('/api/tasks')
    .set(withToken(adminToken))
    .send({ title: 't'.repeat(301), projectId });
  const longDescription = await request(app)
    .post('/api/tasks')
    .set(withToken(adminToken))
    .send({ title: 'Valid title', description: 'd'.repeat(5001), projectId });

  assert.equal(emptyTitle.status, 400);
  assert.equal(longTitle.status, 400);
  assert.equal(longDescription.status, 400);
});

test('task validation rejects malformed task and project IDs', async () => {
  const badTaskId = await request(app).get('/api/tasks/not-a-uuid').set(withToken(adminToken));
  const badProjectId = await request(app).get('/api/tasks?projectId=not-a-uuid').set(withToken(adminToken));
  const badProjectOnCreate = await request(app)
    .post('/api/tasks')
    .set(withToken(adminToken))
    .send({ title: 'Valid title', projectId: 'not-a-uuid' });

  assert.equal(badTaskId.status, 400);
  assert.equal(badProjectId.status, 400);
  assert.equal(badProjectOnCreate.status, 400);
});

test('members cannot edit or delete tasks they neither created nor are assigned to', async () => {
  const task = await request(app)
    .post('/api/tasks')
    .set(withToken(adminToken))
    .send({ title: 'Protected task', projectId, assigneeId: memberId });
  const edit = await request(app)
    .put(`/api/tasks/${task.body.id}`)
    .set(withToken(outsiderToken))
    .send({ title: 'Unauthorized edit' });
  const remove = await request(app)
    .delete(`/api/tasks/${task.body.id}`)
    .set(withToken(outsiderToken));

  assert.equal(edit.status, 403);
  assert.equal(remove.status, 403);
});

test('members can edit their own tasks', async () => {
  const task = await request(app)
    .post('/api/tasks')
    .set(withToken(memberToken))
    .send({ title: 'Member task', projectId });
  const edit = await request(app)
    .put(`/api/tasks/${task.body.id}`)
    .set(withToken(memberToken))
    .send({ title: 'Member edited task' });

  assert.equal(task.status, 201);
  assert.equal(edit.status, 200);
  assert.equal(edit.body.title, 'Member edited task');
});

test('admins can edit and delete tasks created by other users', async () => {
  const task = await request(app)
    .post('/api/tasks')
    .set(withToken(memberToken))
    .send({ title: 'Member task', projectId });
  const edit = await request(app)
    .put(`/api/tasks/${task.body.id}`)
    .set(withToken(adminToken))
    .send({ title: 'Admin edited task' });
  const remove = await request(app)
    .delete(`/api/tasks/${task.body.id}`)
    .set(withToken(adminToken));

  assert.equal(edit.status, 200);
  assert.equal(edit.body.title, 'Admin edited task');
  assert.equal(remove.status, 200);
});