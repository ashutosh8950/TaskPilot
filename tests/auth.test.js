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
beforeEach(resetDb);

const adminCredentials = {
  name: 'Test Admin',
  email: 'admin@example.test',
  password: 'correct-password'
};

test('first registration is admin and second registration is member', async () => {
  const first = await registerUser(adminCredentials);
  const second = await registerUser({
    name: 'Second User',
    email: 'second@example.test',
    password: 'second-password'
  });

  assert.equal(first.status, 201);
  assert.equal(first.body.user.role, 'admin');
  assert.equal(second.status, 201);
  assert.equal(second.body.user.role, 'member');
});

test('registration rejects a duplicate email with 409', async () => {
  await registerUser(adminCredentials);
  const duplicate = await registerUser({ ...adminCredentials, name: 'Duplicate' });

  assert.equal(duplicate.status, 409);
});

test('registration rejects passwords shorter than 6 or longer than 72 characters', async () => {
  const tooShort = await registerUser({ ...adminCredentials, password: '12345' });
  const tooLong = await registerUser({ ...adminCredentials, password: 'x'.repeat(73) });

  assert.equal(tooShort.status, 400);
  assert.equal(tooLong.status, 400);
});

test('login accepts the correct password and rejects the wrong password', async () => {
  await registerUser(adminCredentials);
  const success = await loginUser(adminCredentials.email, adminCredentials.password);
  const wrongPassword = await loginUser(adminCredentials.email, 'wrong-password');

  assert.equal(success.status, 200);
  assert.ok(success.body.token);
  assert.equal(wrongPassword.status, 401);
});

test('/api/auth/me returns the current user with a token', async () => {
  const registration = await registerUser(adminCredentials);
  const response = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${registration.body.token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.email, adminCredentials.email);
});

test('/api/auth/me rejects a missing token', async () => {
  const response = await request(app).get('/api/auth/me');

  assert.equal(response.status, 401);
});

test('change password rejects an incorrect current password', async () => {
  const registration = await registerUser(adminCredentials);
  const response = await request(app)
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${registration.body.token}`)
    .send({ currentPassword: 'wrong-password', newPassword: 'new-password' });

  assert.equal(response.status, 400);
});

test('change password rejects the current password as the new password', async () => {
  const registration = await registerUser(adminCredentials);
  const response = await request(app)
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${registration.body.token}`)
    .send({ currentPassword: adminCredentials.password, newPassword: adminCredentials.password });

  assert.equal(response.status, 400);
});

test('change password succeeds and only the new password logs in', async () => {
  const registration = await registerUser(adminCredentials);
  const changed = await request(app)
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${registration.body.token}`)
    .send({ currentPassword: adminCredentials.password, newPassword: 'new-password' });
  const oldPasswordLogin = await loginUser(adminCredentials.email, adminCredentials.password);
  const newPasswordLogin = await loginUser(adminCredentials.email, 'new-password');

  assert.equal(changed.status, 200);
  assert.equal(oldPasswordLogin.status, 401);
  assert.equal(newPasswordLogin.status, 200);
});