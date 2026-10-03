const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../seena-0.3.28/com.seena.webos/model.js');

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

test('Kinozal title keeps Russian and original titles as separate catalog queries', () => {
  assert.deepEqual(
    model.kinozalSearchQueries('Холод / Cold / 2025 / WEB-DL 1080p'),
    ['Холод', 'Cold']
  );
  assert.deepEqual(
    model.kinozalSearchQueries('Холод (сериал 2025 – ...)'),
    ['Холод']
  );
});

test('Kinozal cast text yields clean unique person names', () => {
  assert.deepEqual(
    model.kinozalActorNames('Мария Иванова (Анна), Иван Петров, Мария Иванова, Алексей Смирнов и Ольга Белова'),
    ['Мария Иванова', 'Иван Петров', 'Алексей Смирнов', 'Ольга Белова']
  );
});

test('catalog matching tries the original title when the Russian title has no match', () => {
  const response = { data: [
    { id: 10, title: 'Совсем другое', release_date: '2025-01-01', media_type: 'tv' },
    { id: 11, title: 'Cold', release_date: '2025-02-01', media_type: 'tv' }
  ] };
  const found = model.bestCatalogMatchAny(response, ['Холод', 'Cold'], '2025', 'tv');
  assert.equal(found.id, '11');
});

test('horizontal menu navigation stays in DOM order', () => {
  assert.equal(model.horizontalNavigationIndex(3, 'right', 8), 4);
  assert.equal(model.horizontalNavigationIndex(3, 'left', 8), 2);
  assert.equal(model.horizontalNavigationIndex(7, 'right', 8), 7);
  assert.equal(model.horizontalNavigationIndex(0, 'left', 8), 0);
});

test('cast names select the right title when several catalog entries share a name', () => {
  const details = [
    { id: 1, title: 'Холод', cast: [{ name: 'Другой Актёр' }] },
    { id: 2, title: 'Холод', cast: [{ name: 'Любовь Аксёнова' }, { name: 'Пётр Фёдоров' }] }
  ];
  assert.equal(
    model.bestDetailByCast(details, ['Любовь Аксeнова', 'Петр Федоров']).id,
    2
  );
});
