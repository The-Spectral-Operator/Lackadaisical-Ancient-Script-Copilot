# Build Instructions

## Windows (Primary)

### Prerequisites
1. Visual Studio 2022 Build Tools (C17 + C++20)
2. NASM 2.16.03 — https://www.nasm.us
3. CMake 3.28+ — https://cmake.org
4. Node.js 22.13 LTS — https://nodejs.org
5. Ollama >= 0.16 — https://ollama.com/download

### Build
```powershell
cd decipher-copilot
pwsh scripts/build.ps1
```

### Run
```powershell
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Pull model and start server
ollama pull gemma4:e4b
cd decipher-copilot/server
npm install
node src/index.js
```

Open http://127.0.0.1:7340 in a Chromium-based browser.

## Linux (Optional)

### Prerequisites
1. GCC 13+ or Clang 18+
2. NASM 2.16+
3. CMake 3.28+
4. Node.js 22.13 LTS
5. Ollama >= 0.16

### Build
```bash
cd decipher-copilot
chmod +x scripts/build.sh
./scripts/build.sh
```

### Run
```bash
ollama serve &
ollama pull gemma4:e4b
cd decipher-copilot/server
npm install
node src/index.js
```

## Model Setup

```bash
# Required (default)
ollama pull gemma4:e4b

# Optional hotswap models
ollama pull gemma4:e12b
ollama pull gpt-oss:20b
ollama pull gpt-oss:120b
ollama pull nomic-embed-text
```
