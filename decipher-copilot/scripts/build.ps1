# Ancient Script Decipherment Copilot - Windows Build Script
# Prerequisites: VS 2022 Build Tools, NASM 2.16.03, CMake 3.28, Node 22.13, Ollama >= 0.16

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "`n=== Ancient Script Decipherment Copilot - Build ===" -ForegroundColor Cyan

# 1) Configure & build native core
Write-Host "`n[1/5] Building native core (C/C++/NASM)..." -ForegroundColor Yellow
Push-Location $Root
if (Test-Path build) { Remove-Item -Recurse -Force build }
cmake --preset windows-release
cmake --build --preset windows-release --target decipher_core --parallel
ctest --preset windows-release
Pop-Location

# 2) Stage native artefacts
Write-Host "`n[2/5] Staging native artifacts..." -ForegroundColor Yellow
$nativeDir = Join-Path $Root "server\native"
New-Item -ItemType Directory -Force -Path $nativeDir | Out-Null
Copy-Item (Join-Path $Root "build\windows-release\core\Release\decipher-core.dll") $nativeDir -ErrorAction SilentlyContinue
Copy-Item (Join-Path $Root "build\windows-release\core\decipher-core.dll") $nativeDir -ErrorAction SilentlyContinue

# 3) Install Node deps
Write-Host "`n[3/5] Installing Node.js dependencies..." -ForegroundColor Yellow
Push-Location (Join-Path $Root "server")
npm ci --prefer-offline --no-audit --fund=false
Pop-Location

# 4) Run Node tests
Write-Host "`n[4/5] Running Node.js tests..." -ForegroundColor Yellow
Push-Location (Join-Path $Root "server")
npm test
Pop-Location

# 5) Create distribution
Write-Host "`n[5/5] Creating distribution..." -ForegroundColor Yellow
$dist = Join-Path $Root "dist\decipher-copilot"
if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }
New-Item -ItemType Directory -Force $dist | Out-Null
Copy-Item -Recurse (Join-Path $Root "webui") (Join-Path $dist "webui")
Copy-Item -Recurse (Join-Path $Root "server\src") (Join-Path $dist "server\src")
Copy-Item -Recurse (Join-Path $Root "server\migrations") (Join-Path $dist "server\migrations")
Copy-Item (Join-Path $Root "server\package.json") (Join-Path $dist "server\package.json")
if (Test-Path $nativeDir) { Copy-Item -Recurse $nativeDir (Join-Path $dist "native") }
New-Item -ItemType Directory -Force (Join-Path $dist "data\databases") | Out-Null
New-Item -ItemType Directory -Force (Join-Path $dist "data\attachments") | Out-Null

Write-Host "`n=== Build Complete ===" -ForegroundColor Green
Write-Host "Distribution: $dist"
Write-Host "Run: node $dist\server\src\index.js --data-dir $dist\data"
Write-Host "Default model: gemma4:e4b (ensure Ollama is running with model pulled)"
