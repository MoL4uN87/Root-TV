const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'seena-0.3.32', 'com.seena.webos');

test('TV provider frame can receive remote focus after it loads', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(html, /<iframe id="web-player-frame"[^>]*tabindex="0"/);
  assert.match(app, /web-player-frame'\)\.onload[\s\S]*web-player-frame'\)\.focus\(\)/);
});
