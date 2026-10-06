'use strict';

var HOUR = 60 * 60 * 1000;
var DAY = 24 * HOUR;
var TTL = {
  '/kinozal/top': 15 * 60 * 1000,
  '/kinozal/search': DAY,
  '/kinozal/details': 7 * DAY,
  '/kinozal/torrent': 7 * DAY
};

function ttl(route) { return TTL[route] || 0; }

module.exports = { ttl: ttl };
