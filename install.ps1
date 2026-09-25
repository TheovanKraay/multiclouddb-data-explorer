# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
#
# MultiCloudDB Data Explorer installer (Windows).
# Downloads and runs the latest .msi installer.
#
#   irm https://raw.githubusercontent.com/TheovanKraay/multiclouddb-data-explorer/main/install.ps1 | iex
#
$ErrorActionPreference = 'Stop'

$Repo = 'TheovanKraay/multiclouddb-data-explorer'
$Api  = "https://api.github.com/repos/$Repo/releases/latest"

Write-Host "==> Finding the latest release..." -ForegroundColor Blue
$release = Invoke-RestMethod -Uri $Api -Headers @{ 'User-Agent' = 'installer' }

# Prefer .msi; fall back to .exe (NSIS) if that's what the release ships.
$asset = $release.assets | Where-Object { $_.name -like '*.msi' } | Select-Object -First 1
if (-not $asset) {
  $asset = $release.assets | Where-Object { $_.name -like '*-setup.exe' -or $_.name -like '*.exe' } | Select-Object -First 1
}
if (-not $asset) { throw "No .msi or .exe installer found in the latest release." }

$out = Join-Path $env:TEMP $asset.name
Write-Host "==> Downloading $($asset.browser_download_url)" -ForegroundColor Blue
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $out -UseBasicParsing

Write-Host "==> Launching the installer..." -ForegroundColor Blue
if ($out -like '*.msi') {
  Start-Process msiexec.exe -ArgumentList "/i `"$out`"" -Wait
} else {
  Start-Process -FilePath $out -Wait
}

Write-Host "==> Done." -ForegroundColor Blue
