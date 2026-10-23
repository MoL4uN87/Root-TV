param([string]$BackupRoot="$HOME\Documents\ChatGPT\Seena-WebOS-Backup-20261023-212502",[switch]$NoBuild)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$app=Join-Path $BackupRoot 'app'
$jsFile=Join-Path $app 'app.js'
$cssFile=Join-Path $app 'styles.css'
$trailer=Join-Path $app 'trailer-youtube.html'
$info=Join-Path $app 'appinfo.json'
foreach($f in @($jsFile,$cssFile,$trailer,$info)){if(!(Test-Path -LiteralPath $f -PathType Leaf)){throw "Missing live TV source: $f"}}
$manifest=Get-Content $info -Raw | ConvertFrom-Json
if($manifest.id -ne 'com.seena.webos' -or $manifest.version -ne '0.3.33'){throw 'Unexpected Seena ID/version; not patching'}
$trailerText=[IO.File]::ReadAllText($trailer)
if(!$trailerText.Contains('id="trailer-tap-surface"') -or !$trailerText.Contains('id="back"')){
 throw 'The working trailer tap fix or inner Back button is missing; refusing patch'
}
function Replace-One([string]$s,[string]$old,[string]$new){
 $n=[regex]::Matches($s,[regex]::Escape($old)).Count
 if($n -ne 1){throw "Expected one anchor, found $n : $old"}
 return $s.Replace($old,$new)
}
$js=[IO.File]::ReadAllText($jsFile)
$css=[IO.File]::ReadAllText($cssFile)
$patchedJs=$js.Contains('classList.toggle("seena-youtube-trailer"')
$patchedCss=$css.Contains('.web-player-view.seena-youtube-trailer .web-player-top')
if($patchedJs -ne $patchedCss){throw 'Partial prior patch: refusing changes'}
if(!$patchedJs){
 $old='i.youtubeTrailerActive=Boolean(a&&0===e.indexOf(j+"/trailer/youtube?id="))'
 $js=Replace-One $js $old ($old+',o("web-player-view").classList.toggle("seena-youtube-trailer",i.youtubeTrailerActive)')
 $old='o("web-player-view").hidden=!1,o("web-player-back").focus()'
 $js=Replace-One $js $old 'o("web-player-view").hidden=!1,(i.youtubeTrailerActive?o("web-player-frame"):o("web-player-back")).focus()'
 $old='i.youtubeTrailerActive=!1,i.trailerFilm=null'
 $js=Replace-One $js $old 'i.youtubeTrailerActive=!1,o("web-player-view").classList.remove("seena-youtube-trailer"),i.trailerFilm=null'
 $old='.web-player-top{height:82px;flex:none;display:flex;align-items:center;padding:14px 28px;background:#08101f;border-bottom:1px solid #243653}'
 $css=Replace-One $css $old ($old+[Environment]::NewLine+'.web-player-view.seena-youtube-trailer .web-player-top{display:none}')
}
foreach($x in @('classList.toggle("seena-youtube-trailer",i.youtubeTrailerActive)','classList.remove("seena-youtube-trailer")','(i.youtubeTrailerActive?o("web-player-frame"):o("web-player-back")).focus()')){
 if(!$js.Contains($x)){throw "JS patch validation failed: $x"}
}
if(!$css.Contains('.web-player-view.seena-youtube-trailer .web-player-top{display:none}')){throw 'CSS validation failed'}
$syntaxFile=Join-Path $BackupRoot 'seena-trailer-topbar-check.js'
[IO.File]::WriteAllText($syntaxFile,$js,[Text.UTF8Encoding]::new($false))
try{
 & node --check $syntaxFile
 if($LASTEXITCODE -ne 0){throw 'JavaScript syntax check failed before changing sources'}
}finally{Remove-Item -LiteralPath $syntaxFile -ErrorAction SilentlyContinue}
if(!$patchedJs){
 $backup=Join-Path $BackupRoot ('before-topbar-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
 New-Item -ItemType Directory -Force -Path $backup | Out-Null
 Copy-Item $jsFile (Join-Path $backup 'app.js')
 Copy-Item $cssFile (Join-Path $backup 'styles.css')
 try{
  [IO.File]::WriteAllText($jsFile,$js,[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText($cssFile,$css,[Text.UTF8Encoding]::new($false))
 }catch{
  Copy-Item (Join-Path $backup 'app.js') $jsFile -Force
  Copy-Item (Join-Path $backup 'styles.css') $cssFile -Force
  throw
 }
 Write-Host "Original app.js/styles.css backed up: $backup" -ForegroundColor Cyan
}
Write-Host 'TV YouTube trailer: top header hidden, iframe fullscreen; playback controls preserved' -ForegroundColor Green
if($NoBuild){Write-Host 'NoBuild: no IPK, no installation';exit 0}
$allow=@('app.js','appinfo.json','index.html','model.js','styles.css','icon.png','seena.svg','history.js','iptv-favorites.js','ratings.js','mma-sources.js','trailer-youtube.html')
foreach($name in $allow){if(!(Test-Path -LiteralPath (Join-Path $app $name) -PathType Leaf)){throw "Missing required app file: $name"}}
$stage=Join-Path $BackupRoot ('topbar-stage-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
$stageApp=Join-Path $stage 'com.seena.webos'
$dist=Join-Path $BackupRoot 'dist-topbar'
New-Item -ItemType Directory -Force -Path $stageApp,$dist | Out-Null
foreach($name in $allow){Copy-Item -LiteralPath (Join-Path $app $name) -Destination (Join-Path $stageApp $name)}
if(!(Get-Command ares-package -ErrorAction SilentlyContinue)){throw 'ares-package missing; TV was not modified'}
& ares-package $stageApp -o $dist
if($LASTEXITCODE -ne 0){throw 'webOS IPK package build failed'}
$ipk=Join-Path $dist 'com.seena.webos_0.3.33_all.ipk'
if(!(Test-Path -LiteralPath $ipk -PathType Leaf)){throw 'IPK not found after packaging'}
Write-Host 'WEBOS TOPBAR BUILD SUCCESSFUL. Nothing installed on TV.' -ForegroundColor Green
Get-Item $ipk | Select-Object FullName,Length,LastWriteTime
Write-Host ('SHA256: '+(Get-FileHash $ipk -Algorithm SHA256).Hash.ToLower())
Write-Host 'Only approved app files included: configs, cookies and *.bak excluded.' -ForegroundColor Cyan
