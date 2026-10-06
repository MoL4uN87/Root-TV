const { test } = require('node:test');
const assert = require('node:assert/strict');
const iptv = require('../helper/seena-iptv.js');
test('validates playlist URLs and parses safe M3U channels', () => {
  assert.equal(iptv.playlistUrl('https://example.test/list.m3u'), 'https://example.test/list.m3u');
  assert.equal(iptv.playlistUrl('https://user:pass@example.test/list.m3u'), '');
  assert.deepEqual(iptv.parsePlaylist('#EXTM3U\n#EXTINF:-1 tvg-logo="https://img.test/a.png",News\nhttps://stream.test/a.m3u8').channels, [{ title: 'News', logo: 'https://img.test/a.png', group: '', url: 'https://stream.test/a.m3u8' }]);
  assert.equal(iptv.parsePlaylist('#NOTM3U').error, 'invalid_playlist');
  assert.equal(iptv.isHlsManifest('#EXTM3U\n#EXT-X-TARGETDURATION:6'), true);
});
