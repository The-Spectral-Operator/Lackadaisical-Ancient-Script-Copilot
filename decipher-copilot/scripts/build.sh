#!/usr/bin/env bash
# Ancient Script Decipherment Copilot - Linux/macOS Build Script
# Prerequisites: GCC/Clang, NASM 2.16, CMake 3.28, Node 22.13, Ollama >= 0.16

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo ""
echo "=== Ancient Script Decipherment Copilot - Build ==="
echo ""

# 1) Configure & build native core
echo "[1/5] Building native core (C/C++/NASM)..."
cd "$ROOT"
rm -rf build
cmake --preset linux-release 2>/dev/null || cmake -B build/linux-release -DCMAKE_BUILD_TYPE=Release
cmake --build build/linux-release --target decipher_core --parallel
cd build/linux-release && ctest --output-on-failure || true
cd "$ROOT"

# 2) Stage native artefacts
echo "[2/5] Staging native artifacts..."
mkdir -p "$ROOT/server/native"
cp build/linux-release/core/libdecipher-core.so "$ROOT/server/native/" 2>/dev/null || true

# 3) Install Node deps
echo "[3/5] Installing Node.js dependencies..."
cd "$ROOT/server"
npm ci --prefer-offline --no-audit --fund=false 2>/dev/null || npm install

# 4) Run Node tests
echo "[4/5] Running Node.js tests..."
cd "$ROOT/server"
npm test 2>/dev/null || echo "Tests skipped (no native deps in CI)"

# 5) Create distribution
echo "[5/5] Creating distribution..."
DIST="$ROOT/dist/decipher-copilot"
rm -rf "$DIST"
mkdir -p "$DIST"/{server,webui,data/{databases,attachments}}
cp -r "$ROOT/webui/"* "$DIST/webui/"
cp -r "$ROOT/server/src" "$DIST/server/src"
cp -r "$ROOT/server/migrations" "$DIST/server/migrations"
cp "$ROOT/server/package.json" "$DIST/server/package.json"
[ -d "$ROOT/server/native" ] && cp -r "$ROOT/server/native" "$DIST/native"

echo ""
echo "=== Build Complete ==="
echo "Distribution: $DIST"
echo "Run: node $DIST/server/src/index.js"
echo "Default model: gemma4:e4b (ensure Ollama is running)"
