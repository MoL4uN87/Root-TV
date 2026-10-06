const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'seena-0.3.32', 'com.seena.webos', 'app.js'), 'utf8');

test('video search keyboard is scheduled only after an explicit input click', () => {
  const openVideo = /function openVideo\(\) \{[^}]+\}/.exec(app)[0];
  assert.doesNotMatch(openVideo, /video-search-input'\)\.focus\(\)/);
  assert.match(openVideo, /video-search-input'\)\.readOnly = true/);
  assert.match(app, /video-search-input'\)\.addEventListener\('click', function \(\) \{ this\.readOnly = false; scheduleKinozalKeyboard\(this\); \}\)/);
  assert.doesNotMatch(app, /\['focus', 'click'\]\.forEach\(function \(eventName\) \{ \$\('video-search-input'\)/);
});
