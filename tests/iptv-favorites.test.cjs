const { test } = require('node:test');
const assert = require('node:assert/strict');
const favorites = require('../seena-0.3.32/com.seena.webos/iptv-favorites.js');
test('favorites move to front and toggle by stream URL', () => {
  const storage = { value: '', getItem() { return this.value; }, setItem(_, value) { this.value = value; } };
  favorites.toggle(storage, { title: 'B', url: 'https://b.test/live.m3u8' });
  assert.equal(favorites.has(storage, 'https://b.test/live.m3u8'), true);
  assert.deepEqual(favorites.order(storage, [{ title: 'A', url: 'https://a.test/live.m3u8' }, { title: 'B', url: 'https://b.test/live.m3u8' }]).map(x => x.title), ['B', 'A']);
  favorites.toggle(storage, { title: 'B', url: 'https://b.test/live.m3u8' });
  assert.equal(favorites.has(storage, 'https://b.test/live.m3u8'), false);
});
