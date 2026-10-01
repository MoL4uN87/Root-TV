// Run on the TV: node tv-probe.js /path/to/private-cookies.json [profile] [url]
// Only the HTTP status and selected, non-sensitive response metadata are printed.
'use strict';
var fs = require('fs');
var cp = require('child_process');
var cookies = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
var names = ['uid', 'pass', 'cf_clearance'];
var header = names.filter(function (name) { return cookies[name]; }).map(function (name) {
  return name + '=' + String(cookies[name]);
}).join('; ');
if (!header || /[\r\n"]/.test(header)) throw new Error('Cookie file is missing fields or contains invalid data');
var config = 'header = "Cookie: ' + header.replace(/\\/g, '\\\\') + '"\n';
var ua = process.argv[5] || '';
if (ua) {
  if (/[\r\n"]/.test(ua)) throw new Error('Invalid User-Agent');
  config += 'user-agent = "' + ua + '"\n';
}
var profile = process.argv[3] || 'chrome150';
var url = process.argv[4] || 'https://kinozal.guru/top.php';
var args = ['--config', '-', '--impersonate', profile, '--ech', 'false', '--ipv4', '--connect-timeout', '10', '--max-time', '25',
  '--silent', '--show-error', '--output', '/dev/null', '--dump-header', '/tmp/seena-probe-headers-' + process.pid,
  '--write-out', '%{http_code} %{http_version} %{remote_ip} %{url_effective}', url];
if (process.argv[6] === 'h3') args.splice(6, 0, '--http3-only');
var root = process.env.SEENA_PROBE_ROOT || '/tmp/curlimp223';
var env = Object.assign({}, process.env, { LD_LIBRARY_PATH: (process.env.SEENA_PROBE_LIB || '/tmp/armhf-runtime') + ':' + root });
var result = cp.spawnSync(root + '/curl-impersonate-a55', args, { input: config, encoding: 'utf8', env: env });
var headerPath = '/tmp/seena-probe-headers-' + process.pid;
var raw = '';
try { raw = fs.readFileSync(headerPath, 'utf8'); } finally { try { fs.unlinkSync(headerPath); } catch (_) {} }
var selected = raw.split(/\r?\n/).filter(function (line) { return /^(HTTP\/|cf-mitigated:|cf-ray:|server:|location:|content-type:)/i.test(line); });
console.log('curl_exit=' + result.status);
console.log('response=' + (result.stdout || '').trim());
selected.forEach(function (line) { console.log(line); });
if (result.error) console.log('spawn_error=' + result.error.code);
if (result.stderr) {
  var errors = result.stderr.split(/\r?\n/).filter(function (line) { return line && !/\/lib\/libSegFault\.so/.test(line); });
  if (errors.length) console.log('curl_error=' + errors.join(' | ').slice(0, 300));
}
