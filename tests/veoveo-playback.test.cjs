const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../seena-0.3.32/com.seena.webos/model.js');
const app = fs.readFileSync(path.join(__dirname, '..',
  'seena-0.3.32/com.seena.webos/app.js'), 'utf8');

test('Veoveo catalog creates an on-demand film source using catalog contentId', () => {
  const rows = model.directSources({ streamListsVeoveo: {
    contentId: 999001, movieVoices: [{ label: 'Дубляж' },
      { label: 'Многоголосый', sourceRaw: 'veoveo', veoContentId: 999002 }] }
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(x => x.playbackKey),
    ['veo:999001:0:0', 'veo:999002:0:0']);
  assert.ok(rows.every(x => x.provider === 'Veoveo' && x.url === ''));
});

test('Veoveo seasons and episodes preserve distinct playback keys and labels', () => {
  const rows = model.directSources({ stream_lists_veoveo: {
    content_id: 777, seasons: [
      { seasonNumber: 2, episodes: [
        { episodeNumber: 1, voices: [{ label: 'Перевод' }] },
        { episodeNumber: 2, voices: [{ label: 'Перевод' }] }
      ] }
    ]
  } });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(x => x.playbackKey),
    ['veo:777:2:1', 'veo:777:2:2']);
  assert.ok(rows.every(x => x.season === 2 && /Серия [12]/.test(x.label)));
});

test('only Veoveo identities are resolved; CDN/HDVB are not misclassified', () => {
  const rows = model.directSources({
    streamCatalog: { movieVoices: [
      { label: 'CDN', vkId: 'abc', source: 'cdn', contentId: 77 },
      { label: 'HDVB', sourceRaw: 'hdvb', iframe: 'https://example.test/a', contentId: 88 },
      { label: 'Veoveo', sourceRaw: 'veoveo', contentId: 99 },
      { label: 'Broken', sourceRaw: 'veoveo', contentId: -1 },
      { label: 'Empty', sourceRaw: 'veoveo', contentId: 0 }
    ] }
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].playbackKey, 'veo:99:0:0');
});

test('Android Veoveo endpoint uses content-id and includes positive season/episode only', () => {
  assert.equal(model.veoveoStreamUrl('veo:123:0:0'),
    'https://spider01.com/api/veoveo/stream?content-id=123');
  assert.equal(model.veoveoStreamUrl('veo:123:3:5'),
    'https://spider01.com/api/veoveo/stream?content-id=123&season=3&episode=5');
  for (const key of ['veo:0:1:2', 'veo:-1:1:2', 'veo:5:-1:2', 'veo:5:5:10000',
    'https://evil.test/', 'hdvb|1|1|x|https://a.test', 'veo:5:0:0&evil=true'])
    assert.equal(model.veoveoStreamUrl(key), '', key);
});

test('Android m3u8 precedence and filepath fallback; untrusted URLs are rejected', () => {
  assert.deepEqual(model.veoveoResolvedMedia({
    m3u8: ' https://cdn.example.test/hls/master.m3u8 ',
    filepath: 'https://cdn.example.test/fallback.mp4'
  }), {
    url: 'https://cdn.example.test/hls/master.m3u8',
    type: 'application/vnd.apple.mpegurl'
  });
  assert.deepEqual(model.veoveoResolvedMedia({ filepath: 'https://cdn.example.test/a.mp4' }),
    { url: 'https://cdn.example.test/a.mp4', type: 'video/mp4' });
  for (const body of [null, '', { m3u8: '' }, { m3u8: 'javascript:alert(1)' },
    { filepath: 'file:///etc/passwd' }, { m3u8: 'https://user:pw@host.test/a.m3u8' }])
    assert.equal(model.veoveoResolvedMedia(body), null);
});

test('Root-TV resolves Veoveo on selection and handles unavailable streams without opening video', () => {
  assert.match(app, /async function playOnlineSource\(source, button\)/);
  assert.match(app, /model\.veoveoStreamUrl\(source\.playbackKey\)/);
  assert.match(app, /model\.veoveoResolvedMedia\(response\)/);
  assert.match(app, /source\.playbackKey \? 'Ссылка по запросу' : format/);
  assert.match(app, /state\.detailItem !== item/);
  assert.match(app, /playSource\(Object\.assign\(\{\}, source, media, \{ trigger: button \}\)\)/);
});
