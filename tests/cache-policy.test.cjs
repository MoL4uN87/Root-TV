const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Cache = require('../helper/seena-cache.js');
const policy = require('../helper/seena-cache-policy.js');

test('Kinozal lists remain available from cache after twelve hours', t => {
  const now = { value: 1_000 };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seena-cache-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cache = new Cache(root, { now: () => now.value });
  const key = cache.makeKey('/kinozal/top', 'page=0');
  cache.put(key, 'page', Buffer.from('cached top'), policy.ttl('/kinozal/top'));
  now.value += 12 * 60 * 60 * 1000;
  assert.equal(cache.get(key).toString(), 'cached top');
});

test('Kinozal detail and torrent associations remain cached for a week', t => {
  const now = { value: 1_000 };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seena-cache-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cache = new Cache(root, { now: () => now.value });
  const key = cache.makeKey('/kinozal/details', 'id=42');
  cache.put(key, 'page', Buffer.from('release variants'), policy.ttl('/kinozal/details'));
  now.value += 6 * 24 * 60 * 60 * 1000;
  assert.equal(cache.get(key).toString(), 'release variants');
});
