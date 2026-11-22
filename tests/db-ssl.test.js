const { app } = require('./helpers');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { rewriteSslMode } = require('../src/db-ssl');

void app;

test('rewrites legacy PostgreSQL sslmode aliases without changing other URLs', () => {
  assert.equal(
    rewriteSslMode('postgresql://user:pass@example.test/db?sslmode=require'),
    'postgresql://user:pass@example.test/db?sslmode=verify-full'
  );
  assert.equal(
    rewriteSslMode('postgresql://user:pass@example.test/db?sslmode=prefer&connect_timeout=5'),
    'postgresql://user:pass@example.test/db?sslmode=verify-full&connect_timeout=5'
  );
  assert.equal(rewriteSslMode('postgresql://localhost/test'), 'postgresql://localhost/test');
});
