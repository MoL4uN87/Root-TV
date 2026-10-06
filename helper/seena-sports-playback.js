'use strict';

var URL = require('url').URL;

function decodeAttribute(value) {
  var decoded = String(value || '').replace(/&amp;/g, '&').replace(/&#38;/g, '&');
  try { decoded = decodeURIComponent(decoded); }
  catch (_) { return ''; }
  return decoded;
}

function approved(url, hostname, pathPattern) {
  try {
    var parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'https:' || parsed.hostname !== hostname || parsed.port || parsed.username || parsed.password || !pathPattern.test(parsed.pathname)) return '';
    return parsed.href;
  } catch (_) { return ''; }
}

function mediaUrlFromIframe(html) {
  var match = /data-config=["']config=([^"']+)["']/i.exec(String(html || ''));
  if (!match) return '';
  var config = decodeAttribute(match[1]);
  var parsed;
  try { parsed = new URL(config); }
  catch (_) { return ''; }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'bl.video.matchtv.ru' || !/^\/feed\/start\//.test(parsed.pathname)) return '';
  parsed.pathname = parsed.pathname.replace(/^\/feed\/start\//, '/media/start/');
  parsed.searchParams.set('ref', 'https://matchtv.ru/');
  return parsed.href;
}

function cdata(xml, tag) {
  var match = new RegExp('<' + tag + '(?:\\s[^>]*)?>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</' + tag + '>', 'i').exec(xml);
  return match ? match[1].trim() : '';
}

function parseMediaXml(value) {
  var xml = String(value || '');
  var warning = /<warning\s+[^>]*type=["']([^"']+)["']/i.exec(xml);
  if (warning) {
    if (warning[1] === 'not_started') {
      var event = /<event\s+[^>]*start=["'](\d+)["']/i.exec(xml);
      return { status: 'not_started', startsAt: event ? Number(event[1]) * 1000 : 0 };
    }
    return { status: 'unavailable', reason: warning[1] };
  }
  var track = cdata(xml, 'track');
  var url = approved(track, 'm3u8.video.matchtv.ru', /^\/media\/(?:start|playlist)\/.*\.m3u8$/);
  if (!url) return { status: 'unavailable' };
  return { status: 'ready', title: cdata(xml, 'event_name') || 'Матч ТВ', url: url };
}

module.exports = {
  mediaUrlFromIframe: mediaUrlFromIframe,
  parseMediaXml: parseMediaXml
};
