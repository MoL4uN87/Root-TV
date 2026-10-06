const test = require('node:test');
const assert = require('node:assert/strict');
const video = require('../helper/seena-video-search.js');

test('parses safe Yandex video cards into approved preview links', () => {
  const html = '<a class="VideoSnippet-Thumb" href="/video/preview/12345?from=search"><video poster="//avatars.mds.yandex.net/thumb.jpg"></video></a><a class="Link VideoSnippet-Title" title="Новости дня" href="/video/preview/12345?from=search">Новости дня</a>';
  assert.deepEqual(video.parseResults(html), [{ title: 'Новости дня', preview: 'https://yandex.ru/video/preview/12345?from=search', poster: 'https://avatars.mds.yandex.net/thumb.jpg' }]);
});

test('does not filter search queries by content', () => {
  assert.equal(video.safeQuery('порно'), 'порно');
});

test('extracts the public OK HLS URL from current embed metadata', () => {
  const html = '&quot;ondemandHls&quot;:&quot;https://vd523.okcdn.ru/path/playlist.m3u8?sig=a\\u0026expires=1&quot;';
  assert.equal(video.okHlsUrl(html), 'https://vd523.okcdn.ru/path/playlist.m3u8?sig=a&expires=1');
});

test('uses the highest public VK MP4 when HLS is absent', () => {
  assert.deepEqual(video.vkStream({
    mp4_480: 'https://vkvd333.okcdn.ru/video-480.mp4',
    mp4_1080: 'https://vkvd333.okcdn.ru/video-1080.mp4'
  }), { type: 'video/mp4', url: 'https://vkvd333.okcdn.ru/video-1080.mp4' });
});

test('does not expose Rutube region restriction as a separate block', () => {
  assert.equal(video.rutubeUnavailable(244, JSON.stringify({
    detail: { url: '', languages: [{ title: 'Видео недоступно из-за ограничений в вашей стране' }] }
  })), '');
});
