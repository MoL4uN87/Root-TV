'use strict';
// Node 8 compatible, loopback-only Kinozal transport for Seena.
var http = require('http');
var https = require('https');
var legacyUrl = require('url');
var fs = require('fs');
var path = require('path');
var child = require('child_process');
var URL = require('url').URL;
var SeenaCache = require('./seena-cache');
var cachePolicy = require('./seena-cache-policy');
var VpnLease = require('./seena-vpn-lease');
var sportsPlayback = require('./seena-sports-playback');
var ime = require('./seena-ime');
var iptv = require('./seena-iptv');
var videoSearch = require('./seena-video-search');

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
var personCacheTtl = 7 * 24 * 60 * 60 * 1000;
var vpnRoot = process.env.SEENA_LGVPN_ROOT || '/var/lib/webosbrew/lgvpn';
function runVpnScript(name) {
  var result = child.spawnSync(path.join(vpnRoot, name), [], { encoding: 'utf8', timeout: 20000 });
  if (result.error || result.status !== 0) throw new Error('vpn_' + name.replace(/^lgvpn-/, '') + '_failed');
}
var sportNetworkLease = new VpnLease({
  stopVpn: function () { runVpnScript('lgvpn-stop'); },
  startVpn: function () { runVpnScript('lgvpn-start'); },
  timeoutMs: 45000
});
function clearKinozalPages() { cacheGeneration += 1; return cache.clearKind('page'); }
function clearAllCache() { cacheGeneration += 1; return cache.clear(); }
function cacheKey(route, params) {
  if (!cachePolicy.ttl(route)) return null;
  return cache.makeKey(route, (route === '/kinozal/top' ? 'top-cache-v2&' : '') + params.toString());
}
function loginBody(body) {
  var title = body.slice(0, 8192).toString('latin1');
  return /<title>\s*(?:\xC2\xF5\xEE\xE4|Р’С…РѕРґ|Login)\s*::/i.test(title);
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
    '--compressed', '--location', '--connect-timeout', '10', '--max-time', '30', '--silent', '--show-error',
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

function fetchVkEmbed(url, callback) {
  var args = ['--impersonate', 'chrome150', '--ech', 'false', '--ipv4',
    '--compressed', '--location', '--connect-timeout', '10', '--max-time', '30',
    '--silent', '--show-error', '--output', '-',
    '--write-out', '%{stderr}\nSEENA_STATUS:%{http_code}:%{http_version}\n', url];

  var env = Object.assign({}, process.env, { LD_LIBRARY_PATH: libPath });
  var proc = child.spawn(curl, args, { env: env, stdio: ['ignore', 'pipe', 'pipe'] });
  var chunks = [], size = 0, errorText = '', finished = false;

  function finish(error, result) {
    if (!finished) {
      finished = true;
      callback(error, result);
    }
  }

  proc.stdout.on('data', function (chunk) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) {
      proc.kill();
      finish(new Error('response_too_large'));
    } else {
      chunks.push(chunk);
    }
  });

  proc.stderr.on('data', function (chunk) {
    errorText += chunk.toString('utf8').slice(0, 2048);
  });

  proc.on('error', function () {
    finish(new Error('curl_unavailable'));
  });

  proc.on('close', function (code) {
    var match = /SEENA_STATUS:(\d{3}):([^\s]+)/.exec(errorText);
    if (!match || code !== 0)
      return finish(new Error('upstream_connection'));

    finish(null, {
      status: Number(match[1]),
      version: match[2],
      body: Buffer.concat(chunks)
    });
  });
}
function fetchWithRetry(url, cookie, attempt, callback) {
  fetchOnce(url, cookie, function (error, result) {
    if (!error && result.status === 403 && attempt < 5) {
      return setTimeout(function () { fetchWithRetry(url, cookie, attempt + 1, callback); }, 300 * attempt);
    }
    callback(error, result);
  });
}

