const { app, installDatabaseHooks, registerUser, request } = require('./helpers');
const assert = require('node:assert/strict');
const { test } = require('node:test');

let token;
let projectWithTasks;
let emptyProject;

function auth() {
  return { Authorization: `Bearer ${token}` };
}

installDatabaseHooks(async () => {
  const registration = await registerUser({
    name: 'Stats Admin',
    email: 'project-stats@example.test',
    password: 'stats-password'
  });
  token = registration.body.token;

  const first = await request(app)
    .post('/api/projects')
    .set(auth())
    .send({ name: 'Stats Project' });
  const second = await request(app)
    .post('/api/projects')
    .set(auth())
    .send({ name: 'Empty Project' });
  projectWithTasks = first.body.id;
  emptyProject = second.body.id;

  await request(app)
    .post('/api/tasks')
    .set(auth())
    .send({ title: 'Open task', projectId: projectWithTasks, status: 'todo' });
  await request(app)
    .post('/api/tasks')
    .set(auth())
    .send({ title: 'Done task', projectId: projectWithTasks, status: 'done' });
});

test('project stats include correct counts and zero-task projects', async () => {
  const response = await request(app).get('/api/projects/stats').set(auth());
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.find(stat => stat.project_id === projectWithTasks), {
    project_id: projectWithTasks, total: 2, done: 1
  });
  assert.deepEqual(response.body.find(stat => stat.project_id === emptyProject), {
    project_id: emptyProject, total: 0, done: 0
  });
});

test('project stats require authentication and preserve project routes', async () => {
  assert.equal((await request(app).get('/api/projects/stats')).status, 401);
  assert.equal((await request(app).get(`/api/projects/${projectWithTasks}`).set(auth())).status, 200);
  assert.equal((await request(app).get('/api/projects/not-a-uuid').set(auth())).status, 400);
});
