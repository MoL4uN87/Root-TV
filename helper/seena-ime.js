'use strict';

function operationFor(action, text) {
  if (action === 'delete') return { method: 'deleteCharacters', payload: { count: 1 } };
  if (action !== 'insert' || typeof text !== 'string' || !/^[A-Za-z0-9@._+\-]$/.test(text)) return null;
  return { method: 'insertText', payload: { text: text, replace: false } };
}

module.exports = { operationFor: operationFor };
