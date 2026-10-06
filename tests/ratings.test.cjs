const test = require('node:test');
const assert = require('node:assert/strict');
const ratings = require('../seena-0.3.32/com.seena.webos/ratings.js');

function storage() {
  return { value: '', getItem() { return this.value; }, setItem(_, value) { this.value = value; } };
}

test('personal rating is saved, changed and removed for one title', () => {
  const local = storage();
  ratings.set(local, 'movie-42', 8);
  assert.equal(ratings.get(local, 'movie-42'), 8);
  ratings.set(local, 'movie-42', 10);
  assert.equal(ratings.get(local, 'movie-42'), 10);
  ratings.set(local, 'movie-42', 10);
  assert.equal(ratings.get(local, 'movie-42'), 0);
});

test('invalid personal ratings are not stored', () => {
  const local = storage();
  ratings.set(local, 'movie-42', 11);
  assert.equal(ratings.get(local, 'movie-42'), 0);
});
