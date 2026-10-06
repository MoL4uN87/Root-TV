const { test } = require('node:test');
const assert = require('node:assert/strict');
const ime = require('../helper/seena-ime.js');

test('IME requests accept one safe e-mail character and reject arbitrary payloads', () => {
  assert.deepEqual(ime.operationFor('insert', '@'), {
    method: 'insertText', payload: { text: '@', replace: false }
  });
  assert.deepEqual(ime.operationFor('delete'), {
    method: 'deleteCharacters', payload: { count: 1 }
  });
  assert.equal(ime.operationFor('insert', 'ab'), null);
  assert.equal(ime.operationFor('insert', '"'), null);
  assert.equal(ime.operationFor('replace', 'a'), null);
});
