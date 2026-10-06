const { test } = require('node:test');
const assert = require('node:assert/strict');

const playback = require('../helper/seena-sports-playback.js');

test('extracts a validated Match TV media endpoint from iframe markup', () => {
  const html = '<span data-config="config=https://bl.video.matchtv.ru/feed/start/ch_ticket/17_1/hash/999?sr%3D14%26ref%3D"></span>';
  assert.equal(
    playback.mediaUrlFromIframe(html),
    'https://bl.video.matchtv.ru/media/start/ch_ticket/17_1/hash/999?sr=14&ref=https%3A%2F%2Fmatchtv.ru%2F'
  );
  assert.equal(playback.mediaUrlFromIframe('<span data-config="config=https://evil.example/feed/start/x"></span>'), '');
});

test('extracts official HLS and reports a future event precisely', () => {
  const ready = playback.parseMediaXml('<?xml version="1.0"?><redirect><event_name><![CDATA[Прямой эфир]]></event_name><iphone><track><![CDATA[https://m3u8.video.matchtv.ru/media/start/ch_ticket/master.m3u8?sr=14]]></track></iphone></redirect>');
  assert.deepEqual(ready, { status: 'ready', title: 'Прямой эфир', url: 'https://m3u8.video.matchtv.ru/media/start/ch_ticket/master.m3u8?sr=14' });

  const future = playback.parseMediaXml('<?xml version="1.0"?><warning type="not_started"><event start="1791098730"><![CDATA[Дзюдо]]></event></warning>');
  assert.deepEqual(future, { status: 'not_started', startsAt: 1791098730000 });
});

test('rejects an HLS URL outside the official Match TV host', () => {
  assert.deepEqual(
    playback.parseMediaXml('<redirect><iphone><track><![CDATA[https://evil.example/video.m3u8]]></track></iphone></redirect>'),
    { status: 'unavailable' }
  );
});
