const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../seena-0.3.29/com.seena.webos/model.js');

test('free Match TV broadcasts are ordered live first', () => {
  const response = { result: { broadcasts: [
    { mediaId: 2, title: 'Позже', channel: 'Матч ТВ', startAt: '2026-10-04T15:00:00+07:00', isPaid: false, isLive: false, imageUrl: 'https://img.test/2.jpg' },
    { mediaId: 1, title: 'Сейчас', channel: 'Матч ТВ', startAt: '2026-10-04T13:00:00+07:00', isPaid: false, isLive: true, imageUrl: 'https://img.test/1.jpg' },
    { mediaId: 3, title: 'Платная', channel: 'Матч Премьер', isPaid: true, isLive: true }
  ] } };
  assert.deepEqual(model.matchBroadcastItems(response).map(item => item.id), ['1', '2']);
});

test('only official embedded player and NTV Plus channel URLs are accepted', () => {
  assert.equal(model.matchPlayerUrl({ result: { playerUrl: 'https://video.matchtv.ru/iframe/feed/start/free_token/' } }), 'https://video.matchtv.ru/iframe/feed/start/free_token/');
  assert.equal(model.matchPlayerUrl({ result: { playerUrl: 'https://evil.example/player' } }), '');
  assert.equal(model.inAppTvUrl('https://ntvplus.tv/channel/pervyj-kanal-hd-233'), 'https://ntvplus.tv/channel/pervyj-kanal-hd-233');
  assert.equal(model.inAppTvUrl('https://ntvplus.tv.evil.example/channel/x'), '');
});
