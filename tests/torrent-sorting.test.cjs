const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../seena-0.3.32/com.seena.webos/model.js');
const root = path.join(__dirname, '..', 'seena-0.3.32', 'com.seena.webos');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

test('seeds descending, zero preserved, and unknown always last; original remains unmodified', () => {
  const items = [
    { id: 'unknown', seeders: null, quality: '2160p' },
    { id: 'zero', seeders: 0, quality: '720p' },
    { id: 'thirty', seeders: 30, quality: '1080p' },
    { id: 'fifteen', seeders: '15', quality: 'WEB-DL' }
  ];
  assert.deepEqual(model.sortTorrentItems(items, 'seeds').map(x => x.id),
    ['thirty', 'fifteen', 'zero', 'unknown']);
  assert.deepEqual(items.map(x => x.id),
    ['unknown', 'zero', 'thirty', 'fifteen']);
  assert.equal(model.sortTorrentItems(items, 'invalid')[0].id, 'thirty');
});

test('video resolution wins; Remux outranks BluRay and WEB-DL within one resolution', () => {
  const items = [
    { id: '720', quality: '720p', seeders: 100 },
    { id: 'web', quality: '1080p WEB-DL', seeders: 50 },
    { id: 'bluray', quality: '1080p BluRay', seeders: 15 },
    { id: 'remux', quality: '1080p BDRemux', seeders: 1 },
    { id: '4k', quality: '2160p', seeders: 0 }
  ];
  assert.deepEqual(model.sortTorrentItems(items, 'quality').map(x => x.id),
    ['4k', 'remux', 'bluray', 'web', '720']);
});

test('Seena voice sorting is Russian alphabetical; missing voice goes last', () => {
  const items = [
    { id: 'empty', voice: '', seeders: 100 },
    { id: 'two', voice: 'Профессиональный', seeders: 20 },
    { id: 'one', voice: 'Дубляж', seeders: 10 }
  ];
  assert.deepEqual(model.sortTorrentItems(items, 'voice').map(x => x.id),
    ['one', 'two', 'empty']);
});

test('Kinozal seeds, quality and voice are supported without inventing unknown dubbing', () => {
  const items = [
    { id: 'z', title: 'Фильм / 720p Многоголосый', format: '720p', seeds: 90 },
    { id: 'a', title: 'Фильм / 2160p Дубляж', format: '4K', seeds: 10 },
    { id: 'b', title: 'Фильм / 1080p', format: '1080p', seeds: 15 }
  ];
  assert.deepEqual(model.sortTorrentItems(items, 'seeds').map(x => x.id), ['z', 'b', 'a']);
  assert.deepEqual(model.sortTorrentItems(items, 'quality').map(x => x.id), ['a', 'b', 'z']);
  assert.deepEqual(model.sortTorrentItems(items, 'voice').map(x => x.id), ['a', 'z', 'b']);
  assert.equal(model.torrentVoiceLabel(items[2]), '');
});

test('TV sorting buttons exist in both sections and update cached lists', () => {
  assert.equal((html.match(/class="torrent-sort-option focusable/g) || []).length, 6);
  assert.match(html, /id="kinozal-torrent-sortbar"/);
  assert.match(html, /data-torrent-sort="voice"/);
  assert.match(app, /function renderTorrentRows\(\)/);
  assert.match(app, /model\.sortTorrentItems\(state\.torrentRows, state\.torrentSort\)/);
  assert.match(app, /model\.sortTorrentItems\(state\.kzDetail\.variants, state\.kinozalTorrentSort\)/);
  assert.match(app, /aria-pressed/);
  assert.match(styles, /\.torrent-sort-option:focus/);
});
