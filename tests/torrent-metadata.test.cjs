const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../seena-0.3.32/com.seena.webos/model.js');

test('BitRu, Korsars and LostFilm tracker names are visible from original API fields', () => {
  const rows = model.torrentItems({ data: [
    { id: '1', title: 'Movie 1080p', tracker_name: 'bitru', size: 4294967296, seeders: 0, magnet: 'magnet:?xt=urn:btih:abc' },
    { id: '2', title: 'Movie WEB-DL', source: { name: 'Korsars' }, size: '5.7 ГБ', seeds: 43, magnet: 'magnet:?xt=urn:btih:def' },
    { id: '3', title: 'Movie BluRay', site: 'https://lostfilm.tv', torrent_size: '2147483648', seed_count: 128,
      peers: 12, link: 'magnet:?xt=urn:btih:xyz' }
  ] });
  assert.deepEqual(rows.map(r => r.platform), ['BitRu', 'Korsars', 'LostFilm']);
  assert.deepEqual(rows.map(r => r.size), ['4.00 ГБ', '5.7 ГБ', '2.00 ГБ']);
  assert.deepEqual(rows.map(r => r.seeders), [0, 43, 128]);
  assert.equal(rows[2].peers, 12);
  assert.equal(rows[0].link, 'magnet:?xt=urn:btih:abc');
  assert.equal(rows[1].link, 'magnet:?xt=urn:btih:def');
});

test('Unknown torrent tracker or statistics stay unknown, never invented', () => {
  const [row] = model.torrentItems({ torrents: [
    { name: 'No tracker metadata', magnet: 'magnet:?xt=urn:btih:none' }
  ] });
  assert.equal(row.platform, '');
  assert.equal(row.size, '');
  assert.equal(row.seeders, null);
  assert.equal(row.peers, null);
});

test('Nested tracker fields, text count and size fields are normalized', () => {
  const [row] = model.torrentItems({ results: [
    { tracker: { title: 'CustomTracker' }, total_size: 1536,
      seeders_count: '1,234', leechers_count: '6' }
  ] });
  assert.equal(row.platform, 'CustomTracker');
  assert.equal(row.size, '1.50 КБ');
  assert.equal(row.seeders, 1234);
  assert.equal(row.peers, 6);
  assert.equal(model.torrentPlatform({ source: 'torrent' }), '');
  assert.equal(model.torrentSizeLabel('1.5 GB'), '1.5 GB');
});

test('TV torrent card renders explicit tracker, size and seeds, including zero', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'seena-0.3.32',
    'com.seena.webos', 'app.js'), 'utf8');
  assert.match(app, /'Площадка: ' \+ \(torrent\.platform/);
  assert.match(app, /'Размер: ' \+ \(torrent\.size/);
  assert.match(app, /'Сиды: ' \+ \(torrent\.seeders === null/);
  assert.match(app, /renderTorrentRow\(torrent\)/);
  assert.match(app, /\['Кинозал',release\.quality/);
});
