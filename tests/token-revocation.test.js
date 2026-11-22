const { app, installDatabaseHooks, registerUser, loginUser, request } = require('./helpers');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const jwt = require('jsonwebtoken');
const { config } = require('../src/config');

let user;
let originalToken;
let refreshedToken;

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

installDatabaseHooks(async () => {
  const registration = await registerUser({
    name: 'Revocation User',
    email: 'token-revocation@example.test',
    password: 'old-password'
  });
  user = registration.body.user;
  originalToken = registration.body.token;
});

test('tokens without tokenVersion remain valid while the database version is zero', async () => {
  const legacyToken = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
  const response = await request(app).get('/api/auth/me').set(auth(legacyToken));
  assert.equal(response.status, 200);
});

test('password change revokes the old token and returns a working replacement', async () => {
  const changed = await request(app)
    .post('/api/auth/change-password')
    .set(auth(originalToken))
    .send({ currentPassword: 'old-password', newPassword: 'new-password' });
  assert.equal(changed.status, 200);
  assert.equal(typeof changed.body.token, 'string');
  refreshedToken = changed.body.token;

  assert.equal((await request(app).get('/api/auth/me').set(auth(originalToken))).status, 401);
  assert.equal((await request(app).get('/api/auth/me').set(auth(refreshedToken))).status, 200);
  assert.equal((await loginUser('token-revocation@example.test', 'new-password')).status, 200);
});

test('a wrong current password does not bump the token version', async () => {
  const changed = await request(app)
    .post('/api/auth/change-password')
    .set(auth(refreshedToken))
    .send({ currentPassword: 'wrong-password', newPassword: 'another-password' });
  assert.equal(changed.status, 400);
  assert.equal((await request(app).get('/api/auth/me').set(auth(refreshedToken))).status, 200);
});
