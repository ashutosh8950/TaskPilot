const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  app,
  installDatabaseHooks,
  registerUser,
  request
} = require('./helpers');
const db = require('../src/db');

installDatabaseHooks(async () => {
  const admin = await registerUser({ name: 'Comments Admin', email: 'comments-admin@example.test', password: 'admin-password' });
  const author = await registerUser({ name: 'Comment Author', email: 'comment-author@example.test', password: 'author-password' });
  const other = await registerUser({ name: 'Comment Other', email: 'comment-other@example.test', password: 'other-password' });
  adminToken = admin.body.token;
  authorToken = author.body.token;
  otherToken = other.body.token;
  authorId = author.body.user.id;
  const project = await request(app).post('/api/projects').set(auth(adminToken)).send({ name: 'Comments Project' });
  projectId = project.body.id;
});

let adminToken;
let authorToken;
let otherToken;
let authorId;
let projectId;

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createTask(token = adminToken, title = 'Comment Task') {
  const result = await request(app).post('/api/tasks').set(auth(token)).send({ title, projectId });
  assert.equal(result.status, 201);
  return result.body;
}

test('comments create, list in order, and include author names', async () => {
  const task = await createTask();
  const first = await request(app).post(`/api/tasks/${task.id}/comments`).set(auth(authorToken)).send({ body: 'First comment' });
  const second = await request(app).post(`/api/tasks/${task.id}/comments`).set(auth(adminToken)).send({ body: 'Second comment' });
  const listed = await request(app).get(`/api/tasks/${task.id}/comments`).set(auth(authorToken));

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.slice(-2).map(comment => comment.body), ['First comment', 'Second comment']);
  assert.equal(listed.body.at(-2).author_name, 'Comment Author');
  assert.equal(listed.body.at(-1).author_name, 'Comments Admin');
});

test('comment body validation rejects empty, whitespace, oversized, and non-string values', async () => {
  const task = await createTask();
  for (const body of ['', '   ', 'x'.repeat(2001), 42]) {
    const result = await request(app).post(`/api/tasks/${task.id}/comments`).set(auth(authorToken)).send({ body });
    assert.equal(result.status, 400);
  }
});

test('comments reject missing tasks and malformed task IDs', async () => {
  const missing = await request(app).get('/api/tasks/00000000-0000-4000-8000-000000000000/comments').set(auth(authorToken));
  const malformed = await request(app).get('/api/tasks/not-a-uuid/comments').set(auth(authorToken));
  assert.equal(missing.status, 404);
  assert.equal(malformed.status, 400);
});

test('only the author can edit a comment', async () => {
  const task = await createTask();
  const comment = await request(app).post(`/api/tasks/${task.id}/comments`).set(auth(authorToken)).send({ body: 'Original' });
  const forbidden = await request(app).put(`/api/comments/${comment.body.id}`).set(auth(otherToken)).send({ body: 'Changed' });
  const edited = await request(app).put(`/api/comments/${comment.body.id}`).set(auth(authorToken)).send({ body: 'Changed' });
  assert.equal(forbidden.status, 403);
  assert.equal(edited.status, 200);
  assert.equal(edited.body.body, 'Changed');
});

test('author and admin can delete comments, but other members cannot', async () => {
  const task = await createTask();
  const authorComment = await request(app).post(`/api/tasks/${task.id}/comments`).set(auth(authorToken)).send({ body: 'Author comment' });
  const forbidden = await request(app).delete(`/api/comments/${authorComment.body.id}`).set(auth(otherToken));
  const authorDelete = await request(app).delete(`/api/comments/${authorComment.body.id}`).set(auth(authorToken));
  const adminComment = await request(app).post(`/api/tasks/${task.id}/comments`).set(auth(authorToken)).send({ body: 'Admin delete' });
  const adminDelete = await request(app).delete(`/api/comments/${adminComment.body.id}`).set(auth(adminToken));
  assert.equal(forbidden.status, 403);
  assert.equal(authorDelete.status, 200);
  assert.equal(adminDelete.status, 200);
});

test('deleting a task cascades its comments', async () => {
  const task = await createTask(authorToken, 'Cascade Comment Task');
  const comment = await request(app).post(`/api/tasks/${task.id}/comments`).set(auth(authorToken)).send({ body: 'Cascade me' });
  await request(app).delete(`/api/tasks/${task.id}`).set(auth(authorToken));
  const remaining = await db.query('SELECT id FROM comments WHERE id=$1', [comment.body.id]);
  assert.equal(remaining.rows.length, 0);
});

test('comments require authentication', async () => {
  const task = await createTask();
  const list = await request(app).get(`/api/tasks/${task.id}/comments`);
  const create = await request(app).post(`/api/tasks/${task.id}/comments`).send({ body: 'No token' });
  assert.equal(list.status, 401);
  assert.equal(create.status, 401);
});

test('health and unknown API routes remain public and correctly routed', async () => {
  const health = await request(app).get('/api/health');
  const unknown = await request(app).get('/api/does-not-exist');
  assert.equal(health.status, 200);
  assert.equal(unknown.status, 404);
});
