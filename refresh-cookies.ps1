param(
    [string]$Tv = 'root@192.168.1.95',
    [string]$Key = (Join-Path $env:USERPROFILE '.ssh\lg_webos_codex')
)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    $running = Get-Process browser -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*\Yandex\YandexBrowser\Application\browser.exe' }
    if ($running) { throw 'Close Yandex Browser completely, including background processes, before refreshing cookies.' }
    $source = Join-Path $env:LOCALAPPDATA 'Yandex\YandexBrowser\User Data\Default\Network\Cookies'
    Copy-Item -LiteralPath $source -Destination 'diagnostics\Cookies-yandex-refresh' -Force
    & py -3.12 'diagnostics\decrypt-refresh.py'
    if ($LASTEXITCODE -ne 0) { throw 'Cookie decryption failed.' }
    & scp -F NUL -i $Key 'diagnostics\kinozal-cookies-refresh.json' "${Tv}:/var/lib/webosbrew/seena-helper/cookies.json"
    if ($LASTEXITCODE -ne 0) { throw 'Cookie transfer failed.' }
    & ssh -F NUL -i $Key -o BatchMode=yes $Tv 'chmod 600 /var/lib/webosbrew/seena-helper/cookies.json; curl -fsS --max-time 30 -o /dev/null -w "Kinozal HTTP %{http_code}\n" http://127.0.0.1:8787/kinozal/top'
    if ($LASTEXITCODE -ne 0) { throw 'Cookie transfer completed, but Kinozal probe failed.' }
} finally {
    Pop-Location
}
