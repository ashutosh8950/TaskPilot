const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const {
  app,
  installDatabaseHooks,
  loginUser,
  registerUser,
  request,
  resetDb
} = require('./helpers');

installDatabaseHooks();

let adminToken;
let memberToken;
let memberId;

function withToken(token) {
  return { Authorization: `Bearer ${token}` };
}

beforeEach(async () => {
  await resetDb();
  const admin = await registerUser({ name: 'Admin', email: 'admin@example.test', password: 'admin-password' });
  const member = await registerUser({ name: 'Member', email: 'member@example.test', password: 'member-password' });
  adminToken = admin.body.token;
  memberToken = member.body.token;
  memberId = member.body.user.id;
});

test('admin invite returns a temporary password once and it allows login', async () => {
  const invitation = await request(app)
    .post('/api/members')
    .set(withToken(adminToken))
    .send({ name: 'Invited User', email: 'invited@example.test' });
  const login = await loginUser('invited@example.test', invitation.body.temporaryPassword);
  const members = await request(app).get('/api/members').set(withToken(adminToken));
  const invitedMember = members.body.find(user => user.email === 'invited@example.test');

  assert.equal(invitation.status, 201);
  assert.equal(typeof invitation.body.temporaryPassword, 'string');
  assert.equal(login.status, 200);
  assert.equal(Object.hasOwn(invitedMember, 'temporaryPassword'), false);
});

test('members cannot invite other users', async () => {
  const response = await request(app)
    .post('/api/members')
    .set(withToken(memberToken))
    .send({ name: 'Blocked Invite', email: 'blocked@example.test' });

  assert.equal(response.status, 403);
});

test('a deleted user cannot use their existing token', async () => {
  const deleted = await request(app)
    .delete(`/api/members/${memberId}`)
    .set(withToken(adminToken));
  const oldToken = await request(app)
    .get('/api/auth/me')
    .set(withToken(memberToken));

  assert.equal(deleted.status, 200);
  assert.equal(oldToken.status, 401);
});

test('health endpoint returns 200', async () => {
  const response = await request(app).get('/api/health');

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'healthy');
});