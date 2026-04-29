# Ancient Script Decipherment Copilot

A Windows-first (cross-platform aware) local AI copilot for ancient script decipherment, powered by a locally running Ollama daemon with **Gemma 4** as the default model.

## Features

- **Abliterated model behavior** — no refusals, no hedging, direct scholarly analysis
- **Hotswap models** — switch between gemma4:e4b, gpt-oss:20b, gpt-oss:120b, or any available Ollama model
- **50+ ancient script datasets** — pre-loaded lexicons for Linear A/B, Indus Valley, Meroitic, Voynich, Maya, Egyptian, and more
- **Statistical analysis** — Zipf law fit, Shannon/conditional/Rényi entropy, Yule's K
- **Vision support** — upload glyph images for AI-powered transcription (Gemma 4 vision)
- **Fully offline** — zero telemetry, zero external network calls
- **Encrypted storage** — SQLCipher v4 encrypted databases
- **Security-hardened** — no Chinese-origin models, no telemetry, local-only

## Quick Start

### Prerequisites
- [Ollama](https://ollama.com/download) >= 0.16
- [Node.js](https://nodejs.org) 22.13 LTS
- Windows 10/11 (Linux optional)

### Setup
```powershell
# Pull the default model
ollama pull gemma4:e4b

# Optional: pull additional models for hotswap
ollama pull gpt-oss:20b
ollama pull gpt-oss:120b
ollama pull nomic-embed-text

# Start Ollama
ollama serve

# In another terminal - start the copilot
cd decipher-copilot/server
npm install
node src/index.js

# Open browser to http://127.0.0.1:7340
```

## Architecture

```
Web UI (HTML5/CSS3/ES2023)  ←→  Node.js Backend  ←→  Ollama (gemma4:e4b)
                                      ↕
                              SQLCipher Databases
                              Dataset Importer (50+ scripts)
                              C/C++/NASM Core Engine
```

## Supported Models (Security-Vetted)

| Model | Size | Capabilities |
|-------|------|-------------|
| gemma4:e4b | 4B | **Vision, Thinking, Tools, Audio** |
| gemma4:e2b | 2B | Vision, Thinking, Tools, Audio |
| gemma4:e12b | 12B | Vision, Thinking, Tools, Audio |
| gemma4:e27b | 27B | Vision, Thinking, Tools, Audio |
| gemma4:e4b-cloud | 4B | Vision, Thinking, Tools, Audio (Cloud) |
| gemma4:e27b-cloud | 27B | Vision, Thinking, Tools, Audio (Cloud) |
| gpt-oss:20b | 20B | Tools, Thinking (levels) |
| gpt-oss:120b | 120B | Tools, Thinking (levels) |
| gpt-oss:120b-cloud | 120B | Tools, Thinking (cloud) |
| llama3.2-vision:11b | 11B | Vision, Tools |
| phi-4-reasoning:14b | 14B | Tools, Thinking |
| mistral:7b | 7B | Tools |

**Blocked:** All Chinese-origin models (Qwen, DeepSeek, Yi, Baichuan, etc.) are blocked for security.

## Datasets

50+ ancient script lexicon files automatically imported:
- Indus Valley (8282 glyphs), Linear A, Linear B, Cretan Hieroglyphs
- Meroitic, Voynich Manuscript, Phaistos Disc, Proto-Elamite
- Maya, Akkadian, Sumerian, Egyptian (Hieroglyphs, Hieratic, Demotic)
- Phoenician, Aramaic, Ugaritic, Proto-Sinaitic, Byblos
- Brahmi, Tamil, Telugu, Kannada, Malayalam
- Gothic, Glagolitic, Ge'ez, Coptic
- Greek, Paleo-Hebrew, Cypro-Minoan, Tartaria, Vinča

## Security

- Zero telemetry, zero external network calls
- SQLCipher v4 encrypted databases (AES-256)
- Chinese-origin models blocked at API level
- Static analysis scan blocks forbidden patterns in build
- Local-only: binds to 127.0.0.1 only
