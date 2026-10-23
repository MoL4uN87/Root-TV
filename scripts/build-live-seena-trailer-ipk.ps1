param(
    [string]$BackupRoot = "$HOME\Documents\ChatGPT\Seena-WebOS-Backup-20261023-212502",
    [switch]$NoBuild
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$App = Join-Path $BackupRoot 'app'
$Trailer = Join-Path $App 'trailer-youtube.html'
$AppInfo = Join-Path $App 'appinfo.json'
if (!(Test-Path -LiteralPath $Trailer -PathType Leaf)) { throw "Trailer file not found: $Trailer" }
if (!(Test-Path -LiteralPath $AppInfo -PathType Leaf)) { throw "App manifest not found: $AppInfo" }
$Manifest = Get-Content -LiteralPath $AppInfo -Raw | ConvertFrom-Json
if ($Manifest.id -ne 'com.seena.webos' -or $Manifest.version -ne '0.3.33') {
    throw "Expected installed Seena webOS 0.3.33, found $($Manifest.id) $($Manifest.version)"
}
function Replace-Once([string]$Source, [string]$Old, [string]$New) {
    $Hits = [regex]::Matches($Source,[regex]::Escape($Old)).Count
    if ($Hits -ne 1) { throw "Patch anchor found $Hits times, expected 1: $($Old.Substring(0,[Math]::Min($Old.Length,55)))" }
    return $Source.Replace($Old,$New)
}
$Text = [IO.File]::ReadAllText($Trailer).Replace(([string][char]13+[char]10),([string][char]10))
$Fixed = $Text
if (!$Text.Contains('id="trailer-tap-surface"')) {
    $Before = '    #player{position:absolute;inset:0;width:100%;height:100%}'
    $After = @'
    #player{position:absolute;inset:0;width:100%;height:100%}
    /* Catch taps before the YouTube iframe can turn them into playback toggles.
       Preserve its bottom native controls/settings strip. */
    #trailer-tap-surface{position:absolute;top:0;left:0;right:0;bottom:55px;z-index:7;
      background:transparent;cursor:pointer;outline:none}
    #remote-controls[hidden]{display:none}
'@
    $Fixed = Replace-Once $Fixed $Before $After
    $Before = '  <div id="player"></div>'
    $After = @'
  <div id="player"></div>
  <div id="trailer-tap-surface" tabindex="0" role="button"
    aria-label="Показать или скрыть управление трейлером"></div>
'@
    $Fixed = Replace-Once $Fixed $Before $After
    $Before = "      var toggleButton = document.getElementById('toggle');"
    $After = @'
      var toggleButton = document.getElementById('toggle');
      var tapSurface = document.getElementById('trailer-tap-surface');
      var remoteControls = document.getElementById('remote-controls');
'@
    $Fixed = Replace-Once $Fixed $Before $After
    $Before = '      function togglePlayback() {'
    $After = @'
      function toggleControls() {
        // Do not change the YouTube playback state when showing/hiding Seena's HUD.
        if (!languageMenu.hidden || !qualityHelp.hidden) return;
        remoteControls.hidden = !remoteControls.hidden;
        tapSurface.focus();
      }
      tapSurface.addEventListener('click', toggleControls);
      function togglePlayback() {
'@
    $Fixed = Replace-Once $Fixed $Before $After
    $Fixed = Replace-Once $Fixed '                toggleButton.focus();' '                tapSurface.focus();'
    $Before = "                tell('Автозапуск заблокирован. Нажмите ▶ Играть.');"
    $After = @'
                tell('Автозапуск заблокирован. Нажмите ▶ Играть.');
                remoteControls.hidden = false;
                toggleButton.focus();
'@
    $Fixed = Replace-Once $Fixed $Before $After
    $Before = @'
        } else if (code === 10252 || code === 179 || code === 32) {
          event.preventDefault();
          togglePlayback();
        } else if (code === 13 && document.activeElement !== seek &&
                   document.activeElement.tagName !== 'BUTTON') {
          event.preventDefault();
          togglePlayback();
        }
'@
    $After = @'
        } else if (code === 10252 || code === 179) {
          event.preventDefault();
          togglePlayback();
        } else if ((code === 13 || code === 32) &&
                   document.activeElement !== seek &&
                   document.activeElement.tagName !== 'BUTTON') {
          event.preventDefault();
          toggleControls();
        }
