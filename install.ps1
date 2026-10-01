param(
    [string]$Tv = 'root@192.168.1.95',
    [string]$Key = (Join-Path $env:USERPROFILE '.ssh\lg_webos_codex')
)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    foreach ($file in @('runtime/curl-impersonate-a55', 'runtime/armhf-runtime/ld-linux-armhf.so.3', 'helper/seena-kinozal-helper.js', 'seena-0.3.8/com.seena.webos/appinfo.json')) {
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
    CopyToTv 'helper/seena-helper-start' '/var/lib/webosbrew/init.d/seena-helper'
    if (Test-Path -LiteralPath 'diagnostics/kinozal-cookies-refresh.json') {
        CopyToTv 'diagnostics/kinozal-cookies-refresh.json' '/var/lib/webosbrew/seena-helper/cookies.json'
    }
    Remote 'ln -sfn /var/lib/webosbrew/seena-helper/armhf-runtime/ld-linux-armhf.so.3 /home/r/l; chmod 700 /var/lib/webosbrew/seena-helper/curl-impersonate-a55 /var/lib/webosbrew/init.d/seena-helper; test ! -f /var/lib/webosbrew/seena-helper/cookies.json || chmod 600 /var/lib/webosbrew/seena-helper/cookies.json; LD_LIBRARY_PATH=/var/lib/webosbrew/seena-helper/armhf-runtime:/var/lib/webosbrew/seena-helper /var/lib/webosbrew/seena-helper/curl-impersonate-a55 -V >/dev/null 2>&1'
    Remote "pkill -f '^/usr/bin/node /var/lib/webosbrew/seena-helper/seena-kinozal-helper.js$' || true; /var/lib/webosbrew/init.d/seena-helper; sleep 2; curl -fsS --max-time 30 -o /dev/null http://127.0.0.1:8787/kinozal/top"
    CopyToTv 'seena-0.3.8/com.seena.webos/.' '/media/developer/apps/usr/palm/applications/com.seena.webos/' $true
    Remote 'luna-send -n 1 -f luna://com.webos.applicationManager/launch "{\"id\":\"com.seena.webos\"}"'
    Write-Output 'Seena 0.3.8 and persistent Kinozal helper installed.'
} finally {
    Pop-Location
}
