const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Cache = require('../helper/seena-cache.js');

function temporaryCache(t, now) {
  now = now || { value: Date.now() };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seena-cache-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return new Cache(root, { now: () => now.value });
}

test('a fresh page is reused and an expired page is fetched again', t => {
  const now = { value: 1000 };
  const cache = temporaryCache(t, now);
  const key = cache.makeKey('/kinozal/top', 'page=0');
  cache.put(key, 'page', Buffer.from('top-1'), 10_000);
  assert.equal(cache.get(key).toString(), 'top-1');
  now.value = 11_001;
  assert.equal(cache.get(key), null);
  assert.equal(cache.status().entries, 0);
});

test('different Kinozal card IDs keep separate cached detail pages', t => {
  const now = { value: 1000 };
  const cache = temporaryCache(t, now);
  const first = cache.makeKey('/kinozal/details', 'id=12');
  const second = cache.makeKey('/kinozal/details', 'id=13');
  cache.put(first, 'page', Buffer.from('card with related releases'), 60_000);
  assert.equal(cache.get(first).toString(), 'card with related releases');
  assert.equal(cache.get(second), null);
});

test('lowering the limit removes old items and clearing removes only cached data', t => {
  const now = { value: 1000 };
  const cache = temporaryCache(t, now);
  cache.setLimitMb(8);
  const first = cache.makeKey('/kinozal/details', 'id=1');
  const second = cache.makeKey('/kinozal/details', 'id=2');
  cache.put(first, 'page', Buffer.alloc(5 * 1024 * 1024, 1), 60_000);
  now.value = 2000;
  cache.put(second, 'page', Buffer.alloc(5 * 1024 * 1024, 2), 60_000);
  assert.equal(cache.get(first), null);
  assert.equal(cache.get(second).length, 5 * 1024 * 1024);
  assert.equal(cache.status().limitMb, 8);
  cache.clear();
  assert.equal(cache.status().entries, 0);
  assert.equal(new Cache(cache.root).status().limitMb, 8);
});

test('disabled cache stores nothing', t => {
  const now = { value: 1000 };
  const cache = temporaryCache(t, now);
  cache.setLimitMb(0);
  cache.put('key', 'page', Buffer.from('ignored'), 60_000);
  assert.equal(cache.get('key'), null);
  assert.equal(cache.status().usedBytes, 0);
});

test('actor cards share the size limit and survive Kinozal page refresh', t => {
  const cache = temporaryCache(t);
  const page = cache.makeKey('/kinozal/details', 'id=42');
  const person = cache.makeKey('/person', '7');
  const actorCard = Buffer.from(JSON.stringify({ info: { id: 7, name: 'Actor' }, credits: { items: [{ id: 42 }] } }));
  cache.put(page, 'page', Buffer.from('release page'), 60_000);
  cache.put(person, 'person', actorCard, 7 * 24 * 60 * 60 * 1000);
  assert.deepEqual(cache.status().kinds, { page: 1, person: 1 });
  cache.clearKind('page');
  assert.equal(cache.get(page), null);
  assert.equal(cache.get(person).toString(), actorCard.toString());
  assert.deepEqual(cache.status().kinds, { person: 1 });
});
