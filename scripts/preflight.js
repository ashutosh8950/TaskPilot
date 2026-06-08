require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const failures = [];
const warnings = [];

function filePath(...parts) {
  return path.join(root, ...parts);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function warn(condition, message) {
  if (condition) warnings.push(message);
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
}

function checkConfig() {
  try {
    require('../src/config');
  } catch (err) {
    failures.push(err.message);
  }
}

function checkPackage() {
  const pkg = readJson('package.json');
  readJson('package-lock.json');

  assert(pkg.scripts && pkg.scripts.start === 'node server.js', 'package.json must define start as "node server.js"');
  assert(pkg.scripts && pkg.scripts.preflight === 'node scripts/preflight.js', 'package.json must define the preflight script');
  assert(pkg.engines && pkg.engines.node, 'package.json should define a Node engine range');
}

function checkRenderYaml() {
  const renderYaml = fs.readFileSync(filePath('render.yaml'), 'utf8');

  assert(/type:\s*web/.test(renderYaml), 'render.yaml must define a web service');
  assert(/runtime:\s*node/.test(renderYaml), 'render.yaml must use the Node runtime');
  assert(/buildCommand:\s*npm ci && npm run preflight/.test(renderYaml), 'render.yaml should run npm ci and preflight during build');
  assert(/startCommand:\s*node server\.js/.test(renderYaml), 'render.yaml must start with node server.js');
  assert(/healthCheckPath:\s*\/api\/health/.test(renderYaml), 'render.yaml must health check /api/health');
  assert(/fromDatabase:[\s\S]*property:\s*connectionString/.test(renderYaml), 'render.yaml must wire DATABASE_URL from Render Postgres');
  warn(/databases:[\s\S]*plan:\s*free/.test(renderYaml), 'Render free Postgres expires after 30 days; use a paid database for production data');
}

function checkInlineScripts() {
  const html = fs.readFileSync(filePath('public', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];

  assert(scripts.length > 0, 'public/index.html must include an application script');

  for (const [index, script] of scripts.map(match => match[1]).entries()) {
    try {
      new Function(script);
    } catch (err) {
      failures.push(`Inline script ${index + 1} is invalid: ${err.message}`);
    }
  }
}

function checkNodeSyntax() {
  const files = [
    'server.js',
    'src/config.js',
    'src/db.js',
    'src/middleware/adminOnly.js',
    'src/middleware/auth.js',
    'src/routes/activities.js',
    'src/routes/auth.js',
    'src/routes/members.js',
    'src/routes/projects.js',
    'src/routes/tasks.js',
    'scripts/preflight.js'
  ];

  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: root,
      encoding: 'utf8'
    });

    if (result.status !== 0) {
      failures.push(`${file} failed syntax check:\n${result.stderr || result.stdout}`);
    }
  }
}

checkConfig();
checkPackage();
checkRenderYaml();
checkInlineScripts();
checkNodeSyntax();

if (warnings.length) {
  console.warn('Preflight warnings:');
  for (const message of warnings) console.warn(`- ${message}`);
}

if (failures.length) {
  console.error('Preflight failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('Preflight passed.');
