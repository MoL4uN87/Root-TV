(function (root, factory) {
  var api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.SeenaRatings = api;
}(this, function () {
  var key = 'seena.personal.ratings';
  function read(storage) { try { var value = JSON.parse(storage.getItem(key) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch (_) { return {}; } }
  function get(storage, id) { var value = Number(read(storage)[String(id)]); return value >= 1 && value <= 10 && Math.floor(value) === value ? value : 0; }
  function set(storage, id, value) { value = Number(value); if (!id || value < 1 || value > 10 || Math.floor(value) !== value) return 0; var values = read(storage), current = get(storage, id); if (current === value) delete values[String(id)]; else values[String(id)] = value; storage.setItem(key, JSON.stringify(values)); return current === value ? 0 : value; }
  return { get: get, set: set };
}));
