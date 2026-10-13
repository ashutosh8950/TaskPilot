process.env.ALLOW_REGISTRATION = 'false';

const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const { installDatabaseHooks, registerUser, resetDb } = require('./helpers');

installDatabaseHooks();
beforeEach(resetDb);

test('registration disabled still permits the first user but blocks the second', async () => {
  const first = await registerUser({
    name: 'First Admin',
    email: 'first@example.test',
    password: 'first-password'
  });
  const second = await registerUser({
    name: 'Second User',
    email: 'second@example.test',
    password: 'second-password'
  });

  assert.equal(first.status, 201);
  assert.equal(first.body.user.role, 'admin');
  assert.equal(second.status, 403);
});