const test = require('node:test');
const assert = require('node:assert/strict');
const { app, request, installDatabaseHooks } = require('./helpers');

installDatabaseHooks();

test('serves CSP and static application assets', async () => {
  const html = await request(app).get('/');
  assert.equal(html.status, 200);
  assert.match(html.headers['content-security-policy'], /script-src 'self'/);

  const script = await request(app).get('/js/app.js');
  assert.equal(script.status, 200);
  assert.match(script.headers['content-type'], /javascript/);

  const stylesheet = await request(app).get('/css/app.css');
  assert.equal(stylesheet.status, 200);

  const missing = await request(app).get('/js/missing.js');
  assert.equal(missing.status, 404);
});
