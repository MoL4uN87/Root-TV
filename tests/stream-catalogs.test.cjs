const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../seena-0.3.32/com.seena.webos/model.js');

test('Android four MovieResponse catalogs contribute direct sources instead of Veoveo taking precedence', () => {
  const items = model.directSources({
    stream_lists_veoveo: { movieVoices: [{ name: 'Dub Veoveo', qualityOptions: {
      '1080p': 'https://media.example.test/veoveo.m3u8'
    } }] },
    streamListsHdvb: { movieVoices: [{ name: 'Dub HDVB',
      url: 'https://media.example.test/hdvb.m3u8' }] },
    stream_lists: { movie_voices: [{ name: 'Dub Seena',
      filepath: 'https://media.example.test/seena.mp4' }] },
    streamCatalog: { apiVoices: [{ name: 'Dub Catalog',
      sources: [{ quality: '720p', url: 'https://media.example.test/catalog.mp4' }] }] }
  });
  assert.equal(items.length, 4);
  assert.deepEqual(items.map(x => x.provider).sort(),
    ['Veoveo', 'HDVB', 'Seena', 'Каталог'].sort());
  assert.equal(items.find(x => x.provider === 'Veoveo').quality, '1080p');
  assert.equal(items.find(x => x.provider === 'Каталог').quality, '720p');
});

test('Multiple voice aliases in one catalog and TV episodes are not lost', () => {
  const items = model.directSources({
    streamLists: {
      movieVoices: [],
      apiVoices: [{ name: 'Voice A', url: 'https://media.example.test/a.m3u8' }],
      seasons: [{ seasonNumber: 2, episodes: [{
        episodeNumber: 3, voices: [{ name: 'Voice B',
          qualities: { '720p': 'https://media.example.test/b.m3u8' } }]
      }] }]
    }
  });
  assert.equal(items.length, 2);
  assert.ok(items.some(x => x.season === 2 && x.label.includes('Серия 3')));
  assert.ok(items.some(x => x.quality === '720p' && x.season === 2));
});

test('Repeated catalog payload and unsafe media URLs never inflate Watch list', () => {
  const same = { movieVoices: [{ name: 'Dub',
    url: 'https://media.example.test/m.m3u8' },
    { name: 'Bad', url: 'javascript:alert(1)' }] };
  const items = model.directSources({
    stream_lists: same,
    streamCatalog: same,
    streamListsVeoveo: same
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://media.example.test/m.m3u8');
});
