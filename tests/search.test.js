const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  app,
  installDatabaseHooks,
  registerUser,
  request
} = require('./helpers');

let adminToken;
let adminId;
let projectId;
let taskIds;

function withToken(token) {
  return { Authorization: `Bearer ${token}` };
}

installDatabaseHooks(async () => {
  const registration = await registerUser({
    name: 'Search Admin',
    email: 'search-admin@example.test',
    password: 'search-password'
  });
  adminToken = registration.body.token;
  adminId = registration.body.user.id;
  const project = await request(app)
    .post('/api/projects')
    .set(withToken(adminToken))
    .send({ name: 'Search Project', description: 'Project search fixture' });
  projectId = project.body.id;

  const tasks = [
    { title: 'Alpha Needle', description: 'Title match description', status: 'todo', priority: 'high', assigneeId: adminId },
    { title: 'Beta Launch', description: 'buriedNeedle in description', status: 'inprogress', priority: 'low' },
    { title: 'Gamma Close', description: 'Third task description', status: 'done', priority: 'medium', assigneeId: adminId },
    { title: 'Delta Sort', description: 'Fourth task description', status: 'todo', priority: 'low' },
    { title: 'Epsilon Review', description: 'Fifth task description', status: 'done', priority: 'high' }
  ];
  taskIds = [];
  for (const task of tasks) {
    const response = await request(app)
      .post('/api/tasks')
      .set(withToken(adminToken))
      .send({ ...task, projectId });
    assert.equal(response.status, 201);
    taskIds.push(response.body.id);
  }
});

test('task q search matches title and description case-insensitively', async () => {
  const titleMatch = await request(app).get('/api/tasks?q=alpha').set(withToken(adminToken));
  const descriptionMatch = await request(app).get('/api/tasks?q=BURIEDneedle').set(withToken(adminToken));

  assert.equal(titleMatch.status, 200);
  assert.deepEqual(titleMatch.body.map(task => task.title), ['Alpha Needle']);
  assert.deepEqual(descriptionMatch.body.map(task => task.title), ['Beta Launch']);
});

test('task status and priority filters return only matching rows', async () => {
  const status = await request(app).get('/api/tasks?status=todo').set(withToken(adminToken));
  const priority = await request(app).get('/api/tasks?priority=high').set(withToken(adminToken));

  assert.deepEqual(status.body.map(task => task.title).sort(), ['Alpha Needle', 'Delta Sort']);
  assert.deepEqual(priority.body.map(task => task.title).sort(), ['Alpha Needle', 'Epsilon Review']);
});

test('task assignee, creator, and project filters remain available', async () => {
  const assigned = await request(app).get(`/api/tasks?assigneeId=${adminId}`).set(withToken(adminToken));
  const created = await request(app).get(`/api/tasks?createdBy=${adminId}`).set(withToken(adminToken));
  const project = await request(app).get(`/api/tasks?projectId=${projectId}`).set(withToken(adminToken));

  assert.deepEqual(assigned.body.map(task => task.title).sort(), ['Alpha Needle', 'Gamma Close']);
  assert.equal(created.body.length, 5);
  assert.equal(project.body.length, 5);
});

test('task sorting honors the selected field and order', async () => {
  const ascending = await request(app).get('/api/tasks?sort=title&order=asc').set(withToken(adminToken));
  const descending = await request(app).get('/api/tasks?sort=title&order=desc').set(withToken(adminToken));

  assert.equal(ascending.body[0].title, 'Alpha Needle');
  assert.equal(descending.body[0].title, 'Gamma Close');
});

test('task pagination returns count headers and handles both page boundaries', async () => {
  const firstPage = await request(app).get('/api/tasks?page=1&limit=2&sort=title&order=asc').set(withToken(adminToken));
  const lastPage = await request(app).get('/api/tasks?page=3&limit=2&sort=title&order=asc').set(withToken(adminToken));
  const pastLastPage = await request(app).get('/api/tasks?page=4&limit=2').set(withToken(adminToken));

  assert.equal(firstPage.headers['x-total-count'], '5');
  assert.equal(firstPage.headers['x-page'], '1');
  assert.equal(firstPage.headers['x-limit'], '2');
  assert.equal(firstPage.body.length, 2);
  assert.equal(lastPage.body.length, 1);
  assert.deepEqual(pastLastPage.body, []);
  assert.equal(pastLastPage.headers['x-total-count'], '5');
});

test('invalid task query parameters return clear 400 errors', async () => {
  const invalidQueries = [
    'status=blocked',
    'priority=urgent',
    'assigneeId=not-a-uuid',
    'sort=unknown',
    'order=sideways',
    'page=0',
    'limit=101'
  ];

  for (const query of invalidQueries) {
    const response = await request(app).get(`/api/tasks?${query}`).set(withToken(adminToken));
    assert.equal(response.status, 400, `${query} should be rejected`);
    assert.match(response.body.error, /invalid|must be/i);
  }
});

test('task list without query parameters remains an unpaginated array', async () => {
  const response = await request(app).get('/api/tasks').set(withToken(adminToken));
  const expectedKeys = [
    'id', 'title', 'description', 'project_id', 'assignee_id',
    'priority', 'status', 'due_date', 'created_by', 'created_at', 'labels'
  ];

  assert.equal(response.status, 200);
  assert.equal(response.body.length, taskIds.length);
  assert.deepEqual(Object.keys(response.body[0]), expectedKeys);
  assert.equal(Array.isArray(response.body[0].labels), true);
  assert.equal(response.headers['x-total-count'], undefined);
  assert.equal(response.headers['x-page'], undefined);
  assert.equal(response.headers['x-limit'], undefined);
});

test('project search, sorting, and pagination work with the same array response shape', async () => {
  const secondProject = await request(app)
    .post('/api/projects')
    .set(withToken(adminToken))
    .send({ name: 'Another Project', description: 'second-search-target' });
  assert.equal(secondProject.status, 201);

  const search = await request(app).get('/api/projects?q=SEARCH-TARGET').set(withToken(adminToken));
  const sorted = await request(app).get('/api/projects?sort=name&order=asc').set(withToken(adminToken));
  const paged = await request(app).get('/api/projects?page=1&limit=1').set(withToken(adminToken));
  const unpaged = await request(app).get('/api/projects').set(withToken(adminToken));
  const expectedProjectKeys = ['id', 'name', 'description', 'color', 'due_date', 'created_by', 'created_at'];

  assert.deepEqual(search.body.map(project => project.name), ['Another Project']);
  assert.equal(sorted.body[0].name, 'Another Project');
  assert.equal(paged.headers['x-total-count'], '2');
  assert.equal(paged.headers['x-page'], '1');
  assert.equal(paged.headers['x-limit'], '1');
  assert.equal(paged.body.length, 1);
  assert.equal(Array.isArray(unpaged.body), true);
  assert.deepEqual(Object.keys(unpaged.body[0]), expectedProjectKeys);
  assert.equal(unpaged.headers['x-total-count'], undefined);
});
