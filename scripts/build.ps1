param(
  [string]$OutputDir = "dist"
)

$Root = Split-Path -Parent $PSScriptRoot
$Name = "1440p-video-upscaler"
$Version = (Get-Content "$Root\manifest.json" | ConvertFrom-Json).version
$ZipName = "$Name-v$version.zip"
$ZipPath = "$Root\$OutputDir\$ZipName"

New-Item -ItemType Directory -Path "$Root\$OutputDir" -Force | Out-Null

$Files = @(
  "manifest.json"
  "background.js"
  "content.js"
  "popup.html"
  "popup.js"
  "styles.css"
  "icons/icon16.png"
  "icons/icon48.png"
  "icons/icon128.png"
)

Compress-Archive -Path ($Files | ForEach-Object { "$Root\$_" }) -DestinationPath $ZipPath -Force

Write-Host "Created $ZipPath"

# Also create an unpacked copy for CWS upload
$CwsDir = "$Root\$OutputDir\cws-src"
if (Test-Path $CwsDir) { Remove-Item -Recurse -Force $CwsDir }
New-Item -ItemType Directory -Path $CwsDir | Out-Null
foreach ($f in $Files) {
  $src = "$Root\$f"
  $dst = "$CwsDir\$f"
  $parent = Split-Path -Parent $dst
  if (!(Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  Copy-Item $src $dst
}
Write-Host "Created unpacked source at $CwsDir"
