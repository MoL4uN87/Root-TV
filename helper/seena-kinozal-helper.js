'use strict';
// Node 8 compatible, loopback-only Kinozal transport for Seena.
var http = require('http');
var fs = require('fs');
var path = require('path');
var child = require('child_process');
var URL = require('url').URL;
var SeenaCache = require('./seena-cache');

var root = process.env.SEENA_HELPER_ROOT || __dirname;
var curl = process.env.SEENA_CURL || path.join(root, 'curl-impersonate-a55');
var cookieFile = process.env.SEENA_COOKIE_FILE || path.join(root, 'cookies.json');
var accountFile = process.env.SEENA_ACCOUNT_FILE || path.join(root, 'account.json');
var libPath = process.env.SEENA_LIB_PATH || path.join(root, 'armhf-runtime') + ':' + root;
var port = Number(process.env.SEENA_HELPER_PORT || 8787);
var ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 YaBrowser/26.8.0.0 Safari/537.36';
var hosts = ['https://kinozal.guru', 'https://kinozal.jumpingcrab.com'];
var activeHost = hosts[1];
var lastAutoLoginAt = 0;
var rateLimitedUntil = {};
var cache = new SeenaCache(root);
var cacheGeneration = 0;
var cacheTtl = { '/kinozal/top': 10 * 60 * 1000, '/kinozal/search': 10 * 60 * 1000,
  '/kinozal/details': 60 * 60 * 1000 };
var personCacheTtl = 7 * 24 * 60 * 60 * 1000;

function clearKinozalPages() { cacheGeneration += 1; return cache.clearKind('page'); }
function clearAllCache() { cacheGeneration += 1; return cache.clear(); }
function cacheKey(route, params) {
  if (!cacheTtl[route]) return null;
  return cache.makeKey(route, params.toString());
}
function loginBody(body) {
  var title = body.slice(0, 8192).toString('latin1');
  return /<title>\s*(?:\xC2\xF5\xEE\xE4|Вход|Login)\s*::/i.test(title);
}

function json(res, status, object) {
  var body = Buffer.from(JSON.stringify(object), 'utf8');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length,
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' });
  res.end(body);
}

