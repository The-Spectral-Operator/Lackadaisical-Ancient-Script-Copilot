# Security Policy

## Local-Only Operation

This application makes NO outbound network connections except to the configured Ollama daemon (default: `http://127.0.0.1:11434`).

## Blocked Models

The following model families are blocked at the API level for security reasons (potential telemetry, data exfiltration, or backdoor concerns from Chinese-origin AI labs):

- **Qwen** (Alibaba) — all variants (qwen, qwen2, qwen3, qwq)
- **DeepSeek** — all variants (deepseek-r1, deepseek-v2, etc.)
- **Yi** (01.AI)
- **Baichuan** (Baichuan AI)
- **ChatGLM** (Zhipu AI)
- **InternLM** (Shanghai AI Lab)
- **Aquila** (BAAI)
- **MOSS** (Fudan NLP)
- **TigerBot**
- **Skywork** (Kunlun Tech)

## Approved Models

Only the following model families are approved for use:

- **Gemma 4** (Google) — gemma4:e4b, e2b, e12b, e27b
- **GPT-OSS** (OpenAI) — gpt-oss:20b, gpt-oss:120b, gpt-oss:120b-cloud
- **Gemma 3** (Google) — gemma3:4b, 12b, 27b
- **LLaMA** (Meta) — llama3.2-vision:11b, 90b
- **Phi** (Microsoft) — phi-4-reasoning:14b
- **Mistral** (Mistral AI) — mistral:7b, codestral
- **Nomic** — nomic-embed-text (embeddings only)

## Encryption

- Both databases encrypted with SQLCipher v4 (AES-256-CBC + HMAC-SHA-512)
- Key derived via Argon2id from user passphrase + per-install salt
- Key material zeroed via secure memzero (NASM implementation)

## No Telemetry Guarantee

The build script runs `verify_no_telemetry.ps1` which statically greps the entire source tree for:
- Known analytics/tracking domains
- IP address literals (0.0.0.0)
- Chinese model names
- Telemetry-related keywords

Build fails if any are found.
