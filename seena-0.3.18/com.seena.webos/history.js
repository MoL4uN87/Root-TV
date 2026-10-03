(function (root) {
  'use strict';
  var KEY = 'seena.webos.history.v1';
  function normalize(item) {
    if (!item || (item.source !== 'catalog' && item.source !== 'kinozal') ||
        !item.id || !item.title || !Number.isFinite(Number(item.watchedAt))) return null;
    return {
      source: item.source, id: String(item.id), title: String(item.title),
      fullTitle: String(item.fullTitle || ''), poster: String(item.poster || ''),
      year: String(item.year || ''), mediaType: item.mediaType === 'tv' ? 'tv' : 'movie',
      format: String(item.format || ''), overview: String(item.overview || ''),
      watchedAt: Number(item.watchedAt)
    };
  }
  function read(storage) {
    try {
      var items = JSON.parse(storage.getItem(KEY) || '[]');
      if (!Array.isArray(items)) return [];
      return items.map(normalize).filter(Boolean).sort(function (a, b) { return b.watchedAt - a.watchedAt; }).slice(0, 100);
    } catch (_) { return []; }
  }
  function record(storage, item) {
    var entry = normalize(item);
    if (!entry) return read(storage);
    var items = read(storage).filter(function (old) { return old.source !== entry.source || old.id !== entry.id; });
    items.unshift(entry);
    items.sort(function (a, b) { return b.watchedAt - a.watchedAt; });
    items = items.slice(0, 100);
    storage.setItem(KEY, JSON.stringify(items));
    return items;
  }
  function remove(storage, source, id) {
    var items = read(storage).filter(function (item) { return item.source !== source || item.id !== String(id); });
    storage.setItem(KEY, JSON.stringify(items));
    return items;
  }
  var api = {
    KEY: KEY, read: read, record: record, remove: remove
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SeenaHistory = api;
}(typeof window !== 'undefined' ? window : globalThis));
