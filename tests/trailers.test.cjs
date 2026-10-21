const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../seena-0.3.32/com.seena.webos/model.js');

test('official YouTube trailer is extracted from movie details, not unrelated videos', () => {
  const detail = { videos: { results: [
    { type: 'Clip', site: 'YouTube', key: '12345678901' },
    { type: 'Trailer', site: 'YouTube', key: 'Abc123XYZ_0', official: true }
  ] } };
  assert.deepEqual(model.trailerSource(detail, {}), {
    mode: 'embed',
    url: 'https://www.youtube.com/embed/Abc123XYZ_0?autoplay=1'
  });
});

test('direct trailer can come from the movie row; only safe media URLs pass', () => {
  assert.deepEqual(
    model.trailerSource(null, { raw: { trailer_url: 'https://media.example.org/trailer.mp4?token=abc' } }),
    { mode: 'direct', url: 'https://media.example.org/trailer.mp4?token=abc' }
  );
  assert.equal(model.trailerSource({ trailer_url: 'http://example.org/t.mp4' }), null);
  assert.equal(model.trailerSource({ trailer_url: 'https://youtube.com.evil.org/watch?v=Abc123XYZ_0' }), null);
  assert.equal(model.trailerSource({ trailer_url: 'javascript:alert(1)' }), null);
  assert.deepEqual(model.trailerSource({ trailer: 'https://youtu.be/Abc123XYZ_0' }), {
    mode: 'embed', url: 'https://www.youtube.com/embed/Abc123XYZ_0?autoplay=1'
  });
});

test('trailer search query includes film year but drops Kinozal quality suffix', () => {
  assert.equal(
    model.trailerSearchQuery({ title: 'Дюна: Часть вторая / WEB-DL 1080p', year: '2024' }),
    'Дюна: Часть вторая 2024 трейлер'
  );
});

test('search prefers official movie trailer and excludes reviews / other films', () => {
  const film = { title: 'Дюна', year: '2024', raw: { original_title: 'Dune' } };
  const hits = [
    { title: 'Чужой (2024) трейлер', preview: 'https://yandex.ru/video/preview/1' },
    { title: 'Дюна обзор фильма 2024', preview: 'https://yandex.ru/video/preview/2' },
    { title: 'Дюна 2024 трейлер', preview: 'https://yandex.ru/video/preview/3' },
    { title: 'Дюна 2024 официальный трейлер', preview: 'https://yandex.ru/video/preview/4' },
    { title: 'Dune 2016 official trailer', preview: 'https://yandex.ru/video/preview/5' }
  ];
  assert.deepEqual(model.trailerSearchResults(hits, film).map(x => x.preview), [
    'https://yandex.ru/video/preview/4',
    'https://yandex.ru/video/preview/3'
  ]);
});

test('ambiguous short film titles require a matching release year', () => {
  const film = { title: 'Оно', year: '2017' };
  const hits = [
    { title: 'Оно трейлер', preview: 'https://yandex.ru/video/preview/1' },
    { title: 'Оно 2017 официальный трейлер', preview: 'https://yandex.ru/video/preview/2' }
  ];
  assert.deepEqual(model.trailerSearchResults(hits, film).map(x => x.preview), [
    'https://yandex.ru/video/preview/2'
  ]);
});
