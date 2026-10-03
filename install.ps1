param(
    [string]$Tv = 'root@192.168.1.95',
    [string]$Key = (Join-Path $env:USERPROFILE '.ssh\lg_webos_codex')
)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    foreach ($file in @('runtime/curl-impersonate-a55', 'runtime/armhf-runtime/ld-linux-armhf.so.3', 'helper/seena-kinozal-helper.js', 'helper/seena-helper-watch', 'helper/seena-restart-app', 'seena-0.3.19/com.seena.webos/appinfo.json')) {
        if (-not (Test-Path -LiteralPath $file)) { throw "Missing $file" }
    }
    if (-not (Test-Path -LiteralPath $Key)) { throw "Missing SSH key: $Key" }
    function Remote([string]$Command) {
        & ssh -F NUL -i $Key -o BatchMode=yes $Tv $Command
        if ($LASTEXITCODE -ne 0) { throw "TV command failed ($LASTEXITCODE)" }
    }
    function CopyToTv([string]$Source, [string]$Destination, [bool]$Recursive = $false) {
        if ($Recursive) { & scp -F NUL -i $Key -r $Source "${Tv}:$Destination" }
        else { & scp -F NUL -i $Key $Source "${Tv}:$Destination" }
        if ($LASTEXITCODE -ne 0) { throw "SCP failed ($LASTEXITCODE)" }
    }
    Remote 'mkdir -p /var/lib/webosbrew/seena-helper/armhf-runtime /home/r; chmod 700 /var/lib/webosbrew/seena-helper /home/r; test -d /var/lib/webosbrew/seena-helper/seena-0.3.7-backup || cp -a /media/developer/apps/usr/palm/applications/com.seena.webos /var/lib/webosbrew/seena-helper/seena-0.3.7-backup'
    CopyToTv 'runtime/armhf-runtime/.' '/var/lib/webosbrew/seena-helper/armhf-runtime/' $true
    CopyToTv 'runtime/curl-impersonate-a55' '/var/lib/webosbrew/seena-helper/curl-impersonate-a55'
    CopyToTv 'helper/seena-kinozal-helper.js' '/var/lib/webosbrew/seena-helper/seena-kinozal-helper.js'
    CopyToTv 'helper/seena-helper-watch' '/var/lib/webosbrew/seena-helper/seena-helper-watch'
    CopyToTv 'helper/seena-restart-app' '/var/lib/webosbrew/seena-helper/seena-restart-app'
    CopyToTv 'helper/seena-helper-start' '/var/lib/webosbrew/init.d/seena-helper'
    if (Test-Path -LiteralPath 'diagnostics/kinozal-cookies-refresh.json') {
        CopyToTv 'diagnostics/kinozal-cookies-refresh.json' '/var/lib/webosbrew/seena-helper/cookies.json'
    }
    Remote 'ln -sfn /var/lib/webosbrew/seena-helper/armhf-runtime/ld-linux-armhf.so.3 /home/r/l; chmod 700 /var/lib/webosbrew/seena-helper/curl-impersonate-a55 /var/lib/webosbrew/init.d/seena-helper; test ! -f /var/lib/webosbrew/seena-helper/cookies.json || chmod 600 /var/lib/webosbrew/seena-helper/cookies.json; LD_LIBRARY_PATH=/var/lib/webosbrew/seena-helper/armhf-runtime:/var/lib/webosbrew/seena-helper /var/lib/webosbrew/seena-helper/curl-impersonate-a55 -V >/dev/null 2>&1'
    Remote 'pkill -f ''^/usr/bin/node /var/lib/webosbrew/seena-helper/seena-kinozal-helper.js$'' || true; i=0; while pgrep -f ''^/usr/bin/node /var/lib/webosbrew/seena-helper/seena-kinozal-helper.js$'' >/dev/null; do i=$((i+1)); if [ "$i" -ge 10 ]; then exit 1; fi; sleep 1; done; /var/lib/webosbrew/init.d/seena-helper; i=0; until curl -fsS --max-time 2 -o /dev/null http://127.0.0.1:8787/health 2>/dev/null; do i=$((i+1)); if [ "$i" -ge 20 ]; then exit 1; fi; sleep 1; done'
    CopyToTv 'seena-0.3.19/com.seena.webos/.' '/media/developer/apps/usr/palm/applications/com.seena.webos/' $true
    Remote 'chmod 755 /media/developer/apps/usr/palm/applications/com.seena.webos; chmod 644 /media/developer/apps/usr/palm/applications/com.seena.webos/*; su wam -s /bin/sh -c ''head -c 1 /media/developer/apps/usr/palm/applications/com.seena.webos/index.html >/dev/null'''
    Remote 'sh /var/lib/webosbrew/seena-helper/seena-restart-app'
    Write-Output 'Seena 0.3.19 and persistent Kinozal helper installed.'
} finally {
    Pop-Location
}
