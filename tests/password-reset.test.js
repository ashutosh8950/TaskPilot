const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, installDatabaseHooks, loginUser, registerUser, request } = require('./helpers');

let adminToken;
let adminId;
let memberToken;
let memberId;

installDatabaseHooks(async () => {
  const admin = await registerUser({ name: 'Reset Admin', email: 'reset-admin@example.test', password: 'admin-password' });
  const member = await registerUser({ name: 'Reset Member', email: 'reset-member@example.test', password: 'member-password' });
  adminToken = admin.body.token;
  adminId = admin.body.user.id;
  memberToken = member.body.token;
  memberId = member.body.user.id;
});

test('admin reset revokes old sessions and returns a usable temporary password', async () => {
  const response = await request(app)
    .post(`/api/members/${memberId}/reset-password`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.equal(response.status, 200);
  assert.equal(typeof response.body.temporaryPassword, 'string');
  assert.equal(JSON.stringify(response.body).includes('password_hash'), false);

  const oldLogin = await loginUser('reset-member@example.test', 'member-password');
  const temporaryLogin = await loginUser('reset-member@example.test', response.body.temporaryPassword);
  const oldTokenRequest = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${memberToken}`);
  assert.equal(oldLogin.status, 401);
  assert.equal(temporaryLogin.status, 200);
  assert.equal(oldTokenRequest.status, 401);

  const memberAttempt = await request(app)
    .post(`/api/members/${memberId}/reset-password`)
    .set('Authorization', `Bearer ${temporaryLogin.body.token}`);
  assert.equal(memberAttempt.status, 403);

  const ownReset = await request(app)
    .post(`/api/members/${adminId}/reset-password`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(ownReset.status, 400);

  assert.equal((await request(app).post('/api/members/not-a-uuid/reset-password').set('Authorization', `Bearer ${adminToken}`)).status, 400);
  assert.equal((await request(app).post('/api/members/00000000-0000-4000-8000-000000000000/reset-password').set('Authorization', `Bearer ${adminToken}`)).status, 404);
  assert.equal((await request(app).post(`/api/members/${memberId}/reset-password`)).status, 401);
});
