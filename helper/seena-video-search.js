'use strict';
var URL = require('url').URL;

function adultText(value) {
  return false;
}



function safeQuery(value) {
  var query = String(value || '').replace(/\s+/g, ' ').trim();
  return query && query.length <= 120 && !adultText(query) ? query : '';
}
function decode(value) { return String(value || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
function okHlsUrl(value) {
  var match = /"ondemandHls"\s*:\s*"([^"]+)"/.exec(decode(value));
  return match ? match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/') : '';
}
function vkStream(files) {
  var source = files || {};
  var hls = source.hls || source.hls_fmp4;
  if (typeof hls === 'string' && hls) return { type: 'application/vnd.apple.mpegurl', url: hls };
  var keys = ['mp4_1080', 'mp4_720', 'mp4_480', 'mp4_360', 'mp4_240', 'mp4_144'];
  for (var i = 0; i < keys.length; i += 1) {
    if (typeof source[keys[i]] === 'string' && source[keys[i]]) return { type: 'video/mp4', url: source[keys[i]] };
  }
  return null;
}
function rutubeUnavailable(status, body) {
  try {
    var parsed = JSON.parse(String(body || ''));
    var detail = parsed && parsed.detail ? parsed.detail : {};
    var title =
      detail.languages &&
      detail.languages[0] &&
      detail.languages[0].title
        ? String(detail.languages[0].title)
        : '';

    if (
      detail.type === 'blocking_rule' &&
      !detail.url &&
      !detail.access_url
    ) {
      return 'rutube_region_restricted';
    }
  } catch (_) {}

  return '';
}
function attribute(tag, name) { var match = new RegExp('\\b' + name + '="([^"]*)"', 'i').exec(tag); return match ? decode(match[1]) : ''; }
function previewUrl(value) {
  try { var parsed = new URL(String(value || ''), 'https://yandex.ru'); return parsed.protocol === 'https:' && parsed.hostname === 'yandex.ru' && /^\/video\/preview\/\d+/.test(parsed.pathname) ? parsed.href : ''; } catch (_) { return ''; }
}
function posterUrl(value) {
  try {
    var parsed = new URL(String(value || ''), 'https://yandex.ru');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
    var host = String(parsed.hostname || '').toLowerCase();
    if (!/(?:^|\.)yandex\.net$/i.test(host) && !/(?:^|\.)yandex\.ru$/i.test(host)) return '';
    return parsed.href;
  } catch (_) { return ''; }
}

function firstPoster(block) {
  var tags = String(block || '').match(/<(?:video|img)\b[^>]*>/ig) || [];
  for (var i = 0; i < tags.length; i += 1) {
    var value =
      attribute(tags[i], 'poster') ||
      attribute(tags[i], 'src') ||
      attribute(tags[i], 'data-src') ||
      attribute(tags[i], 'data-lazy-src');

    var poster = posterUrl(value);
    if (poster) return poster;
  }
  return '';
}
function parseResults(html) {
  var source = String(html || ''), starts = source.split(/(?=<a\b[^>]*VideoSnippet-Thumb)/i), out = [];
  starts.forEach(function (block) {
    if (out.length >= 40 || !/VideoSnippet-Thumb/i.test(block)) return;
    var thumb = /<a\b([^>]*VideoSnippet-Thumb[^>]*)>/i.exec(block), titleTag = /<a\b([^>]*VideoSnippet-Title[^>]*)>/i.exec(block);
    var preview = thumb && previewUrl(attribute(thumb[1], 'href')), title = titleTag && attribute(titleTag[1], 'title'), poster = firstPoster(block);
    if (!preview || !title || adultText(title) || out.some(function (item) { return item.preview === preview; })) return;
    out.push({ title: title.slice(0, 220), preview: preview, poster: poster || '' });
  });
  return out;
}
module.exports = { safeQuery: safeQuery, parseResults: parseResults, okHlsUrl: okHlsUrl, vkStream: vkStream, rutubeUnavailable: rutubeUnavailable };






