const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const originalDatabaseUrl = process.env.DATABASE_URL;

if (process.env.NODE_ENV === 'production') {
  console.error('Tests refuse to run with NODE_ENV=production.');
  process.exit(1);
}

if (!testDatabaseUrl) {
  console.error('TEST_DATABASE_URL is required to run tests; no tests were started.');
  process.exit(1);
}

function assertSafeTestUrl() {
  if (testDatabaseUrl === originalDatabaseUrl) {
    console.error('Refusing to run tests: TEST_DATABASE_URL must not match DATABASE_URL.');
    process.exit(1);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(testDatabaseUrl);
  } catch {
    console.error('Refusing to run tests: TEST_DATABASE_URL must be a valid URL.');
    process.exit(1);
  }

  const databaseName = parsedUrl.pathname.replace(/^\/+/, '');
  if (!['localhost', '127.0.0.1'].includes(parsedUrl.hostname) && !databaseName.toLowerCase().includes('test')) {
    console.error('Refusing to run tests: TEST_DATABASE_URL must use localhost or a database name containing "test".');
    process.exit(1);
  }
}

assertSafeTestUrl();

process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = 'taskpilot-test-jwt-secret-not-for-production';
process.env.NODE_ENV ||= 'test';

const { after, before } = require('node:test');
const request = require('supertest');
const app = require('../server');
const db = require('../src/db');
const { config } = require('../src/config');

const databaseLockId = 424242;
let lockClient;

function assertTestDatabase() {
  if (process.env.DATABASE_URL !== testDatabaseUrl || config.databaseUrl !== testDatabaseUrl) {
    throw new Error('Refusing database operation because DATABASE_URL does not match TEST_DATABASE_URL.');
  }
}

async function resetDb() {
  assertSafeTestUrl();
  assertTestDatabase();
  await db.pool.query('TRUNCATE TABLE users, projects, tasks, activities CASCADE');
}

function installDatabaseHooks(setupFixtures) {
  before(async () => {
    assertTestDatabase();
    lockClient = await db.pool.connect();
    await lockClient.query('SELECT pg_advisory_lock($1)', [databaseLockId]);
    await db.initDB();
    await resetDb();
    if (setupFixtures) await setupFixtures();
  });

  after(async () => {
    if (lockClient) {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [databaseLockId]);
      lockClient.release();
    }
    await db.pool.end();
  });
}

async function registerUser({ name, email, password }) {
  return request(app).post('/api/auth/register').send({ name, email, password });
}

async function loginUser(email, password) {
  return request(app).post('/api/auth/login').send({ email, password });
}

module.exports = {
  app,
  installDatabaseHooks,
  loginUser,
  registerUser,
  request,
  resetDb
};