'@
    $Fixed = Replace-Once $Fixed $Before $After
}
foreach ($Needle in @('id="trailer-tap-surface"','#remote-controls[hidden]{display:none}','tapSurface.addEventListener','remoteControls.hidden = !remoteControls.hidden','player.pauseVideo()')) {
    if (!$Fixed.Contains($Needle)) { throw "Patch verification failed: $Needle" }
}
$Inline = [regex]::Match($Fixed,'(?s)<script>\s*(.*?)\s*</script>')
if (!$Inline.Success) { throw 'Embedded JavaScript not found' }
$JsCheck = Join-Path $BackupRoot 'trailer-inline-parse-check.js'
[IO.File]::WriteAllText($JsCheck,$Inline.Groups[1].Value,[Text.UTF8Encoding]::new($false))
try {
    & node --check $JsCheck
    if ($LASTEXITCODE -ne 0) { throw 'Trailer JavaScript syntax check failed' }
    & node --check (Join-Path $App 'app.js')
    if ($LASTEXITCODE -ne 0) { throw 'TV app JavaScript syntax check failed' }
} finally { Remove-Item -LiteralPath $JsCheck -Force -ErrorAction SilentlyContinue }
if ($Fixed -ne $Text) {
    $SafetyCopy = Join-Path $BackupRoot 'trailer-youtube.before-touch-fix.html'
    if (Test-Path -LiteralPath $SafetyCopy) { throw "Backup file already exists: $SafetyCopy" }
    Copy-Item -LiteralPath $Trailer -Destination $SafetyCopy
    [IO.File]::WriteAllText($Trailer,$Fixed,[Text.UTF8Encoding]::new($false))
    Write-Host "Original HTML saved: $SafetyCopy" -ForegroundColor Cyan
}
Write-Host 'TRAILER TOUCH FIX APPLIED (or already present)' -ForegroundColor Green
if ($NoBuild) { Write-Host 'IPK build skipped (-NoBuild)' -ForegroundColor Yellow; exit 0 }

# Only the allowlist enters the IPK. NEVER bundle private Kinozal config or old *.bak.
$Allowed = @('app.js','appinfo.json','index.html','model.js','styles.css',
             'icon.png','seena.svg','history.js','iptv-favorites.js',
             'ratings.js','mma-sources.js','trailer-youtube.html')
foreach ($Name in $Allowed) {
    if (!(Test-Path -LiteralPath (Join-Path $App $Name) -PathType Leaf)) { throw "Missing live TV file: $Name" }
}
$StageRoot = Join-Path $BackupRoot ('ipk-stage-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
$StageApp = Join-Path $StageRoot 'com.seena.webos'
$Dist = Join-Path $BackupRoot 'dist'
New-Item -ItemType Directory -Force -Path $StageApp,$Dist | Out-Null
foreach ($Name in $Allowed) { Copy-Item -LiteralPath (Join-Path $App $Name) -Destination (Join-Path $StageApp $Name) }
if (!(Get-Command ares-package -ErrorAction SilentlyContinue)) {
    throw 'webOS CLI ares-package not found. Install LG webOS CLI; no installation was performed.'
}
& ares-package $StageApp -o $Dist
if ($LASTEXITCODE -ne 0) { throw 'ares-package failed' }
$Result = Get-ChildItem -LiteralPath $Dist -File -Filter 'com.seena.webos_0.3.33_all.ipk' | Select-Object -First 1
if (!$Result) { throw 'No IPK output created' }
Write-Host 'WEBOS IPK BUILD SUCCESSFUL; NOT INSTALLED on television' -ForegroundColor Green
$Result | Select-Object FullName,Length,LastWriteTime
Write-Host 'Kinozal config and all old backups excluded from IPK.' -ForegroundColor Cyan
