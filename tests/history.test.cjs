const { test } = require('node:test');
const assert = require('node:assert/strict');
const history = require('../seena-0.3.28/com.seena.webos/history.js');

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

test('a watched title moves to the front without creating a duplicate', () => {
  const store = storage();
  history.record(store, { source: 'catalog', id: '12', title: 'First', watchedAt: 100 });
  history.record(store, { source: 'kinozal', id: '34', title: 'Second', watchedAt: 200 });
  history.record(store, { source: 'catalog', id: '12', title: 'First', watchedAt: 300 });
  assert.deepEqual(history.read(store).map(item => [item.source, item.id, item.watchedAt]), [
    ['catalog', '12', 300], ['kinozal', '34', 200]
  ]);
});

test('removing one title keeps the other source and survives a new read', () => {
  const store = storage();
  history.record(store, { source: 'catalog', id: '12', title: 'Catalog', watchedAt: 100 });
  history.record(store, { source: 'kinozal', id: '12', title: 'Kinozal', watchedAt: 200 });
  history.remove(store, 'catalog', '12');
  assert.deepEqual(history.read(store).map(item => item.title), ['Kinozal']);
});

test('a damaged saved history does not break the list', () => {
  const store = storage();
  store.setItem(history.KEY, '{bad json');
  assert.deepEqual(history.read(store), []);
  history.record(store, { source: 'catalog', id: '2', title: 'Restored', watchedAt: 10 });
  assert.deepEqual(history.read(store).map(item => item.title), ['Restored']);
});
