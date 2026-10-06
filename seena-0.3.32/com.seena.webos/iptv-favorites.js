(function (root, factory) { var api = factory(); if (typeof module === 'object') module.exports = api; else root.SeenaIptvFavorites = api; }(this, function () {
  var key = 'seena.iptv.favorites';
  function read(storage) { try { var value = JSON.parse(storage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch (_) { return []; } }
  function has(storage, url) { return read(storage).some(function (item) { return item.url === url; }); }
  function toggle(storage, item) { var list = read(storage), index = list.map(function (x) { return x.url; }).indexOf(item.url); if (index >= 0) list.splice(index, 1); else list.unshift({ title: item.title, group: item.group || '', url: item.url, logo: item.logo || '' }); storage.setItem(key, JSON.stringify(list)); return index < 0; }
  function order(storage, items) { var list = read(storage), ranks = {}; list.forEach(function (item, index) { ranks[item.url] = index; }); return items.slice().sort(function (a, b) { var aRank = Object.prototype.hasOwnProperty.call(ranks, a.url) ? ranks[a.url] : Number.MAX_SAFE_INTEGER; var bRank = Object.prototype.hasOwnProperty.call(ranks, b.url) ? ranks[b.url] : Number.MAX_SAFE_INTEGER; return aRank - bRank; }); }
  return { has: has, toggle: toggle, order: order };
}));
