# Genera dist-deploy/portal-cumplidos-server.zip listo para subir al servidor (sin secretos ni node_modules)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$outDir = Join-Path $root "dist-deploy"
$staging = Join-Path $outDir "portal-cumplidos"
$zipPath = Join-Path $outDir "portal-cumplidos-server.zip"

$excludeDirs = @(
  "node_modules", "dist", "uploads", "dist-deploy", ".git", ".cursor",
  "agent-transcripts", "terminals", "mcps"
)
$excludeFiles = @(
  ".env", ".env.docker", ".env.local",
  "Portal_Cumplidos.html",
  "cursor_logistics_management_portal_deve.md",
  "portal_cumplidos_doc.md",
  "docker-compose.dev.yml"
)

function Should-SkipPath([string]$rel) {
  $norm = $rel -replace "\\", "/"
  foreach ($d in $excludeDirs) {
    if ($norm -match "(^|/)$([regex]::Escape($d))(/|$)") { return $true }
  }
  $name = Split-Path -Leaf $rel
  if ($excludeFiles -contains $name) { return $true }
  if ($name -match "\.zip$") { return $true }
  return $false
}

if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

$items = @(
  "backend", "frontend", "scripts", "docker-compose.yml",
  "package.json", ".env.docker.example",
  ".dockerignore", ".gitignore"
)
foreach ($item in $items) {
  $src = Join-Path $root $item
  if (-not (Test-Path $src)) { continue }
  if ((Get-Item $src).PSIsContainer) {
    Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring($root.Length + 1)
      if (Should-SkipPath $rel) { return }
      $dest = Join-Path $staging $rel
      $destParent = Split-Path -Parent $dest
      if (-not (Test-Path $destParent)) { New-Item -ItemType Directory -Path $destParent -Force | Out-Null }
      Copy-Item $_.FullName $dest -Force
    }
  } else {
    Copy-Item $src (Join-Path $staging $item) -Force
  }
}

# README opcional en servidor
if (Test-Path (Join-Path $root "README.md")) {
  Copy-Item (Join-Path $root "README.md") (Join-Path $staging "README.md") -Force
}

if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "Paquete listo: $zipPath"
Write-Host ""
Write-Host "En el servidor:"
Write-Host "  1. unzip portal-cumplidos-server.zip -d /ruta/portal"
Write-Host "  2. cp .env.docker.example .env.docker   # editar claves y URLs"
Write-Host "  3. docker compose --env-file .env.docker up -d --build api web"
Write-Host ""
Write-Host "NO subir: .env.docker con claves, node_modules, frontend/dist, backend/uploads"