function proxyPublicJson(res, target) {
  fetchOnce(target, '', function (error, result) {
    if (error || !result) return json(res, 502, { error: 'upstream_connection', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ С‚СЂР°РЅСЃР»СЏС†РёРё.' });
    if (result.status !== 200) return json(res, 502, { error: 'upstream_http', status: result.status, message: 'РЎРµСЂРІРёСЃ С‚СЂР°РЅСЃР»СЏС†РёР№ РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ.' });
    try { return json(res, 200, JSON.parse(result.body.toString('utf8'))); }
    catch (_) { return json(res, 502, { error: 'invalid_response', message: 'РЎРµСЂРІРёСЃ РІРµСЂРЅСѓР» РЅРµРІРµСЂРЅС‹Р№ РѕС‚РІРµС‚.' }); }
  });
}
function searchYandexVideo(res, value) {
  var query = videoSearch.safeQuery(value);
  if (!query)
    return json(res, 400, { error: 'invalid_query', message: 'Введите запрос для поиска видео.' });

  var items = [];
  var seen = {};
  var page = 0;
  var maxPages = 25;
  var maxResults = 100;

  function loadNext() {
    if (page >= maxPages || items.length >= maxResults)
      return json(res, 200, { items: items.slice(0, maxResults), total: Math.min(items.length, maxResults) });

    var target = 'https://yandex.ru/video/search?text=' + encodeURIComponent(query) + '&p=' + page;

    fetchOnce(target, '', function (error, result) {
      if (error || !result || result.status !== 200) {
        if (items.length)
          return json(res, 200, { items: items.slice(0, maxResults), total: Math.min(items.length, maxResults) });
        return json(res, 502, { error: 'video_search_unavailable', message: 'Поиск видео временно недоступен.' });
      }

      var found = videoSearch.parseResults(result.body.toString('utf8'));

      if (!found.length)
        return json(res, 200, { items: items.slice(0, maxResults), total: Math.min(items.length, maxResults) });

      found.forEach(function (item) {
        if (items.length >= maxResults || seen[item.preview]) return;
        seen[item.preview] = true;
        items.push(item);
      });

      page += 1;
      loadNext();
    });
  }

  loadNext();
}
function approvedVideoCdn(value) {
  try {
    var parsed = legacyUrl.parse(String(value || ''));
    return parsed.protocol === 'https:' &&
      parsed.hostname &&
      /(?:^|\.)(?:okcdn\.ru|my\.mail\.ru)$/i.test(parsed.hostname) &&
      !parsed.auth ? parsed.href : '';
  } catch (_) {
    return '';
  }
}

function localVideoProxy(value) {
  return 'http://127.0.0.1:' + port + '/video/proxy?url=' + encodeURIComponent(value);
}

function rewriteHls(body, baseUrl) {
  return String(body || '').split(/\r?\n/).map(function (line) {
    if (!line) return line;

    if (line.charAt(0) === '#') {
      return line.replace(/URI="([^"]+)"/g, function (_, value) {
        var absolute = legacyUrl.resolve(baseUrl, value);
        return approvedVideoCdn(absolute) ? 'URI="' + localVideoProxy(absolute) + '"' : 'URI="' + value + '"';
      });
    }

    var absolute = legacyUrl.resolve(baseUrl, line);
    return approvedVideoCdn(absolute) ? localVideoProxy(absolute) : line;
  }).join('\n');
}

