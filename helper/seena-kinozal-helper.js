'use strict';
// Node 8 compatible, loopback-only Kinozal transport for Seena.
var http = require('http');
var fs = require('fs');
var path = require('path');
var child = require('child_process');
var URL = require('url').URL;

var root = process.env.SEENA_HELPER_ROOT || __dirname;
var curl = process.env.SEENA_CURL || path.join(root, 'curl-impersonate-a55');
var cookieFile = process.env.SEENA_COOKIE_FILE || path.join(root, 'cookies.json');
var libPath = process.env.SEENA_LIB_PATH || path.join(root, 'armhf-runtime') + ':' + root;
var port = Number(process.env.SEENA_HELPER_PORT || 8787);
var ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 YaBrowser/26.8.0.0 Safari/537.36';

function json(res, status, object) {
  var body = Buffer.from(JSON.stringify(object), 'utf8');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length,
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' });
  res.end(body);
}

function cookieHeader() {
  var data = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
  var names = ['uid', 'pass', 'cf_clearance'];
  if (!names.every(function (name) { return typeof data[name] === 'string' && data[name]; })) throw new Error('cookies_missing');
  var value = names.map(function (name) { return name + '=' + data[name]; }).join('; ');
  if (/[\r\n"]/.test(value)) throw new Error('cookies_invalid');
  return value;
}

function upstream(route, params) {
  var target;
  if (route === '/kinozal/top') target = new URL('https://kinozal.guru/top.php');
  else if (route === '/kinozal/search') target = new URL('https://kinozal.guru/browse.php');
  else if (route === '/kinozal/details') target = new URL('https://kinozal.guru/details.php');
  else if (route === '/kinozal/torrent') target = new URL('https://kinozal.guru/download.php');
  else if (route === '/kinozal/image') {
    try { target = new URL(params.get('url') || ''); }
    catch (_) { return false; }
    if (target.protocol !== 'https:' || !/(^|\.)kinozal\.guru$/i.test(target.hostname)) return false;
    return target.href;
  }
  else return null;
  var allowed = route === '/kinozal/top' ? ['t','d','f','c','k','j','s','w','page'] :
    route === '/kinozal/search' ? ['s','g','c','v','d','w','t','f','page'] : ['id'];
  allowed.forEach(function (key) {
    if (params.has(key)) target.searchParams.set(key, params.get(key));
  });
  if ((route === '/kinozal/details' || route === '/kinozal/torrent') && !/^\d{1,12}$/.test(params.get('id') || '')) return false;
  return target.href;
}

function imageType(body) {
  if (body.length > 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'image/jpeg';
  if (body.length > 8 && body.slice(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (body.length > 12 && body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (body.length > 6 && body.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  return '';
}

function fetchOnce(url, cookie, callback) {
  var config = 'header = "Cookie: ' + cookie.replace(/\\/g, '\\\\') + '"\nuser-agent = "' + ua + '"\n';
  var args = ['--config', '-', '--impersonate', 'chrome150', '--ech', 'false', '--ipv4',
    '--compressed', '--connect-timeout', '10', '--max-time', '30', '--silent', '--show-error',
    '--output', '-', '--write-out', '%{stderr}\nSEENA_STATUS:%{http_code}:%{http_version}\n', url];
  var env = Object.assign({}, process.env, { LD_LIBRARY_PATH: libPath });
  var proc = child.spawn(curl, args, { env: env, stdio: ['pipe', 'pipe', 'pipe'] });
  var chunks = [], size = 0, errorText = '', finished = false;
  function finish(error, result) { if (!finished) { finished = true; callback(error, result); } }
  proc.stdout.on('data', function (chunk) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) { proc.kill(); finish(new Error('response_too_large')); }
    else chunks.push(chunk);
  });
  proc.stderr.on('data', function (chunk) { errorText += chunk.toString('utf8').slice(0, 2048); });
  proc.on('error', function () { finish(new Error('curl_unavailable')); });
  proc.on('close', function (code) {
    var match = /SEENA_STATUS:(\d{3}):([^\s]+)/.exec(errorText);
    if (!match || code !== 0) return finish(new Error('upstream_connection'));
    finish(null, { status: Number(match[1]), version: match[2], body: Buffer.concat(chunks) });
  });
  proc.stdin.end(config);
}

function fetchWithRetry(url, cookie, attempt, callback) {
  fetchOnce(url, cookie, function (error, result) {
    if (!error && result.status === 403 && attempt < 3) {
      return setTimeout(function () { fetchWithRetry(url, cookie, attempt + 1, callback); }, 300 * attempt);
    }
    callback(error, result);
  });
}

function connectionError() {
  var status = child.spawnSync('/var/lib/webosbrew/lgvpn/lgvpn-status', [], { encoding: 'utf8', timeout: 2000 });
  if (!status.error && /^DISCONNECTED\b/.test(status.stdout || ''))
    return { error: 'vpn_disconnected', message: 'LGVPN отключён. Включите VPN на телевизоре.' };
  return { error: 'upstream_connection', message: 'Не удалось подключиться к Kinozal.' };
}

http.createServer(function (req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  var request;
  try { request = new URL(req.url, 'http://127.0.0.1:' + port); }
  catch (_) { return json(res, 400, { error: 'invalid_url' }); }
  if (request.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (request.pathname === '/kinozal/cookies/status') {
    try { cookieHeader(); return json(res, 200, { present: true }); }
    catch (_) { return json(res, 200, { present: false }); }
  }
  var target = upstream(request.pathname, request.searchParams);
  if (target === null) return json(res, 404, { error: 'not_found' });
  if (target === false) return json(res, 400, { error: 'invalid_request' });
  var cookie;
  try { cookie = cookieHeader(); }
  catch (_) { return json(res, 503, { error: 'cookies_missing', message: 'Обновите cookies Kinozal на TV.' }); }
  fetchWithRetry(target, cookie, 1, function (error, result) {
    if (error) return json(res, 502, error.message === 'upstream_connection' ? connectionError() :
      { error: error.message, message: 'Не удалось подключиться к Kinozal.' });
    if (result.status === 403) return json(res, 503, { error: 'cloudflare_challenge', message: 'Cloudflare требует обновить сессию Kinozal.' });
    if (result.status !== 200) return json(res, 502, { error: 'upstream_http', status: result.status });
    var prefix = result.body.slice(0, 8192).toString('latin1');
    if (/cf-chl-|cf-mitigated/i.test(prefix)) return json(res, 503, { error: 'cloudflare_challenge', message: 'Cloudflare требует обновить сессию Kinozal.' });
    if (/takelogin\.php/i.test(prefix)) return json(res, 503, { error: 'kinozal_login_required', message: 'Kinozal требует обновить авторизацию.' });
    var torrent = request.pathname === '/kinozal/torrent';
    var image = request.pathname === '/kinozal/image';
    if (torrent && (result.body[0] !== 0x64 || result.body.indexOf(Buffer.from('4:info')) < 0))
      return json(res, 502, { error: 'invalid_torrent_response', message: 'Kinozal не вернул .torrent.' });
    var mime = image ? imageType(result.body) : '';
    if (image && !mime) return json(res, 502, { error: 'invalid_image_response' });
    res.writeHead(200, { 'Content-Type': torrent ? 'application/x-bittorrent' : image ? mime : 'text/html; charset=windows-1251',
      'Content-Length': result.body.length, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(result.body);
  });
}).listen(port, '127.0.0.1', function () { console.log('Seena Kinozal helper listening on 127.0.0.1:' + port); });
