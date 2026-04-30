# Architecture

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         WEB UI  (HTML5/CSS3/ES2023)                      │
│  Chat panel · Model hotswap · Lexicon editor · Corpus stats · Logs       │
└──────────────▲──────────────────────────────────────────────▲────────────┘
               │ HTTP/JSON (REST)            WebSocket (chat) │
┌──────────────┴──────────────────────────────────────────────┴────────────┐
│           NODE.JS 22 LTS BACKEND  (decipher-server)                      │
│  http · ws · better-sqlite3-multiple-ciphers · dataset importer          │
│   ┌──────────────┐  ┌────────────────┐  ┌──────────────────┐             │
│   │ REST router  │  │ WS chat hub    │  │ Ollama client    │             │
│   └──────────────┘  └────────────────┘  └─────────┬────────┘             │
└──────────────▲──────────────────────────────────────────────▲────────────┘
               │                                              │
┌──────────────┴────────────────┐                ┌────────────┴───────────┐
│  CORE ENGINE (C++20 + C17)    │                │   OLLAMA daemon         │
│  - C++ facade (RAII)          │                │   127.0.0.1:11434       │
│  - C17 modules                │                │   gemma4:e4b (default)  │
│  - NASM x86-64 kernels        │◄── HTTP/JSON ──┤   gpt-oss:20b/120b     │
│      sha256_avx2.asm          │                │   + any hotswap model   │
│      base64_avx2.asm          │                └─────────────────────────┘
│      freq_count_avx2.asm      │
└──────────────▲────────────────┘
               │ SQLite C API
        ┌──────┴───────────┐
        │ SQLCipher SQLite │  conversations.db (encrypted)
        │ (statically      │  system.db        (encrypted)
        │  linked)         │
        └──────────────────┘
```

## Security Model

- **No Chinese-origin models**: Qwen, DeepSeek, Yi, Baichuan, ChatGLM all blocked
- **Zero telemetry**: Static analysis enforced via verify_no_telemetry script
- **Local-only**: Binds to 127.0.0.1, only outbound connection is to Ollama
- **Encrypted at rest**: SQLCipher v4 (AES-256-CBC + HMAC-SHA-512)
- **Abliterated model**: No refusal vectors, direct scholarly analysis

## Model Hotswap

Models can be switched at any time:
- Per-session (persisted in session config)
- Per-message (via WS `model.switch` frame)
- Via UI dropdown (immediate effect)

gpt-oss models use string think levels ("low"/"medium"/"high") instead of boolean.
