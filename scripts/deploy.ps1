# Deploy CataPreço -> CT 160 (root@192.168.0.160)
# Uso: powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 [-Target user@host] [-NoBuild]
param(
  [string]$Target = "root@192.168.0.160",
  [string]$Dir    = "/opt/catapreco",
  [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root

$pkg = Join-Path $env:TEMP "catapreco-deploy.tar.gz"
if (Test-Path $pkg) { Remove-Item $pkg }

Write-Host "== empacotando =="
tar -czf $pkg --exclude=node_modules --exclude=.next --exclude=.git --exclude=.env --exclude=test-results .
ssh $Target "mkdir -p $Dir"

Write-Host "== enviando =="
scp $pkg "${Target}:${Dir}/app.tar.gz"

$buildFlag = if ($NoBuild) { "" } else { "--build" }
Write-Host "== build & up =="
# migrate precisa estar na mesma build para levar o schema atual
$buildServices = if ($NoBuild) { "" } else { "migrate web worker" }
$script = @"
cd $Dir
tar -xzf app.tar.gz
if [ ! -f .env ]; then cp .env.example .env; DEB=`$(openssl rand -hex 16); sed -i `"s/DB_PASSWORD=.*/DB_PASSWORD=`$DEB/`" .env; fi
if [ -n "$buildServices" ]; then docker compose build $buildServices; fi
docker compose up -d
docker compose ps
"@
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
ssh $Target "echo $b64 | base64 -d | bash"

Write-Host "== status =="
ssh $Target "cd $Dir && docker compose ps"
Pop-Location
