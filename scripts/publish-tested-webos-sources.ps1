param(
  [string]$BackupRoot="$HOME\Documents\ChatGPT\Seena-WebOS-Backup-20261023-212502"
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$origin='https://github.com/MoL4uN87/Root-TV.git'
$branch='fix/webos-trailer-controls'
$src=Join-Path $BackupRoot 'app'
$helper=Join-Path $BackupRoot 'helper\seena-kinozal-helper.js'
$paths=@('app.js','appinfo.json','index.html','model.js','styles.css',
         'icon.png','seena.svg','history.js','iptv-favorites.js',
         'ratings.js','mma-sources.js','trailer-youtube.html')
foreach($name in $paths){if(!(Test-Path -LiteralPath (Join-Path $src $name) -PathType Leaf)){throw "Missing TV source: $name"}}
if(!(Test-Path -LiteralPath $helper -PathType Leaf)){throw 'Missing TV helper source'}
$manifest=Get-Content -LiteralPath (Join-Path $src 'appinfo.json') -Raw | ConvertFrom-Json
if($manifest.id -ne 'com.seena.webos' -or $manifest.version -ne '0.3.33'){throw 'Unexpected TV version or application ID'}
$appJs=Get-Content -LiteralPath (Join-Path $src 'app.js') -Raw
$css=Get-Content -LiteralPath (Join-Path $src 'styles.css') -Raw
$trailer=Get-Content -LiteralPath (Join-Path $src 'trailer-youtube.html') -Raw
$helperJs=Get-Content -LiteralPath $helper -Raw
foreach($required in @('classList.toggle("seena-youtube-trailer",i.youtubeTrailerActive)',
'classList.remove("seena-youtube-trailer")',
'(i.youtubeTrailerActive?o("web-player-frame"):o("web-player-back")).focus()')){
 if(!$appJs.Contains($required)){throw "Missing tested header fix: $required"}
}
if(!$css.Contains('.web-player-view.seena-youtube-trailer .web-player-top{display:none}')){throw 'Missing tested CSS fix'}
if(!$trailer.Contains('id="trailer-tap-surface"') -or !$trailer.Contains('remoteControls.hidden = !remoteControls.hidden')){throw 'Missing tested trailer controls'}
if(!$helperJs.Contains('/trailer/youtube')){throw 'Missing TV trailer helper route'}
foreach($p in @((Join-Path $src 'app.js'),(Join-Path $src 'model.js'),$helper)){
 & node --check $p
 if($LASTEXITCODE -ne 0){throw "Invalid JavaScript: $p"}
}
if(!(Get-Command git -ErrorAction SilentlyContinue)){throw 'Git is not available'}
$dir=Join-Path $BackupRoot ('github-publish-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
if(Test-Path -LiteralPath $dir){throw "Publish folder already exists: $dir"}
git clone --quiet --branch $branch --single-branch $origin $dir
if($LASTEXITCODE -ne 0){throw 'GitHub clone failed; original TV source was not modified'}
$repoApp=Join-Path $dir 'seena-0.3.32\com.seena.webos'
$repoHelper=Join-Path $dir 'helper\seena-kinozal-helper.js'
foreach($name in $paths){Copy-Item -LiteralPath (Join-Path $src $name) -Destination (Join-Path $repoApp $name) -Force}
Copy-Item -LiteralPath $helper -Destination $repoHelper -Force
$stagePaths=@($paths | ForEach-Object {"seena-0.3.32/com.seena.webos/$_"})+@('helper/seena-kinozal-helper.js')
git -C $dir add -- $stagePaths
if($LASTEXITCODE -ne 0){throw 'Git staging failed'}
git -C $dir diff --cached --check
if($LASTEXITCODE -ne 0){throw 'Whitespace or patch validation failed'}
$changed=@(git -C $dir diff --cached --name-only)
foreach($f in $changed){if($f -notin $stagePaths){throw "Unexpected staged path: $f"}}
if($changed.Count -eq 0){Write-Host 'The tested TV source is already identical to the GitHub branch' -ForegroundColor Cyan}
else {
 git -C $dir commit -m 'feat(webos): preserve LG-tested Seena 0.3.33 trailer UI and helper sources'
 if($LASTEXITCODE -ne 0){throw 'Commit failed'}
}
git -C $dir push origin $branch
if($LASTEXITCODE -ne 0){throw 'GitHub push failed; staged files remain in the isolated publish folder'}
$sha=(git -C $dir rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0){throw 'Unable to read published commit'}
Write-Host 'SEENA WEBOS 0.3.33 SOURCES SAVED ON GITHUB' -ForegroundColor Green
Write-Host "BRANCH: $branch"
Write-Host "COMMIT: $sha"
Write-Host "REPO: https://github.com/MoL4uN87/Root-TV/tree/$branch"
Write-Host 'No passwords, cookies, local configs, backups or APK/IPK files were staged.' -ForegroundColor Cyan
