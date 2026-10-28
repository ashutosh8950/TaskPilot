const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicPath = path.join(__dirname, '..', 'public');
const css = fs.readFileSync(path.join(publicPath, 'css', 'app.css'), 'utf8');
const js = fs.readFileSync(path.join(publicPath, 'js', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(publicPath, 'index.html'), 'utf8');

test('static assets contain no HTML wrappers or inline handlers', () => {
  assert.doesNotMatch(css, /<style|<\/style/i, 'public/css/app.css must not contain style tags');
  assert.doesNotMatch(css, /<script|<\/script|<!--/i, 'public/css/app.css must not contain script or comment tags');
  assert.doesNotMatch(css.trimStart(), /^</, 'public/css/app.css must not begin with an HTML tag');
  assert.match(css, /:root\s*\{/, 'public/css/app.css must contain the :root block');

  assert.doesNotMatch(js, /<script|<\/script|<style/i, 'public/js/app.js must not contain HTML wrapper tags');
  assert.doesNotMatch(html, /<[^>]*\son[a-z]+\s*=/i, 'public/index.html must not contain inline event-handler attributes');
  assert.match(html, /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']\/css\/app\.css["']/i, 'public/index.html must link /css/app.css as a stylesheet');
  assert.match(html, /<script\b[^>]*src=["']\/js\/app\.js["'][^>]*>/i, 'public/index.html must load /js/app.js with a script src');
  assert.doesNotMatch(html, /<style\b[^>]*>[\s\S]*?<\/style\s*>/i, 'public/index.html must not contain an inline style block');
  assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script\s*>/i, 'public/index.html must not contain an inline script block');

  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(
    (cssWithoutComments.match(/\{/g) || []).length,
    (cssWithoutComments.match(/\}/g) || []).length,
    'public/css/app.css must have balanced braces'
  );
});