function proxyVideoMedia(req, res, value, redirects) {
  redirects = redirects || 0;

  var target = approvedVideoCdn(value);
  if (!target)
    return json(res, 400, { error: 'invalid_video_proxy_url' });

  var options = legacyUrl.parse(target);
  options.headers = {
    'User-Agent': 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/79.0.3945.79 Safari/537.36',
    'Accept': '*/*'
  };

  if (req.headers.range)
    options.headers.Range = req.headers.range;

  var upstream = https.get(options, function (response) {
    if (response.statusCode >= 300 && response.statusCode < 400 &&
        response.headers.location && redirects < 5) {
      var next = legacyUrl.resolve(target, response.headers.location);
      response.resume();
      return proxyVideoMedia(req, res, next, redirects + 1);
    }

    if (response.statusCode < 200 || response.statusCode >= 400) {
      response.resume();
      return json(res, 502, {
        error: 'video_proxy_upstream',
        status: response.statusCode
      });
    }

    var contentType = String(response.headers['content-type'] || '');
    var playlist = /\.m3u8(?:$|\?)/i.test(target) || /mpegurl/i.test(contentType);

    if (playlist) {
      var chunks = [];
      var size = 0;

      response.on('data', function (chunk) {
        size += chunk.length;
        if (size <= 4 * 1024 * 1024)
          chunks.push(chunk);
      });

      response.on('end', function () {
        if (size > 4 * 1024 * 1024)
          return json(res, 502, { error: 'playlist_too_large' });

        var rewritten = rewriteHls(Buffer.concat(chunks).toString('utf8'), target);

        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store'
        });
        res.end(rewritten);
      });

      return;
    }

    var headers = {
      'Content-Type': contentType || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    };

    if (response.headers['content-length'])
      headers['Content-Length'] = response.headers['content-length'];
    if (response.headers['content-range'])
      headers['Content-Range'] = response.headers['content-range'];
    if (response.headers['accept-ranges'])
      headers['Accept-Ranges'] = response.headers['accept-ranges'];

    res.writeHead(response.statusCode, headers);
    response.pipe(res);
  });

  upstream.on('error', function () {
    if (!res.headersSent)
      json(res, 502, { error: 'video_proxy_connection' });
    else
      res.end();
  });
}
function resolveYandexVideo(res, value) {
  var preview = String(value || '').split(/[?#]/)[0];
  if (!/^https:\/\/yandex\.ru\/video\/preview\/\d+(?:[?#].*)?$/.test(preview))
    return json(res, 400, { error: 'invalid_video_url', message: 'Неверная ссылка Яндекс Видео.' });

  fetchOnce(preview, '', function (error, result) {
    if (error || !result || result.status !== 200)
      return json(res, 502, { error: 'preview_unavailable', message: 'Не удалось открыть страницу видео.' });

    var html = result.body.toString('utf8');
    var match = html.match(/"embedUrl":"(https:\/\/[^"]+)"/);

    if (!match)
      return json(res, 502, { error: 'unsupported_provider', message: 'Этот источник видео пока не поддерживается.' });

    var embed = match[1].replace(/\\\//g, '/').replace(/\\u0026/g, '&');

    var embedHost = '';
    try { embedHost = new URL(embed).hostname.toLowerCase(); }
    catch (_) {}

    if (embedHost === 'ok.ru' || /\.ok\.ru$/i.test(embedHost)) {
      return fetchOnce(embed, '', function (okError, okResult) {
        if (okError || !okResult || okResult.status !== 200)
          return json(res, 502, {
            error: 'ok_unavailable',
            message: 'Не удалось открыть OK Видео.'
          });

        var okBody = okResult.body.toString('utf8')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&#39;/g, "'");

        var okStream = videoSearch.okHlsUrl(okBody);

        if (!okStream)
          return json(res, 502, {
            error: 'ok_stream_not_found',
            message: 'Видеопоток OK не найден.'
          });

        if (!/^https:\/\/[^\/]*okcdn\.ru\//i.test(okStream))
          return json(res, 502, {
            error: 'ok_stream_invalid',
            message: 'Некорректный поток OK Видео.'
          });

        return json(res, 200, {
          status: 'ready',
          provider: 'ok',
          type: 'application/vnd.apple.mpegurl',
          url: localVideoProxy(okStream)
        });
      });
    }

    if (embedHost === 'my.mail.ru') {
      var mailIdMatch = embed.match(/^https:\/\/my\.mail\.ru\/video\/embed\/(\d+)/i);

      if (!mailIdMatch)
        return json(res, 502, {
          error: 'mail_invalid_embed',
          message: 'Некорректная ссылка Mail.ru Видео.'
        });

      var mailMetadataUrl =
        'https://my.mail.ru/+/video/meta/' + mailIdMatch[1];

      return fetchOnce(mailMetadataUrl, '', function (mailError, mailResult) {
        if (mailError || !mailResult || mailResult.status !== 200)
          return json(res, 502, {
            error: 'mail_metadata_unavailable',
            message: 'Не удалось получить данные Mail.ru Видео.'
          });

        var metadata;

        try {
          metadata = JSON.parse(mailResult.body.toString('utf8'));
        } catch (_) {
          return json(res, 502, {
            error: 'mail_metadata_invalid',
            message: 'Некорректный ответ Mail.ru Видео.'
          });
        }

        var videos =
          metadata && Array.isArray(metadata.videos)
            ? metadata.videos
            : [];

        var chosen = null;

        videos.forEach(function (video) {
          if (!video || !video.url) return;

          var quality = parseInt(video.key, 10) || 0;

          if (!chosen || quality > chosen.quality) {
            chosen = {
              quality: quality,
              url: String(video.url)
            };
          }
        });

        if (!chosen)
          return json(res, 502, {
            error: 'mail_stream_not_found',
            message: 'Видеопоток Mail.ru не найден.'
          });

        var mailStream = chosen.url;

        if (/^\/\//.test(mailStream))
          mailStream = 'https:' + mailStream;

        if (!approvedVideoCdn(mailStream))
          return json(res, 502, {
            error: 'mail_stream_invalid',
            message: 'Некорректный поток Mail.ru Видео.'
          });

        return json(res, 200, {
          status: 'ready',
          provider: 'mail',
          type: 'video/mp4',
          url: localVideoProxy(mailStream),
          title:
            metadata.meta && metadata.meta.title
              ? metadata.meta.title
              : '',
          duration:
            metadata.meta && metadata.meta.duration
              ? Number(metadata.meta.duration)
              : 0,
          quality: chosen.quality
        });
      });
    }

    if (embedHost === 'rutube.ru' || /\.rutube\.ru$/i.test(embedHost)) {
      var rutubeIdMatch = embed.match(/^https:\/\/rutube\.ru\/play\/embed\/([a-f0-9]{32})\//i);
      if (!rutubeIdMatch)
        return json(res, 200, { status: 'unavailable', provider: 'rutube', error: 'rutube_stream_not_found',
          message: 'Rutube не опубликовал поток для этого видео.' });

      var rutubeApi = 'https://rutube.ru/api/play/options/' + rutubeIdMatch[1] +
        '/?no_404=1&p=1&pver=v2&client=wdp&mq=all';
      return fetchOnce(rutubeApi, '', function (rutubeError, rutubeResult) {
        if (rutubeError || !rutubeResult)
          return json(res, 502, { error: 'rutube_unavailable', message: 'Не удалось получить ответ Rutube.' });
        var unavailable = videoSearch.rutubeUnavailable(rutubeResult.status, rutubeResult.body.toString('utf8'));
        if (unavailable === 'rutube_region_restricted')
          return json(res, 200, { status: 'unavailable', provider: 'rutube', error: unavailable,
            message: 'Rutube сообщает: это видео недоступно из-за ограничений в вашей стране.' });
        return json(res, 200, { status: 'unavailable', provider: 'rutube', error: 'rutube_stream_not_found',
          message: 'Rutube не предоставил публичный поток для этого видео.' });
      });
    }

    var iframeHosts = {
      'www.youtube.com': 'youtube',
      'youtube.com': 'youtube',
      'pbembed.me': 'pbembed',
      'embed-player.space': 'embed-player',
      'p0sembed.com': 'p0sembed'
    };

    if (iframeHosts[embedHost]) {
      var iframeUrl;

      try {
        iframeUrl = new URL(embed);

        if (
          iframeUrl.protocol !== 'https:' ||
          iframeUrl.username ||
          iframeUrl.password
        ) throw new Error('invalid embed');
      } catch (_) {
        return json(res, 200, {
          status: 'unavailable',
          provider: iframeHosts[embedHost],
          error: 'invalid_embed',
          message: 'Некорректная ссылка видеоплеера.'
        });
      }

      if (
        iframeHosts[embedHost] === 'youtube' &&
        !/^\/embed\/[A-Za-z0-9_-]+\/?$/.test(iframeUrl.pathname)
      ) {
        return json(res, 200, {
          status: 'unavailable',
          provider: 'youtube',
          error: 'invalid_youtube_embed',
          message: 'Некорректная ссылка YouTube.'
        });
      }

      return json(res, 200, {
        status: 'ready',
        provider: iframeHosts[embedHost],
        mode: 'embed',
        type: 'text/html',
        url: iframeUrl.href
      });
    }

    if (embedHost !== 'vkvideo.ru' && !/\.vkvideo\.ru$/i.test(embedHost))
      return json(res, 200, {
        status: 'unavailable',
        provider: embedHost || 'unknown',
        error: 'unsupported_provider',
        message: 'Источник ' + (embedHost || 'видео') + ' пока не поддерживается.'
      });

    var ownerMatch = embed.match(/[?&]oid=(-?\d+)/);
    var videoMatch = embed.match(/[?&]id=(\d+)/);
    var hashMatch = embed.match(/[?&]hash=([^&]+)/);

    if (!ownerMatch || !videoMatch || !hashMatch)
      return json(res, 502, { error: 'invalid_vk_embed', message: 'Не удалось определить параметры VK Видео.' });

    fetchVkEmbed(embed, function (embedError, embedResult) {
      if (embedError || !embedResult || embedResult.status !== 200)
        return json(res, 502, { error: 'vk_unavailable', message: 'Не удалось открыть VK Видео.' });

      var body = embedResult.body.toString('utf8');
      var tokenMatch = body.match(/"access_token":"(anonym\.[^"]+)"/);

      if (!tokenMatch)
        return json(res, 502, { error: 'vk_token_not_found', message: 'Не удалось получить токен VK Видео.' });

      var api =
        'https://api.vkvideo.ru/method/video.getEmbed' +
        '?owner_id=' + encodeURIComponent(ownerMatch[1]) +
        '&video_id=' + encodeURIComponent(videoMatch[1]) +
        '&hash=' + encodeURIComponent(hashMatch[1]) +
        '&v=5.289' +
        '&access_token=' + encodeURIComponent(tokenMatch[1]);

      fetchOnce(api, '', function (apiError, apiResult) {
        if (apiError || !apiResult || apiResult.status !== 200)
          return json(res, 502, { error: 'vk_api_unavailable', message: 'VK Видео временно недоступно.' });

        var data;
        try {
          data = JSON.parse(apiResult.body.toString('utf8'));
        } catch (_) {
          return json(res, 502, { error: 'vk_api_invalid', message: 'Некорректный ответ VK Видео.' });
        }

        var response = data && data.response;
        var video = response && response.video;
        var files = video && video.files;
        var stream = videoSearch.vkStream(files);

        if (!stream)
          return json(res, 502, { error: 'stream_not_found', message: 'Видеопоток не найден.' });

        if (!approvedVideoCdn(stream.url))
          return json(res, 502, { error: 'stream_invalid', message: 'Некорректный поток VK Видео.' });

        return json(res, 200, {
          status: 'ready',
          provider: 'vk',
          type: stream.type,
          url: localVideoProxy(stream.url),
          title: video.title || '',
          duration: video.duration || 0
        });
      });
    });
  });
}
function approvedMatchPlayer(value) {
  try {
    var parsed = new URL(String(value || ''));
    return parsed.protocol === 'https:' && parsed.hostname === 'video.matchtv.ru' && !parsed.port &&
      !parsed.username && !parsed.password && /^\/iframe\/(?:feed\/|channel\/)/.test(parsed.pathname) ? parsed.href : '';
  } catch (_) { return ''; }
}

function resolveSportPlayback(res, playerUrl) {
  var approved = approvedMatchPlayer(playerUrl);
  if (!approved) return json(res, 502, { error: 'invalid_player', message: 'РћС„РёС†РёР°Р»СЊРЅС‹Р№ РїР»РµРµСЂ С‚СЂР°РЅСЃР»СЏС†РёРё РЅРµРґРѕСЃС‚СѓРїРµРЅ.' });
  fetchOnce(approved, '', function (iframeError, iframeResult) {
    if (iframeError || !iframeResult || iframeResult.status !== 200)
      return json(res, 502, { error: 'player_connection', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ РёСЃС‚РѕС‡РЅРёРє С‚СЂР°РЅСЃР»СЏС†РёРё.' });
    var mediaUrl = sportsPlayback.mediaUrlFromIframe(iframeResult.body.toString('utf8'));
    if (!mediaUrl) return json(res, 502, { error: 'invalid_player_config', message: 'РСЃС‚РѕС‡РЅРёРє С‚СЂР°РЅСЃР»СЏС†РёРё РЅРµ РЅР°Р№РґРµРЅ.' });
    fetchOnce(mediaUrl, '', function (mediaError, mediaResult) {
      if (mediaError || !mediaResult || mediaResult.status !== 200)
        return json(res, 502, { error: 'stream_connection', message: 'Р’РёРґРµРѕРїРѕС‚РѕРє РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ.' });
      var playback = sportsPlayback.parseMediaXml(mediaResult.body.toString('utf8'));
      if (playback.status === 'unavailable') playback.message = playback.reason === 'geo' ?
        'РўСЂР°РЅСЃР»СЏС†РёСЏ РЅРµРґРѕСЃС‚СѓРїРЅР° РІ С‚РµРєСѓС‰РµРј СЂРµРіРёРѕРЅРµ.' : 'РўСЂР°РЅСЃР»СЏС†РёСЏ СЃРµР№С‡Р°СЃ РЅРµРґРѕСЃС‚СѓРїРЅР°.';
      return json(res, 200, playback);
    });
  });
}

function resolveSportMedia(res, mediaId) {
  fetchOnce('https://news.sportbox.ru/api/v5/media/' + mediaId, '', function (error, result) {
    if (error || !result || result.status !== 200)
      return json(res, 502, { error: 'upstream_connection', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРІРµРґРµРЅРёСЏ Рѕ С‚СЂР°РЅСЃР»СЏС†РёРё.' });
    var data;
    try { data = JSON.parse(result.body.toString('utf8')); }
    catch (_) { return json(res, 502, { error: 'invalid_response', message: 'РЎРµСЂРІРёСЃ РІРµСЂРЅСѓР» РЅРµРІРµСЂРЅС‹Р№ РѕС‚РІРµС‚.' }); }
    return resolveSportPlayback(res, data && data.result && data.result.playerUrl);
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
    return callback({ status: 503, error: 'kinozal_rate_limited', message: 'РљРёРЅРѕР·Р°Р» РѕРіСЂР°РЅРёС‡РёР» Р·Р°РїСЂРѕСЃС‹ (HTTP 429). РџРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ.' });
  var cookie;
  try { cookie = cookieHeader(hosts[1], '/kinozal/torrent'); }
  catch (_) { return callback({ status: 503, error: 'cookies_missing', message: 'Р’РѕР№РґРёС‚Рµ РІ РљРёРЅРѕР·Р°Р» С‡РµСЂРµР· В«РђРєРєР°СѓРЅС‚В» РЅР° С‚РµР»РµРІРёР·РѕСЂРµ.' }); }
  fetchOnce(hosts[1] + '/top.php', cookie, function (error, result) {
    if (error) return callback({ status: 502, error: 'upstream_connection', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕРІРµСЂРёС‚СЊ РІС…РѕРґ РІ РљРёРЅРѕР·Р°Р».' });
    if (result.status === 429)
      { rateLimitedUntil[hosts[1]] = Date.now() + 2 * 60 * 1000;
        return callback({ status: 503, error: 'kinozal_rate_limited', message: 'РљРёРЅРѕР·Р°Р» РѕРіСЂР°РЅРёС‡РёР» Р·Р°РїСЂРѕСЃС‹ (HTTP 429). РџРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ.' }); }
    if (challenged(result)) return callback({ status: 503, error: 'cloudflare_challenge', message: 'РљРёРЅРѕР·Р°Р» С‚СЂРµР±СѓРµС‚ РїСЂРѕРІРµСЂРєСѓ Р±СЂР°СѓР·РµСЂР°.' });
    var body = result.body.toString('latin1');
    if (result.status !== 200 || body.indexOf('details.php?id=') < 0 || /name\s*=\s*["']?username/i.test(body))
      return callback({ status: 503, error: 'torrent_session_unavailable', message: 'Р’С…РѕРґ РІ РљРёРЅРѕР·Р°Р» РЅРµ Р°РєС‚РёРІРµРЅ. РћС‚РєСЂРѕР№С‚Рµ В«РђРєРєР°СѓРЅС‚В» РЅР° С‚РµР»РµРІРёР·РѕСЂРµ.' });
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
    return { error: 'vpn_disconnected', message: 'LGVPN РѕС‚РєР»СЋС‡С‘РЅ. Р’РєР»СЋС‡РёС‚Рµ VPN РЅР° С‚РµР»РµРІРёР·РѕСЂРµ.' };
  return { error: 'upstream_connection', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРєР»СЋС‡РёС‚СЊСЃСЏ Рє Kinozal.' };
}

function imeRequest(action, text, callback) {
  var operation = ime.operationFor(action, text);
  if (!operation) return callback(new Error('invalid_ime_request'));
  var proc = child.spawn('/usr/bin/luna-send', ['-n', '1', 'luna://com.webos.service.ime/' + operation.method, JSON.stringify(operation.payload)]);
  var output = '', failed = false;
  proc.stdout.on('data', function (chunk) { output += chunk.toString('utf8'); });
  proc.on('error', function () { failed = true; });
  proc.on('close', function (code) {
    var result;
    try { result = JSON.parse(output); } catch (_) { result = null; }
    callback(failed || code !== 0 || !result || result.returnValue !== true ? new Error('ime_unavailable') : null);
  });
}

http.createServer(function (req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  var request;
  try { request = new URL(req.url, 'http://127.0.0.1:' + port); }
  catch (_) { return json(res, 400, { error: 'invalid_url' }); }
  if (req.method === 'POST' && request.pathname === '/cache/clear') {
    try { return json(res, 200, clearAllCache()); }
    catch (_) { return json(res, 500, { error: 'cache_error', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‡РёСЃС‚РёС‚СЊ РєСЌС€.' }); }
  }
  if (req.method === 'POST' && request.pathname === '/cache/pages/clear') {
    try { return json(res, 200, clearKinozalPages()); }
    catch (_) { return json(res, 500, { error: 'cache_error', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ СЃС‚СЂР°РЅРёС†С‹ РљРёРЅРѕР·Р°Р»Р°.' }); }
  }
  if (req.method === 'POST' && /^\/sports\/network\/(start|keepalive|stop)$/.test(request.pathname)) {
    var networkAction = request.pathname.split('/').pop();
    try {
      var networkStatus = networkAction === 'start' ? sportNetworkLease.acquire() :
        networkAction === 'keepalive' ? sportNetworkLease.keepAlive() : sportNetworkLease.release();
      return json(res, 200, networkStatus);
    } catch (_) {
      return json(res, 503, { error: 'sport_network_switch_failed',
        message: networkAction === 'stop' ? 'РќРµ СѓРґР°Р»РѕСЃСЊ РІРѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ LGVPN.' : 'РќРµ СѓРґР°Р»РѕСЃСЊ РІРєР»СЋС‡РёС‚СЊ РїСЂСЏРјРѕРµ СЃРѕРµРґРёРЅРµРЅРёРµ РґР»СЏ СЃРїРѕСЂС‚Р°.' });
    }
  }
  if (req.method === 'POST' && request.pathname === '/ime/input') {
    var imeParts = [], imeLength = 0;
    req.on('data', function (part) { imeLength += part.length; if (imeLength <= 128) imeParts.push(part); });
    req.on('end', function () {
      if (imeLength > 128) return json(res, 400, { error: 'invalid_ime_request' });
      var input;
      try { input = JSON.parse(Buffer.concat(imeParts).toString('utf8')); }
      catch (_) { return json(res, 400, { error: 'invalid_ime_request' }); }
      imeRequest(input && input.action, input && input.text, function (error) {
        return json(res, error ? 409 : 200, error ? { error: 'ime_unavailable', message: 'РЎРЅР°С‡Р°Р»Р° РІС‹Р±РµСЂРёС‚Рµ РїРѕР»Рµ e-mail РЅР° СЃС‚СЂР°РЅРёС†Рµ РќРўР’-РџР›Р®РЎ.' } : { inserted: true });
      });
    });
    return;
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
      } catch (_) { return json(res, 500, { error: 'cache_error', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕС‡РёС‚Р°С‚СЊ РєР°СЂС‚РѕС‡РєСѓ Р°РєС‚С‘СЂР°.' }); }
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
        } catch (_) { return json(res, 500, { error: 'cache_error', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РєР°СЂС‚РѕС‡РєСѓ Р°РєС‚С‘СЂР°.' }); }
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
        return json(res, 400, { error: 'invalid_credentials_format', message: 'Р’РІРµРґРёС‚Рµ Р»РѕРіРёРЅ Рё РїР°СЂРѕР»СЊ РљРёРЅРѕР·Р°Р»Р°.' });
      var credentials = { username: input.username.trim(), password: input.password };
      loginToMirror(credentials.username, credentials.password, function (error, session) {
        if (error) return json(res, error.message === 'login_failed' ? 401 : 503,
          { error: error.message, message: error.message === 'login_failed' ? 'РљРёРЅРѕР·Р°Р» РЅРµ РїСЂРёРЅСЏР» Р»РѕРіРёРЅ РёР»Рё РїР°СЂРѕР»СЊ.' :
            error.message === 'kinozal_rate_limited' ? 'РљРёРЅРѕР·Р°Р» РІСЂРµРјРµРЅРЅРѕ РѕРіСЂР°РЅРёС‡РёР» РІС…РѕРґ. РџРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ.' : 'РќРµ СѓРґР°Р»РѕСЃСЊ РІРѕР№С‚Рё РІ РљРёРЅРѕР·Р°Р» СЃ С‚РµР»РµРІРёР·РѕСЂР°.' });
        try { saveLogin(session, credentials, input.remember === true); }
        catch (_) { return json(res, 500, { error: 'save_failed', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РІС…РѕРґ РЅР° С‚РµР»РµРІРёР·РѕСЂРµ.' }); }
        verifySession(function (result) {
          if (result.error === 'kinozal_rate_limited') result.message = 'Р’С…РѕРґ СЃРѕС…СЂР°РЅС‘РЅ, РЅРѕ РљРёРЅРѕР·Р°Р» РїРѕРєР° РѕРіСЂР°РЅРёС‡РёРІР°РµС‚ Р·Р°РїСЂРѕСЃС‹ Р°РєРєР°СѓРЅС‚Р°. РџРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ.';
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
    catch (_) { return json(res, 500, { error: 'cache_error', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕС‡РёС‚Р°С‚СЊ РєСЌС€.' }); }
  }
  if (request.pathname === '/kinozal/cookies/status') {
    try { cookieHeader(hosts[1], '/kinozal/torrent'); return json(res, 200, { present: true }); }
    catch (_) { return json(res, 200, { present: false }); }
  }
  if (request.pathname === '/sports/broadcasts') {
    var sportDate = request.searchParams.get('date') || '';
    if (!/^\d{8}$/.test(sportDate)) return json(res, 400, { error: 'invalid_date' });
    return proxyPublicJson(res, 'https://matchtv.ru/api/v1/videohub/broadcasts?date=' + sportDate);
  }
  if (request.pathname === '/video/search') return searchYandexVideo(res, request.searchParams.get('q') || '');
  if (request.pathname === '/video/proxy') return proxyVideoMedia(req, res, request.searchParams.get('url') || '', 0);
  if (request.pathname === '/video/playback') return resolveYandexVideo(res, request.searchParams.get('url') || '');
  if (request.pathname === '/sports/media') {
    var mediaId = request.searchParams.get('id') || '';
    if (!/^\d{1,12}$/.test(mediaId)) return json(res, 400, { error: 'invalid_media' });
    return proxyPublicJson(res, 'https://news.sportbox.ru/api/v5/media/' + mediaId);
  }
  if (request.pathname === '/sports/playback') {
    if (request.searchParams.get('channel') === 'matchtv')
      return resolveSportPlayback(res, 'https://video.matchtv.ru/iframe/channel/106');
    var playbackMediaId = request.searchParams.get('id') || '';
    if (!/^\d{1,12}$/.test(playbackMediaId)) return json(res, 400, { error: 'invalid_media' });
    return resolveSportMedia(res, playbackMediaId);
  }
  if (request.pathname === '/iptv/playlist') {
    var playlist = iptv.playlistUrl(request.searchParams.get('url') || '');
    if (!playlist) return json(res, 400, { error: 'invalid_playlist_url', message: 'РЈРєР°Р¶РёС‚Рµ Р·Р°С‰РёС‰С‘РЅРЅС‹Р№ Р°РґСЂРµСЃ РїР»РµР№Р»РёСЃС‚Р° M3U.' });
    return fetchOnce(playlist, '', function (error, result) {
      if (error || !result || result.status !== 200) return json(res, 502, { error: 'playlist_unavailable', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ IPTV-РїР»РµР№Р»РёСЃС‚.' });
      var parsed = iptv.parsePlaylist(result.body.toString('utf8'));
      if (parsed.error) return json(res, 400, { error: parsed.error, message: parsed.error === 'playlist_too_large' ? 'IPTV-РїР»РµР№Р»РёСЃС‚ СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕР№.' : 'Р¤Р°Р№Р» РЅРµ РїРѕС…РѕР¶ РЅР° РїР»РµР№Р»РёСЃС‚ M3U.' });
      return json(res, 200, parsed);
    });
  }
  if (request.pathname === '/iptv/probe') {
    var stream = iptv.streamUrl(request.searchParams.get('url') || '');
    if (!stream) return json(res, 400, { error: 'invalid_stream', message: 'РђРґСЂРµСЃ РїРѕС‚РѕРєР° РЅРµРґРѕСЃС‚СѓРїРµРЅ.' });
    return fetchOnce(stream, '', function (error, result) {
      if (error || !result || result.status !== 200 || !iptv.isHlsManifest(result.body.toString('utf8')))
        return json(res, 502, { error: 'stream_unavailable', message: 'РџРѕС‚РѕРє СЃРµР№С‡Р°СЃ РЅРµРґРѕСЃС‚СѓРїРµРЅ. РџРѕРїСЂРѕР±СѓР№С‚Рµ РґСЂСѓРіРѕР№ РєР°РЅР°Р».' });
      return json(res, 200, { url: stream });
    });
  }
  if (request.pathname === '/kinozal/session/refresh') {
    return verifySession(function (result) {
      if (result.status === 200) return sendSessionResult(res, result);
      var credentials = savedLogin();
      if (!credentials || result.error !== 'torrent_session_unavailable')
        return sendSessionResult(res, result);
      if (Date.now() - lastAutoLoginAt < 10 * 60 * 1000) return sendSessionResult(res, result);
      lastAutoLoginAt = Date.now();
      loginToMirror(credentials.username, credentials.password, function (error, session) {
        if (error) return json(res, error.message === 'login_failed' ? 401 : 503,
          { error: error.message, message: error.message === 'login_failed' ? 'РЎРѕС…СЂР°РЅС‘РЅРЅС‹Р№ РїР°СЂРѕР»СЊ РљРёРЅРѕР·Р°Р»Р° Р±РѕР»СЊС€Рµ РЅРµ РїРѕРґС…РѕРґРёС‚. Р’РІРµРґРёС‚Рµ РµРіРѕ СЃРЅРѕРІР° РІ В«РђРєРєР°СѓРЅС‚В».' :
            error.message === 'kinozal_rate_limited' ? 'РљРёРЅРѕР·Р°Р» РІСЂРµРјРµРЅРЅРѕ РѕРіСЂР°РЅРёС‡РёР» РІС…РѕРґ. РџРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ.' : 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ РІС…РѕРґ СЃ С‚РµР»РµРІРёР·РѕСЂР°.' });
        try { saveLogin(session, credentials, true); }
        catch (_) { return json(res, 500, { error: 'save_failed', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РЅРѕРІС‹Р№ РІС…РѕРґ РЅР° С‚РµР»РµРІРёР·РѕСЂРµ.' }); }
        verifySession(function (newResult) { sendSessionResult(res, newResult); });
      });
    });
  }
  var target = upstream(request.pathname, request.searchParams, activeHost);
  if (target === null) return json(res, 404, { error: 'not_found' });
  if (target === false) return json(res, 400, { error: 'invalid_request' });
  fetchRoute(request.pathname, request.searchParams, activeHost, true, function (error, result) {
    if (error && error.message === 'cookies_missing') return json(res, 503, { error: 'cookies_missing', message: 'РћР±РЅРѕРІРёС‚Рµ cookies Kinozal РЅР° TV.' });
    if (error) return json(res, 502, error.message === 'upstream_connection' ? connectionError() :
      { error: error.message, message: 'РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРєР»СЋС‡РёС‚СЊСЃСЏ Рє Kinozal.' });
    if (challenged(result)) return json(res, 503, { error: 'cloudflare_challenge', message: 'Cloudflare С‚СЂРµР±СѓРµС‚ РѕР±РЅРѕРІРёС‚СЊ СЃРµСЃСЃРёСЋ Kinozal.' });
    if (result.status === 429) return json(res, 503, { error: 'kinozal_rate_limited', message: request.pathname === '/kinozal/torrent' ?
      'РљРёРЅРѕР·Р°Р» РІСЂРµРјРµРЅРЅРѕ РѕРіСЂР°РЅРёС‡РёР» Р·Р°РіСЂСѓР·РєСѓ torrent. РџРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ.' : 'РљРёРЅРѕР·Р°Р» РІСЂРµРјРµРЅРЅРѕ РѕРіСЂР°РЅРёС‡РёР» Р·Р°РїСЂРѕСЃС‹ (HTTP 429). РџРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ.' });
    if (result.status !== 200) return json(res, 502, { error: 'upstream_http', status: result.status });
    var torrent = request.pathname === '/kinozal/torrent';
    var image = request.pathname === '/kinozal/image';
    if (torrent && (result.body[0] !== 0x64 || result.body.indexOf(Buffer.from('4:info')) < 0))
      return json(res, 502, { error: 'invalid_torrent_response', message: 'Kinozal РЅРµ РІРµСЂРЅСѓР» .torrent.' });
    var mime = image ? imageType(result.body) : '';
    if (image && !mime) return json(res, 502, { error: 'invalid_image_response' });
    if (!torrent && !image && loginBody(result.body))
      return json(res, 503, { error: 'session_unavailable', message: 'РљРёРЅРѕР·Р°Р» С‚СЂРµР±СѓРµС‚ РїРѕРІС‚РѕСЂРЅС‹Р№ РІС…РѕРґ.' });
    if (!result.cached && result.cacheKey && result.cacheGeneration === cacheGeneration) {
      try { cache.put(result.cacheKey, request.pathname === '/kinozal/torrent' ? 'torrent' : 'page', result.body, cachePolicy.ttl(request.pathname)); }
      catch (error) { console.warn('Seena cache write failed: ' + (error.code || error.message)); }
    }
    res.writeHead(200, { 'Content-Type': torrent ? 'application/x-bittorrent' : image ? mime : 'text/html; charset=windows-1251',
      'Content-Length': result.body.length, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store',
      'X-Seena-Cache': result.cached ? 'HIT' : 'MISS' });
    res.end(result.body);
  });
}).listen(port, '127.0.0.1', function () { console.log('Seena Kinozal helper listening on 127.0.0.1:' + port); });













