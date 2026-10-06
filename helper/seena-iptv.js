'use strict';
var URL = require('url').URL;
function safeUrl(value, suffix) { try { var u = new URL(String(value || '')); return u.protocol === 'https:' && !u.port && !u.username && !u.password && suffix.test(u.pathname) ? u.href : ''; } catch (_) { return ''; } }
function playlistUrl(value) { return safeUrl(value, /\.(?:m3u|m3u8)$/i); }
function streamUrl(value) { return safeUrl(value, /\.m3u8$/i); }
function attr(line, name) { var m = new RegExp(name + '="([^"]+)"', 'i').exec(line); return m ? m[1] : ''; }
function parsePlaylist(text) { text = String(text || ''); if (text.length > 2 * 1024 * 1024) return { channels: [], error: 'playlist_too_large' }; if (!/^#EXTM3U\s*(?:\r?\n|$)/.test(text)) return { channels: [], error: 'invalid_playlist' }; var lines = text.split(/\r?\n/), channels = []; for (var i=0;i<lines.length-1 && channels.length<500;i++) { if (!/^#EXTINF:/i.test(lines[i])) continue; var url = streamUrl(lines[i+1].trim()); if (!url) continue; var comma = lines[i].lastIndexOf(','); channels.push({ title: (comma >= 0 ? lines[i].slice(comma+1) : 'Канал').trim() || 'Канал', logo: safeUrl(attr(lines[i], 'tvg-logo'), /\.(?:png|jpe?g|webp)$/i), group: attr(lines[i], 'group-title'), url: url }); } return { channels: channels }; }
function isHlsManifest(text) { return /^#EXTM3U\s*(?:\r?\n|$)/.test(String(text || '')) && /#EXT-X-(?:STREAM-INF|TARGETDURATION)/.test(String(text || '')); }
module.exports = { playlistUrl: playlistUrl, streamUrl: streamUrl, parsePlaylist: parsePlaylist, isHlsManifest: isHlsManifest };
