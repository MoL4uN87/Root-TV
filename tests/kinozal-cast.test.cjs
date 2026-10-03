const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../seena-0.3.27/com.seena.webos/model.js');

test('Kinozal release title is reduced to the catalog search title', () => {
  assert.equal(
    model.kinozalSearchTitle('Дьявол носит Prada 2 / The Devil Wears Prada 2 / 2026 / WEB-DLRip'),
    'Дьявол носит Prada 2'
  );
  assert.equal(model.kinozalSearchTitle('Название фильма (2025)'), 'Название фильма');
});

test('catalog match prefers the same title, year and media type', () => {
  const response = { data: [
    { id: 350, title: 'Дьявол носит Prada', release_date: '2006-06-29', media_type: 'movie' },
    { id: 1314481, title: 'Дьявол носит Prada 2', release_date: '2026-04-29', media_type: 'movie' }
  ] };
  const found = model.bestCatalogMatch(response, 'Дьявол носит Prada 2', '2026', 'movie');
  assert.equal(found.id, '1314481');
});

test('catalog match rejects unrelated search results', () => {
  const response = { data: [{ id: 1, title: 'Совсем другой фильм', release_date: '2026-01-01', media_type: 'movie' }] };
  assert.equal(model.bestCatalogMatch(response, 'Нужный фильм', '2026', 'movie'), null);
});
