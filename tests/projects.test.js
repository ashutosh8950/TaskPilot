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
let projectId;

function withToken(token) {
  return { Authorization: `Bearer ${token}` };
}

beforeEach(async () => {
  await resetDb();
  const admin = await registerUser({ name: 'Admin', email: 'admin@example.test', password: 'admin-password' });
  const member = await registerUser({ name: 'Member', email: 'member@example.test', password: 'member-password' });
  adminToken = admin.body.token;
  memberToken = member.body.token;
  const project = await request(app)
    .post('/api/projects')
    .set(withToken(adminToken))
    .send({ name: 'Test Project' });
  projectId = project.body.id;
});

test('projects support create, list, read, update, and delete', async () => {
  const created = await request(app)
    .post('/api/projects')
    .set(withToken(adminToken))
    .send({ name: 'Second Project', description: 'Initial details' });
  const listed = await request(app).get('/api/projects').set(withToken(adminToken));
  const read = await request(app).get(`/api/projects/${created.body.id}`).set(withToken(adminToken));
  const updated = await request(app)
    .put(`/api/projects/${created.body.id}`)
    .set(withToken(adminToken))
    .send({ name: 'Updated Project', description: 'Updated details' });
  const deleted = await request(app)
    .delete(`/api/projects/${created.body.id}`)
    .set(withToken(adminToken));

  assert.equal(created.status, 201);
  assert.ok(listed.body.some(project => project.id === created.body.id));
  assert.equal(read.body.name, 'Second Project');
  assert.equal(updated.body.name, 'Updated Project');
  assert.equal(deleted.status, 200);
});

test('project validation rejects empty names and malformed IDs', async () => {
  const emptyName = await request(app)
    .post('/api/projects')
    .set(withToken(adminToken))
    .send({ name: '   ' });
  const badId = await request(app).get('/api/projects/not-a-uuid').set(withToken(adminToken));

  assert.equal(emptyName.status, 400);
  assert.equal(badId.status, 400);
});

test('members cannot create, edit, or delete projects', async () => {
  const create = await request(app)
    .post('/api/projects')
    .set(withToken(memberToken))
    .send({ name: 'Forbidden Project' });
  const edit = await request(app)
    .put(`/api/projects/${projectId}`)
    .set(withToken(memberToken))
    .send({ name: 'Forbidden Edit' });
  const remove = await request(app)
    .delete(`/api/projects/${projectId}`)
    .set(withToken(memberToken));

  assert.equal(create.status, 403);
  assert.equal(edit.status, 403);
  assert.equal(remove.status, 403);
});