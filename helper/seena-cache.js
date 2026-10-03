'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var LIMITS = [0, 4, 8, 16];

function SeenaCache(root, options) {
  this.root = root;
  this.dir = path.join(root, 'cache');
  this.settingsFile = path.join(root, 'cache-settings.json');
  this.now = options && options.now || Date.now;
  this.limitMb = 8;
  try {
    var saved = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
    if (LIMITS.indexOf(saved.limitMb) !== -1) this.limitMb = saved.limitMb;
  } catch (_) {}
  this._ensureDir();
}

SeenaCache.prototype._ensureDir = function () {
  if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, 0o700);
  fs.chmodSync(this.dir, 0o700);
};

SeenaCache.prototype.makeKey = function (route, query) {
  return route + '\n' + String(query || '');
};

SeenaCache.prototype._file = function (key) {
  return path.join(this.dir, crypto.createHash('sha256').update(key).digest('hex') + '.bin');
};

SeenaCache.prototype._header = function (file) {
  var fd, buffer = Buffer.alloc(512);
  try {
    fd = fs.openSync(file, 'r');
    var length = fs.readSync(fd, buffer, 0, buffer.length, 0);
    var end = buffer.indexOf(10);
    if (end < 0 || end >= length) return null;
    var header = JSON.parse(buffer.slice(0, end).toString('utf8'));
    return Number.isFinite(header.expiresAt) && typeof header.kind === 'string' ? header : null;
  } catch (_) { return null; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
};

SeenaCache.prototype._scan = function () {
  var self = this, entries = [];
  fs.readdirSync(this.dir).forEach(function (name) {
    if (!/^[a-f0-9]{64}\.bin$/.test(name)) return;
    var file = path.join(self.dir, name);
    try {
      var stat = fs.lstatSync(file), header = stat.isFile() ? self._header(file) : null;
      if (!header || header.expiresAt <= self.now()) { if (stat.isFile()) fs.unlinkSync(file); return; }
      entries.push({ file: file, bytes: stat.size, accessedAt: stat.mtime.getTime(), kind: header.kind });
    } catch (_) {}
  });
  return entries;
};

SeenaCache.prototype._trim = function () {
  var entries = this._scan(), total = entries.reduce(function (sum, entry) { return sum + entry.bytes; }, 0);
  var limit = this.limitMb * 1024 * 1024;
  entries.sort(function (a, b) { return a.accessedAt - b.accessedAt; });
  while (total > limit && entries.length) {
    var oldest = entries.shift();
    fs.unlinkSync(oldest.file);
    total -= oldest.bytes;
  }
};

SeenaCache.prototype.get = function (key) {
  if (!this.limitMb) return null;
  var file = this._file(key), header = this._header(file);
  if (!header) return null;
  if (header.expiresAt <= this.now()) { try { fs.unlinkSync(file); } catch (_) {} return null; }
  try {
    var data = fs.readFileSync(file), end = data.indexOf(10);
    if (end < 0) return null;
    var time = new Date(this.now());
    try { fs.utimesSync(file, time, time); } catch (_) {}
    return data.slice(end + 1);
  } catch (_) { return null; }
};

SeenaCache.prototype.put = function (key, kind, body, ttlMs) {
  if (!this.limitMb || !Buffer.isBuffer(body) || !body.length || ttlMs <= 0) return;
  var header = Buffer.from(JSON.stringify({ kind: kind, expiresAt: this.now() + ttlMs }) + '\n');
  var data = Buffer.concat([header, body]);
  if (data.length > this.limitMb * 1024 * 1024) return;
  var file = this._file(key), temp = file + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(temp, data, { mode: 0o600 });
    fs.chmodSync(temp, 0o600);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.renameSync(temp, file);
    var time = new Date(this.now());
    fs.utimesSync(file, time, time);
    this._trim();
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
};

SeenaCache.prototype.status = function () {
  var entries = this._scan(), kinds = {};
  entries.forEach(function (entry) { kinds[entry.kind] = (kinds[entry.kind] || 0) + 1; });
  return { limitMb: this.limitMb, entries: entries.length,
    usedBytes: entries.reduce(function (sum, entry) { return sum + entry.bytes; }, 0), kinds: kinds };
};

SeenaCache.prototype.setLimitMb = function (value) {
  if (LIMITS.indexOf(value) === -1) throw new Error('invalid_cache_limit');
  var temp = this.settingsFile + '.new';
  try {
    fs.writeFileSync(temp, JSON.stringify({ limitMb: value }), { mode: 0o600 });
    fs.chmodSync(temp, 0o600);
    if (fs.existsSync(this.settingsFile)) fs.unlinkSync(this.settingsFile);
    fs.renameSync(temp, this.settingsFile);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  this.limitMb = value;
  this._trim();
  return this.status();
};

SeenaCache.prototype.clear = function () {
  var self = this;
  fs.readdirSync(this.dir).forEach(function (name) {
    if (!/^[a-f0-9]{64}\.bin$/.test(name)) return;
    var file = path.join(self.dir, name);
    if (fs.lstatSync(file).isFile()) fs.unlinkSync(file);
  });
  return this.status();
};

SeenaCache.prototype.clearKind = function (kind) {
  this._scan().forEach(function (entry) {
    if (entry.kind === kind) fs.unlinkSync(entry.file);
  });
  return this.status();
};

module.exports = SeenaCache;