function cookieHeader(host, route) {
  if (host === hosts[1] && route !== '/kinozal/torrent') return '';
  var data = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
  var names = host === hosts[0] ? ['uid', 'pass', 'cf_clearance'] : ['uid', 'pass'];
  if (!names.every(function (name) { return typeof data[name] === 'string' && data[name]; })) throw new Error('cookies_missing');
  var value = names.map(function (name) { return name + '=' + data[name]; }).join('; ');
  if (/[\r\n"]/.test(value)) throw new Error('cookies_invalid');
  return value;
}

function upstream(route, params, host) {
  var target;
  if (route === '/kinozal/top') target = new URL(host + '/top.php');
  else if (route === '/kinozal/search') target = new URL(host + '/browse.php');
  else if (route === '/kinozal/details') target = new URL(host + '/details.php');
  else if (route === '/kinozal/torrent') target = new URL(host + '/download.php');
  else if (route === '/kinozal/image') {
    try { target = new URL(params.get('url') || ''); }
    catch (_) { return false; }
    if (target.protocol !== 'https:' || target.port || target.username || target.password ||
        hosts.every(function (known) { return target.hostname !== new URL(known).hostname; })) return false;
    target.hostname = new URL(host).hostname;
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
  var config = (cookie ? 'header = "Cookie: ' + cookie.replace(/\\/g, '\\\\') + '"\n' : '') + 'user-agent = "' + ua + '"\n';
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
  proc.stdin.on('error', function () { finish(new Error('upstream_connection')); });
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
    if (!error && result.status === 403 && attempt < 5) {
      return setTimeout(function () { fetchWithRetry(url, cookie, attempt + 1, callback); }, 300 * attempt);
    }
    callback(error, result);
  });
}

function challenged(result) {
  if (!result) return false;
  if (result.status === 403) return true;
  if (result.status !== 200) return false;
  var prefix = result.body.slice(0, 8192).toString('latin1');
  return /cf-chl-|cf-mitigated/i.test(prefix);
}

function fetchRoute(route, params, host, fallback, callback) {
  var target = upstream(route, params, host);
  if (target === null || target === false) return callback(null, null, host, target);
  var key = null;
  try { key = cacheKey(route, params); }
  catch (_) { return callback(new Error('cookies_missing'), null, host); }
  if (key) {
    try { var saved = cache.get(key); if (saved) return callback(null, { status: 200, body: saved, cached: true }, host); }
    catch (_) {}
  }
  if (Date.now() < (rateLimitedUntil[host] || 0))
    return callback(null, { status: 429, body: Buffer.alloc(0) }, host);
  var cookie;
  try { cookie = cookieHeader(host, route); }
  catch (_) {
    if (fallback && host === hosts[0]) return fetchRoute(route, params, hosts[1], false, callback);
    return callback(new Error('cookies_missing'), null, host);
  }
  fetchWithRetry(target, cookie, 1, function (error, result) {
    if (result) { result.cacheKey = key; result.cacheGeneration = cacheGeneration; }
    if (result && result.status === 429) {
      rateLimitedUntil[host] = Date.now() + 2 * 60 * 1000;
      return callback(null, result, host);
    }
    if (fallback && (error || challenged(result) || result.status !== 200)) {
      var other = host === hosts[0] ? hosts[1] : hosts[0];
      return fetchRoute(route, params, other, false, function (otherError, otherResult, otherHost) {
        if (result && result.status === 429 && (otherError || !otherResult || otherResult.status !== 200 || challenged(otherResult)))
          return callback(null, result, host);
        callback(otherError, otherResult, otherHost);
      });
    }
    if (!error && result && result.status === 200 && !challenged(result)) {
      rateLimitedUntil[host] = 0;
      if (route !== '/kinozal/image') activeHost = host;
    }
    callback(error, result, host);
  });
}

function loginToMirror(username, password, callback) {
  var form = 'username=' + encodeURIComponent(username) + '&password=' + encodeURIComponent(password) + '&returnto=%2Ftop.php';
  var args = ['--impersonate', 'chrome150', '--ech', 'false', '--ipv4', '--compressed',
    '--connect-timeout', '10', '--max-time', '30', '--silent', '--show-error', '--include',
    '--output', '-', '--write-out', '%{stderr}\nSEENA_STATUS:%{http_code}\n',
    '--user-agent', ua, '--header', 'Content-Type: application/x-www-form-urlencoded',
    '--data-binary', '@-', hosts[1] + '/takelogin.php'];
  var proc = child.spawn(curl, args, { env: Object.assign({}, process.env, { LD_LIBRARY_PATH: libPath }), stdio: ['pipe', 'pipe', 'pipe'] });
  var chunks = [], size = 0, stderr = '', finished = false;
  function finish(error, session) { if (!finished) { finished = true; callback(error, session); } }
  proc.stdout.on('data', function (chunk) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) { proc.kill(); finish(new Error('response_too_large')); }
    else chunks.push(chunk);
  });
  proc.stderr.on('data', function (chunk) { stderr += chunk.toString('utf8').slice(0, 512); });
  proc.stdin.on('error', function () { finish(new Error('upstream_connection')); });
  proc.on('error', function () { finish(new Error('curl_unavailable')); });
  proc.on('close', function (code) {
    var status = /SEENA_STATUS:(\d{3})/.exec(stderr);
    if (code !== 0 || !status) return finish(new Error('upstream_connection'));
    if (status[1] === '429') { rateLimitedUntil[hosts[1]] = Date.now() + 2 * 60 * 1000; return finish(new Error('kinozal_rate_limited')); }
    if (status[1] === '403') return finish(new Error('cloudflare_challenge'));
    var response = Buffer.concat(chunks).toString('latin1');
    var split = response.indexOf('\r\n\r\n');
    var headers = split < 0 ? '' : response.slice(0, split);
    var uid = /^set-cookie:\s*uid=([^;\r\n]+)/im.exec(headers);
    var pass = /^set-cookie:\s*pass=([^;\r\n]+)/im.exec(headers);
    if (!uid || !pass || !uid[1] || !pass[1] || /[\r\n"]/.test(uid[1] + pass[1]))
      return finish(new Error('login_failed'));
    finish(null, { uid: uid[1], pass: pass[1] });
  });
  proc.stdin.end(form);
}

function savePrivateJson(file, value) {
  var temp = file + '.new';
  fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
  fs.chmodSync(file, 0o600);
}

function saveLogin(session, credentials, remember) {
  clearKinozalPages();
  var previous = {};
  try { previous = JSON.parse(fs.readFileSync(cookieFile, 'utf8')); } catch (_) {}
  savePrivateJson(cookieFile, { uid: session.uid, pass: session.pass, cf_clearance: previous.cf_clearance || '' });
  if (remember) savePrivateJson(accountFile, credentials);
  else if (fs.existsSync(accountFile)) fs.unlinkSync(accountFile);
  activeHost = hosts[1];
  rateLimitedUntil[hosts[1]] = 0;
}

function savedLogin() {
  try {
    var account = JSON.parse(fs.readFileSync(accountFile, 'utf8'));
    if (typeof account.username === 'string' && account.username && typeof account.password === 'string' && account.password)
      return account;
  } catch (_) {}
  return null;
}

function verifySession(callback) {
  if (Date.now() < (rateLimitedUntil[hosts[1]] || 0))
    return callback({ status: 503, error: 'kinozal_rate_limited', message: 'Кинозал ограничил запросы (HTTP 429). Попробуйте позже.' });
  var cookie;
  try { cookie = cookieHeader(hosts[1], '/kinozal/torrent'); }
  catch (_) { return callback({ status: 503, error: 'cookies_missing', message: 'Войдите в Кинозал через «Аккаунт» на телевизоре.' }); }
  fetchOnce(hosts[1] + '/top.php', cookie, function (error, result) {
    if (error) return callback({ status: 502, error: 'upstream_connection', message: 'Не удалось проверить вход в Кинозал.' });
    if (result.status === 429)
      { rateLimitedUntil[hosts[1]] = Date.now() + 2 * 60 * 1000;
        return callback({ status: 503, error: 'kinozal_rate_limited', message: 'Кинозал ограничил запросы (HTTP 429). Попробуйте позже.' }); }
    if (challenged(result)) return callback({ status: 503, error: 'cloudflare_challenge', message: 'Кинозал требует проверку браузера.' });
    var body = result.body.toString('latin1');
    if (result.status !== 200 || body.indexOf('details.php?id=') < 0 || /name\s*=\s*["']?username/i.test(body))
      return callback({ status: 503, error: 'torrent_session_unavailable', message: 'Вход в Кинозал не активен. Откройте «Аккаунт» на телевизоре.' });
    activeHost = hosts[1];
    rateLimitedUntil[hosts[1]] = 0;
    callback({ status: 200, value: { status: 'ok', source: 'mirror', torrent: 'not_checked' } });
  });
}

function sendSessionResult(res, result) {
  json(res, result.status, result.status === 200 ? result.value : { error: result.error, message: result.message });
}

function connectionError() {
  var status = child.spawnSync('/var/lib/webosbrew/lgvpn/lgvpn-status', [], { encoding: 'utf8', timeout: 2000 });
  if (!status.error && /^DISCONNECTED\b/.test(status.stdout || ''))
    return { error: 'vpn_disconnected', message: 'LGVPN отключён. Включите VPN на телевизоре.' };
  return { error: 'upstream_connection', message: 'Не удалось подключиться к Kinozal.' };
}

http.createServer(function (req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  var request;
  try { request = new URL(req.url, 'http://127.0.0.1:' + port); }
  catch (_) { return json(res, 400, { error: 'invalid_url' }); }
  if (req.method === 'POST' && request.pathname === '/cache/clear') {
    try { return json(res, 200, clearAllCache()); }
    catch (_) { return json(res, 500, { error: 'cache_error', message: 'Не удалось очистить кэш.' }); }
  }
  if (request.pathname === '/cache/person') {
    var personId = request.searchParams.get('id') || '';
    if (!/^\d{1,12}$/.test(personId)) return json(res, 400, { error: 'invalid_person' });
    var personKey = cache.makeKey('/person', personId);
    if (req.method === 'GET') {
      try {
        var personSaved = cache.get(personKey);
        if (!personSaved) return json(res, 404, { error: 'cache_miss' });
        return json(res, 200, JSON.parse(personSaved.toString('utf8')));
      } catch (_) { return json(res, 500, { error: 'cache_error', message: 'Не удалось прочитать карточку актёра.' }); }
    }
    if (req.method === 'POST') {
      var personParts = [], personLength = 0, personTooLarge = false;
      req.on('data', function (part) {
        personLength += part.length;
        if (personLength > 2 * 1024 * 1024) personTooLarge = true; else personParts.push(part);
      });
      req.on('end', function () {
        if (personTooLarge) return json(res, 413, { error: 'response_too_large' });
        var personData;
        try { personData = JSON.parse(Buffer.concat(personParts).toString('utf8')); }
        catch (_) { return json(res, 400, { error: 'invalid_request' }); }
        if (!personData || !personData.info || !personData.credits ||
            typeof personData.info !== 'object' || typeof personData.credits !== 'object')
          return json(res, 400, { error: 'invalid_request' });
        try {
          cache.put(personKey, 'person', Buffer.from(JSON.stringify(personData), 'utf8'), personCacheTtl);
          return json(res, 200, { saved: true });
        } catch (_) { return json(res, 500, { error: 'cache_error', message: 'Не удалось сохранить карточку актёра.' }); }
      });
      return;
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }
  if (req.method === 'POST' && request.pathname === '/cache/settings') {
    var settingsParts = [], settingsLength = 0;
    req.on('data', function (part) { settingsLength += part.length; if (settingsLength <= 256) settingsParts.push(part); });
    req.on('end', function () {
      if (settingsLength > 256) return json(res, 413, { error: 'invalid_request' });
      var input;
      try { input = JSON.parse(Buffer.concat(settingsParts).toString('utf8')); }
      catch (_) { return json(res, 400, { error: 'invalid_request' }); }
      if (!input || typeof input.limitMb !== 'number') return json(res, 400, { error: 'invalid_request' });
      try { return json(res, 200, cache.setLimitMb(input.limitMb)); }
      catch (error) { return json(res, error.message === 'invalid_cache_limit' ? 400 : 500,
        { error: error.message === 'invalid_cache_limit' ? 'invalid_cache_limit' : 'cache_error' }); }
    });
    return;
  }
  if (req.method === 'POST' && request.pathname === '/kinozal/session/login') {
    var parts = [], length = 0, tooLarge = false;
    req.on('data', function (part) { length += part.length; if (length > 4096) tooLarge = true; else parts.push(part); });
    req.on('end', function () {
      if (tooLarge) return json(res, 413, { error: 'invalid_request' });
      var input;
      try { input = JSON.parse(Buffer.concat(parts).toString('utf8')); }
      catch (_) { return json(res, 400, { error: 'invalid_request' }); }
      if (!input || typeof input.username !== 'string' || !input.username.trim() || input.username.length > 128 ||
          typeof input.password !== 'string' || !input.password || input.password.length > 256)
        return json(res, 400, { error: 'invalid_credentials_format', message: 'Введите логин и пароль Кинозала.' });
      var credentials = { username: input.username.trim(), password: input.password };
      loginToMirror(credentials.username, credentials.password, function (error, session) {
        if (error) return json(res, error.message === 'login_failed' ? 401 : 503,
          { error: error.message, message: error.message === 'login_failed' ? 'Кинозал не принял логин или пароль.' :
            error.message === 'kinozal_rate_limited' ? 'Кинозал временно ограничил вход. Попробуйте позже.' : 'Не удалось войти в Кинозал с телевизора.' });
        try { saveLogin(session, credentials, input.remember === true); }
        catch (_) { return json(res, 500, { error: 'save_failed', message: 'Не удалось сохранить вход на телевизоре.' }); }
        verifySession(function (result) {
          if (result.error === 'kinozal_rate_limited') result.message = 'Вход сохранён, но Кинозал пока ограничивает запросы аккаунта. Попробуйте позже.';
          sendSessionResult(res, result);
        });
      });
    });
    return;
  }
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  if (request.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (request.pathname === '/cache/status') {
    try { return json(res, 200, cache.status()); }
    catch (_) { return json(res, 500, { error: 'cache_error', message: 'Не удалось прочитать кэш.' }); }
  }
  if (request.pathname === '/kinozal/cookies/status') {
    try { cookieHeader(hosts[1], '/kinozal/torrent'); return json(res, 200, { present: true }); }
    catch (_) { return json(res, 200, { present: false }); }
  }
  if (request.pathname === '/kinozal/session/refresh') {
    return verifySession(function (result) {
      if (result.status === 200) { try { clearKinozalPages(); } catch (_) {} return sendSessionResult(res, result); }
      var credentials = savedLogin();
      if (!credentials || result.error !== 'torrent_session_unavailable')
        return sendSessionResult(res, result);
      if (Date.now() - lastAutoLoginAt < 10 * 60 * 1000) return sendSessionResult(res, result);
      lastAutoLoginAt = Date.now();
      loginToMirror(credentials.username, credentials.password, function (error, session) {
        if (error) return json(res, error.message === 'login_failed' ? 401 : 503,
          { error: error.message, message: error.message === 'login_failed' ? 'Сохранённый пароль Кинозала больше не подходит. Введите его снова в «Аккаунт».' :
            error.message === 'kinozal_rate_limited' ? 'Кинозал временно ограничил вход. Попробуйте позже.' : 'Не удалось обновить вход с телевизора.' });
        try { saveLogin(session, credentials, true); }
        catch (_) { return json(res, 500, { error: 'save_failed', message: 'Не удалось сохранить новый вход на телевизоре.' }); }
        verifySession(function (newResult) { sendSessionResult(res, newResult); });
      });
    });
  }
  var target = upstream(request.pathname, request.searchParams, activeHost);
  if (target === null) return json(res, 404, { error: 'not_found' });
  if (target === false) return json(res, 400, { error: 'invalid_request' });
  fetchRoute(request.pathname, request.searchParams, activeHost, true, function (error, result) {
    if (error && error.message === 'cookies_missing') return json(res, 503, { error: 'cookies_missing', message: 'Обновите cookies Kinozal на TV.' });
    if (error) return json(res, 502, error.message === 'upstream_connection' ? connectionError() :
      { error: error.message, message: 'Не удалось подключиться к Kinozal.' });
    if (challenged(result)) return json(res, 503, { error: 'cloudflare_challenge', message: 'Cloudflare требует обновить сессию Kinozal.' });
    if (result.status === 429) return json(res, 503, { error: 'kinozal_rate_limited', message: request.pathname === '/kinozal/torrent' ?
      'Кинозал временно ограничил загрузку torrent. Попробуйте позже.' : 'Кинозал временно ограничил запросы (HTTP 429). Попробуйте позже.' });
    if (result.status !== 200) return json(res, 502, { error: 'upstream_http', status: result.status });
    var torrent = request.pathname === '/kinozal/torrent';
    var image = request.pathname === '/kinozal/image';
    if (torrent && (result.body[0] !== 0x64 || result.body.indexOf(Buffer.from('4:info')) < 0))
      return json(res, 502, { error: 'invalid_torrent_response', message: 'Kinozal не вернул .torrent.' });
    var mime = image ? imageType(result.body) : '';
    if (image && !mime) return json(res, 502, { error: 'invalid_image_response' });
    if (!torrent && !image && loginBody(result.body))
      return json(res, 503, { error: 'session_unavailable', message: 'Кинозал требует повторный вход.' });
    if (!result.cached && result.cacheKey && result.cacheGeneration === cacheGeneration) {
      try { cache.put(result.cacheKey, 'page', result.body, cacheTtl[request.pathname]); }
      catch (error) { console.warn('Seena cache write failed: ' + (error.code || error.message)); }
    }
    res.writeHead(200, { 'Content-Type': torrent ? 'application/x-bittorrent' : image ? mime : 'text/html; charset=windows-1251',
      'Content-Length': result.body.length, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store',
      'X-Seena-Cache': result.cached ? 'HIT' : 'MISS' });
    res.end(result.body);
  });
}).listen(port, '127.0.0.1', function () { console.log('Seena Kinozal helper listening on 127.0.0.1:' + port); });
