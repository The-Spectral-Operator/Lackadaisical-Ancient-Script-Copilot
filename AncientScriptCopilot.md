# MASTER BUILD-SPECIFICATION: Ancient Script Decipherment Copilot — Local-Only, Ollama-Backed, Hybrid x86-64/C/C++/Node.js System

> **Audience for this document:** an LLM/copilot tasked with implementing the entire system from scratch.
> **Hard constraints:** zero placeholders, zero TODOs, zero mock code, zero telemetry, zero external network calls beyond a configured local Ollama endpoint, production/enterprise grade only.
> **Date of research:** 29 April 2026.

---

## TL;DR
- Build a Windows-first (cross-platform aware) local copilot for ancient-script decipherment whose **AI brain is a locally running Ollama daemon (default `http://127.0.0.1:11434`)** consumed via its REST API (`/api/chat`, `/api/generate`, `/api/embed`, `/api/tags`, `/api/show`, `/api/ps`, `/api/pull`, `/api/delete`, `/api/copy`, `/api/create`, `/api/blobs/:digest`, `/api/version`), with full support for **streaming**, **`think: true` reasoning capture**, **`tools`/function calling**, **`format` JSON-schema structured outputs**, and **`images: [base64,…]` multimodal input** for vision models such as `qwen3-vl`, `gemma3`, `llama3.2-vision`, `qwen2.5vl`, `llava`.
- The system stack is **NASM x86-64 + C17 core engine** (corpus statistics, Zipf/entropy/frequency kernels, SHA-256, base64), wrapped by a **C++20 abstraction layer** exposed through a **Node.js 22 LTS** backend (`http`, `ws`, `better-sqlite3-multiple-ciphers`) that fronts a **vanilla HTML5/CSS3/ES2023 web UI**, communicating over **HTTP + WebSocket** with **dual SQLCipher-encrypted SQLite WAL databases** — `conversations.db` (chats, thinking tokens, tool calls, attachments) and `system.db` (models, sessions, lexicons, corpora, settings).
- Everything runs **fully offline** on the user’s machine; the only outbound socket the program ever opens is to the configured `OLLAMA_HOST`. The build pipeline is **CMake 3.28 + NASM 2.16 + MSVC 19.40 / clang-cl + Node 22 LTS + npm**, producing a single distributable Windows folder containing `decipher-core.dll`, `decipher-core.lib`, the Node server `decipher-server.exe` (pkg-bundled), and the `webui/` static assets.

---

## Key Findings (Verified Against Official Sources)

### 1. Ollama REST API — ground truth (April 2026)
- **Default bind:** `127.0.0.1:11434`. Override with env var `OLLAMA_HOST`.
- **Latest stable line tracked publicly:** v0.14.x – v0.16.x (Feb 2026), with the in-repo current build train at `v0.22.x` (April 2026 RCs). Recent items: GPT-OSS support, Qwen3-VL, Gemma 4, MLX runner, OpenClaw web search, Hermes/Codex/Kimi launch integrations, batch embeddings, MXFP4 native kernels.
- **Endpoints (POST unless noted):**
  - `POST /api/generate` — single-prompt completion. Supports `model`, `prompt`, `suffix`, `images[]` (base64), `system`, `template`, `context[]`, `stream`, `raw`, `keep_alive`, `format` (string `"json"` or full JSON Schema), `options{...}` (Modelfile parameters), `think` (bool or `"low"|"medium"|"high"` for Harmony/gpt-oss).
  - `POST /api/chat` — conversational. Messages have `role ∈ {system,user,assistant,tool}`, `content`, optional `images[]`, optional `tool_calls[]`. Top-level supports `tools[]` (JSON-Schema function definitions), `format`, `stream`, `keep_alive`, `options`, `think`.
  - `POST /api/embed` (recommended) — `{ "model": "...", "input": "string" | ["s1","s2"], "truncate": true, "dimensions": <int>, "options": {...}, "keep_alive": "5m" }`. Returns `embeddings: float32[][]` (L2-normalized).
  - `POST /api/embeddings` (legacy, single input, float64) — kept for back-compat; new code MUST use `/api/embed`.
  - `POST /api/pull`, `POST /api/push`, `POST /api/create`, `DELETE /api/delete`, `POST /api/copy`.
  - `GET /api/tags` — list local models. `POST /api/show` — modelfile, parameters, template, details, capabilities. `GET /api/ps` — currently loaded models, VRAM usage, `expires_at`.
  - `HEAD /api/blobs/:digest`, `POST /api/blobs/:digest` — content-addressable blob upload (sha256). Used to inject GGUF files for `/api/create`.
  - `GET /api/version` — server version.
  - **OpenAI-compat** under `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, `/v1/models`, with `reasoning_effort` mapped to `Think`.
- **Streaming:** newline-delimited JSON (NDJSON). Each chunk has `done:false` until terminal chunk with `done:true` plus `total_duration`, `load_duration`, `prompt_eval_count`, `prompt_eval_duration`, `eval_count`, `eval_duration`, `done_reason`.
- **Thinking/reasoning capture:** when the model is a thinking model (DeepSeek-R1, Qwen3, QwQ, gpt-oss, Cogito, Phi-4-reasoning, etc.) and `"think": true` is sent, response chunks contain a separate `message.thinking` field interleaved with `message.content`; the final non-streaming response object exposes both. For Harmony/gpt-oss, `think` accepts `"low" | "medium" | "high"` (booleans ignored).
- **Tool/function calling:** pass `tools: [{type:"function", function:{name, description, parameters:JSONSchema}}]`. Streaming tool calls are emitted progressively (since the streaming-tools parser shipped in 2025); non-streaming returns `message.tool_calls[].function.{name,arguments}`. Tool responses are returned as `{role:"tool", tool_name, content}`.
- **Vision/multimodal input:** `images: ["<base64 string>", ...]` on a user message (chat) or top-level field (generate). Compatible models include `qwen3-vl` (2/4/8/30/32/235B), `qwen2.5vl`, `llama3.2-vision` (11B/90B), `llama4`, `gemma3` (4/12/27B vision), `granite3.2-vision`, `moondream`, `llava`, `bakllava`. **There is no native PDF endpoint** — convert PDF pages to PNG/JPEG client-side and pass each as a base64 image. Ollama itself does not generate binary files; output is always token text (optionally JSON-schema-constrained).
- **Context window / keep-alive:** `options.num_ctx` controls context size (must fit in VRAM). `keep_alive` per-request (e.g. `"5m"`, `"30m"`, `"-1"` for forever, `0` to unload immediately) overrides global `OLLAMA_KEEP_ALIVE`.
- **Server env vars (production):** `OLLAMA_HOST`, `OLLAMA_MODELS`, `OLLAMA_KEEP_ALIVE`, `OLLAMA_NUM_PARALLEL`, `OLLAMA_MAX_LOADED_MODELS`, `OLLAMA_MAX_QUEUE` (default 512 → 503 when exceeded), `OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE ∈ {f16,q8_0,q4_0}`, `OLLAMA_ORIGINS`, `OLLAMA_DEBUG`. `disable_ollama_cloud:true` in `~/.ollama/server.json` to enforce local-only.
- **Structured outputs:** `format: "json"` (loose) or `format: <JSON Schema object>` (strict via GBNF grammar in llama.cpp). Always also instruct the model to produce JSON in the prompt to avoid blank-whitespace runs.

### 2. Comparison: capabilities Ollama has / lacks vs peers
| Feature | Ollama | LM Studio | llama.cpp `llama-server` | vLLM | LocalAI |
|---|---|---|---|---|---|
| OpenAI `/v1/*` compat | ✓ | ✓ (chat, completions, embeddings, responses) | ✓ | ✓ (most) | ✓ |
| Anthropic Messages compat | partial (middleware) | ✓ | ✓ (`/v1/messages`) | ✗ | ✓ |
| Native streaming reasoning field | **✓** (`message.thinking`) | ✓ (`reasoning`) | partial | partial | ✓ (`reasoning_content`) |
| Image input | ✓ (base64 array) | ✓ (OpenAI vision schema) | ✓ (multimodal experimental) | ✓ (vision API) | ✓ |
| Audio in/out | ✗ | ✗ | partial (Whisper builds) | ✓ (`/v1/audio/*`) | ✓ (Realtime, TTS, STT) |
| Image generation | ✗ | ✗ | ✗ | ✗ | ✓ (Stable Diffusion) |
| Tool/function calling | ✓ | ✓ | ✓ (Jinja + GBNF) | ✓ | ✓ |
| Structured output (JSON Schema) | ✓ (GBNF) | ✓ | ✓ | ✓ (guided decoding) | ✓ (GBNF) |
| Built-in MCP / agents | partial (clients) | ✓ (Remote MCP) | ✗ | ✗ | ✓ (LocalAGI) |
| Reranker endpoint | ✗ | ✗ | ✓ (`/v1/rerank`) | ✓ | ✓ |
| File-upload endpoint (Files API) | ✗ | ✗ | ✗ | ✗ | partial |
| **Direct PDF/document ingestion in API** | ✗ | ✗ | ✗ | ✗ | ✗ |

**Implication for this build:** because no local server natively ingests PDFs, the system MUST pre-process PDFs and document images into base64 PNGs in the Node tier before calling Ollama vision models. Ollama is the right primary backend (smallest dependency surface, best “thinking” ergonomics, simplest model management, content-addressable blob endpoint for offline model import).

### 3. SQLite + SQLCipher (Node + C)
- Use **`better-sqlite3-multiple-ciphers`** (npm; current 12.6.x; bundles SQLite3MultipleCiphers; supports SQLCipher v4 cipher format and several others; synchronous, prepared-statement-cached, transaction-first).
- Mandatory pragmas at open: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `temp_store=MEMORY`, `mmap_size=268435456`, `cache_size=-65536` (≈64 MiB), `busy_timeout=5000`, `cipher='sqlcipher'`, `legacy=4`, `key='<hex passphrase>'`.
- C-side core uses raw `sqlite3.h` (sqlite3_open_v2 with `SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX | SQLITE_OPEN_URI`, `sqlite3_prepare_v3`, `sqlite3_bind_*`, `sqlite3_step`, `sqlite3_column_*`, `sqlite3_finalize`, `sqlite3_close_v2`) for high-throughput corpus indexing and bulk Zipf/entropy aggregations.
- WAL checkpoint policy: scheduled `wal_checkpoint(RESTART)` whenever `*-wal` exceeds 32 MiB (avoids checkpoint starvation).

### 4. Ancient-script decipherment domain features (literature-grounded)
The literature (Tamburini 2025 *Frontiers in AI*; Corazza 2022; Snyder/Barzilay/Knight 2010; Luo et al.; Rao 2009 on Indus; computational reviews of Linear A/B, Cypro-Minoan, Cretan Hieroglyphs, Phaistos Disk, Meroitic, Voynich) converges on the following primitives a copilot must expose:
1. **Sign inventory & glyph IDs** (CSV/JSON metadata: `sign_id`, `unicode_or_pua`, `glyph_image_path`, `script`, `variant_of`, `notes`).
2. **Lexicon stores** keyed by (script → token → gloss → confidence → source_inscription_id).
3. **Frequency analysis** (unigram, bigram, trigram, positional, line-initial/final).
4. **Zipf-law fit** (rank-frequency log-log slope estimate; goodness via Kolmogorov-Smirnov).
5. **Conditional / block / Rényi entropy** (Rao-style discriminator vs. natural-language baselines).
6. **Yule’s K / Simpson’s D constancy measures.**
7. **Cross-inscription coherence** (cognate alignment, monotonicity, sound-preservation constraints; coupled simulated annealing per Tamburini 2025 for k-permutation mappings).
8. **Segmentation aids** (word-divider detection, script-separator stats).
9. **Glyph image analysis** (vision-LLM passes for transcription assistance, sign-form clustering).
10. **Session/project state** (long-running decipherment workspaces with versioned hypotheses).
11. **Provenance & audit** (every model-derived assertion stamped with model name, digest, params, timestamp, prompt hash, thinking-token capture).

---

# Details — Complete Build Specification

## 5. System Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         WEB UI  (HTML5/CSS3/ES2023)                      │
│  Chat panel · Inscription canvas · Lexicon editor · Corpus stats · Logs  │
└──────────────▲──────────────────────────────────────────────▲────────────┘
               │ HTTP/JSON (REST)            WebSocket (chat) │
┌──────────────┴──────────────────────────────────────────────┴────────────┐
│           NODE.JS 22 LTS BACKEND  (decipher-server)                      │
│  http · ws · zod · pino · better-sqlite3-multiple-ciphers · ffi-napi     │
│   ┌──────────────┐  ┌────────────────┐  ┌──────────────────┐             │
│   │ REST router  │  │ WS chat hub    │  │ Ollama client    │             │
│   └──────────────┘  └────────────────┘  └─────────┬────────┘             │
│   ┌─────────────────────────────────────────────┐ │                      │
│   │ FFI bridge → decipher-core.dll  (N-API + cffi) │                     │
│   └─────────────────────────────────────────────┘ │                      │
└──────────────▲──────────────────────────────────────────────▲────────────┘
               │                                              │
┌──────────────┴────────────────┐                ┌────────────┴───────────┐
│  CORE ENGINE (C++20 + C17)    │                │   OLLAMA daemon         │
│  - C++ facade  (libcore++)    │                │   127.0.0.1:11434       │
│  - C17 modules (libcore)      │                │   /api/chat /generate   │
│  - NASM x86-64 kernels:       │◄── HTTP/JSON ──┤   /api/embed /tags      │
│      sha256_avx2.asm          │                │   /api/pull /show ...   │
│      base64_avx2.asm          │                └─────────────────────────┘
│      freq_count_avx2.asm      │
│      log2_lookup.asm          │
└──────────────▲────────────────┘
               │ raw sqlite3 C API
        ┌──────┴───────────┐
        │ SQLCipher SQLite │  conversations.db (encrypted, WAL)
        │ (statically      │  system.db        (encrypted, WAL)
        │  linked)         │
        └──────────────────┘
```

## 6. Folder / File Tree (every file must exist; no placeholders)

```
decipher-copilot/
├── CMakeLists.txt
├── CMakePresets.json
├── LICENSE
├── README.md
├── .editorconfig
├── .gitignore
├── .nvmrc                      # 22.13.0
├── package.json
├── package-lock.json
├── tsconfig.json               # checkJs only; project is JS, not TS
├── eslint.config.mjs
├── prettier.config.mjs
│
├── third_party/
│   ├── sqlite/                 # SQLite amalgamation 3.46.x (vendored)
│   │   ├── sqlite3.c
│   │   ├── sqlite3.h
│   │   └── sqlite3ext.h
│   └── sqlite3mc/              # SQLite3MultipleCiphers 2.x (vendored, AES-256/SQLCipher v4)
│       ├── sqlite3mc.c
│       └── sqlite3mc.h
│
├── core/                                       # C17 + NASM + C++20 engine
│   ├── CMakeLists.txt
│   ├── include/
│   │   ├── dc_api.h            # extern "C" public ABI
│   │   ├── dc_types.h
│   │   ├── dc_corpus.h
│   │   ├── dc_lexicon.h
│   │   ├── dc_stats.h
│   │   ├── dc_entropy.h
│   │   ├── dc_zipf.h
│   │   ├── dc_align.h          # cognate alignment, sim. annealing
│   │   ├── dc_db.h             # sqlite3 wrapper
│   │   ├── dc_log.h
│   │   ├── dc_error.h
│   │   ├── dc_b64.h
│   │   ├── dc_sha256.h
│   │   └── dc_unicode.h
│   ├── src/
│   │   ├── dc_api.c            # exported C entry points (dllexport)
│   │   ├── dc_corpus.c
│   │   ├── dc_lexicon.c
│   │   ├── dc_stats.c
│   │   ├── dc_entropy.c        # Shannon H1, conditional H2, block, Rényi, Yule K
│   │   ├── dc_zipf.c           # rank-freq fit, KS test
│   │   ├── dc_align.c          # coupled simulated annealing (Tamburini 2025)
│   │   ├── dc_db.c             # sqlite3 prepared-stmt cache
│   │   ├── dc_log.c
│   │   ├── dc_error.c
│   │   ├── dc_b64.c            # scalar fallback
│   │   ├── dc_sha256.c         # scalar fallback
│   │   └── dc_unicode.c        # UTF-8 + PUA glyph helpers
│   ├── asm/                                     # NASM x86-64
│   │   ├── sha256_avx2.asm
│   │   ├── base64_avx2.asm
│   │   ├── freq_count_avx2.asm  # vectorised byte/codepoint frequency tally
│   │   ├── log2_lookup.asm      # fast log2 for entropy hot-path
│   │   └── memzero_secure.asm   # RtlSecureZeroMemory equivalent for keys
│   ├── cpp/                                     # C++20 facades
│   │   ├── Engine.hpp
│   │   ├── Engine.cpp           # wraps C ABI, RAII, std::expected
│   │   ├── Corpus.hpp
│   │   ├── Corpus.cpp
│   │   ├── Lexicon.hpp
│   │   ├── Lexicon.cpp
│   │   ├── Stats.hpp
│   │   └── Stats.cpp
│   └── tests/
│       ├── test_entropy.c
│       ├── test_zipf.c
│       ├── test_align.c
│       ├── test_db.c
│       ├── test_sha256.c
│       └── test_b64.c
│
├── server/                                       # Node.js 22 LTS backend
│   ├── package.json
│   ├── src/
│   │   ├── index.js              # boot, signal handlers, graceful shutdown
│   │   ├── config.js             # reads env + config.json (no defaults that phone home)
│   │   ├── logger.js             # pino, file rotation, no telemetry transports
│   │   ├── http/
│   │   │   ├── server.js         # node:http only
│   │   │   ├── router.js
│   │   │   ├── middleware.js     # auth (local token), CORS lock-down, body limits
│   │   │   ├── static.js         # serves /webui from disk, ETag, gzip
│   │   │   └── routes/
│   │   │       ├── health.js     # GET /api/health
│   │   │       ├── models.js     # GET /api/models, /api/models/:id (proxies /api/tags, /api/show, /api/ps)
│   │   │       ├── chat.js       # POST /api/chat (non-stream fallback)
│   │   │       ├── sessions.js   # CRUD chat sessions
│   │   │       ├── messages.js   # GET /api/sessions/:id/messages
│   │   │       ├── attachments.js# POST/GET /api/attachments  (PDF→PNG, image, txt)
│   │   │       ├── lexicon.js    # CRUD lexicon entries
│   │   │       ├── corpus.js     # CRUD corpora + inscriptions
│   │   │       ├── analysis.js   # POST /api/analysis/{zipf|entropy|freq|align}
│   │   │       └── settings.js
│   │   ├── ws/
│   │   │   ├── hub.js            # ws server, heartbeat ping/pong
│   │   │   ├── protocol.js       # frame schemas (zod)
│   │   │   └── chatStream.js     # bridges Ollama NDJSON → WS frames
│   │   ├── ollama/
│   │   │   ├── client.js         # fetch-based, AbortController, retry/backoff
│   │   │   ├── stream.js         # NDJSON line splitter
│   │   │   ├── thinkParser.js    # separates message.thinking from message.content
│   │   │   ├── tools.js          # tool schema validation, tool dispatch
│   │   │   └── vision.js         # PDF→PNG (pdfjs-dist), image base64
│   │   ├── db/
│   │   │   ├── open.js           # opens conversations.db & system.db with SQLCipher
│   │   │   ├── migrate.js        # runs migrations/*.sql in order
│   │   │   ├── conversations.js  # prepared statements for chats/messages
│   │   │   ├── system.js         # prepared statements for models/lexicons/corpora
│   │   │   └── sqlcipher.js      # key derivation (Argon2id via libsodium-wrappers)
│   │   ├── core/
│   │   │   ├── ffi.js            # node-ffi-napi bindings to decipher-core.dll
│   │   │   └── decipher.js       # high-level API used by routes
│   │   ├── auth/
│   │   │   ├── token.js          # local single-user bearer token, persisted in system.db
│   │   │   └── csrf.js
│   │   ├── util/
│   │   │   ├── ndjson.js
│   │   │   ├── ids.js            # ULID generator
│   │   │   ├── time.js
│   │   │   └── errors.js
│   │   └── tools/
│   │       ├── lexiconLookup.js  # callable tool exposed to LLM
│   │       ├── corpusSearch.js
│   │       ├── frequencyReport.js
│   │       ├── entropyReport.js
│   │       └── zipfReport.js
│   ├── migrations/
│   │   ├── 0001_init_conversations.sql
│   │   ├── 0002_init_system.sql
│   │   ├── 0003_indices.sql
│   │   └── 0004_fts5_corpus.sql
│   └── test/
│       ├── ollama.client.test.js
│       ├── ws.protocol.test.js
│       ├── db.migrate.test.js
│       └── routes.chat.test.js
│
├── webui/                                        # Vanilla, no framework
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── favicon.svg
│   ├── css/
│   │   ├── reset.css
│   │   ├── tokens.css            # design tokens
│   │   ├── layout.css
│   │   ├── chat.css
│   │   ├── inscription.css
│   │   └── theme-dark.css
│   ├── js/
│   │   ├── app.js                # entrypoint, ES modules
│   │   ├── api.js                # fetch wrapper with bearer token
│   │   ├── ws.js                 # WebSocket client with reconnect
│   │   ├── chat/
│   │   │   ├── view.js
│   │   │   ├── store.js
│   │   │   ├── markdown.js       # safe minimal MD (no remote)
│   │   │   ├── codeHighlight.js  # local, prism-tiny vendored
│   │   │   ├── thinking.js       # collapsible reasoning panel
│   │   │   └── attachments.js
│   │   ├── lexicon/
│   │   │   ├── view.js
│   │   │   └── editor.js
│   │   ├── corpus/
│   │   │   ├── view.js
│   │   │   ├── inscription.js    # canvas-based glyph viewer
│   │   │   └── stats.js          # Zipf, entropy charts (canvas, no chart libs from CDN)
│   │   ├── models/
│   │   │   └── picker.js
│   │   ├── settings/
│   │   │   └── view.js
│   │   └── util/
│   │       ├── dom.js
│   │       ├── sanitize.js
│   │       └── i18n.js
│   └── vendor/
│       ├── prism-tiny.min.js     # vendored copy, MIT
│       └── pdfjs/                # vendored pdf.js for client preview only
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── BUILD.md
│   ├── SECURITY.md
│   ├── OLLAMA_NOTES.md
│   └── DECIPHERMENT_METHODS.md
│
├── scripts/
│   ├── build.ps1                 # Windows full pipeline
│   ├── build.sh                  # Linux/macOS
│   ├── package_windows.ps1       # produces dist/ folder
│   └── verify_no_telemetry.ps1   # static grep for forbidden domains/IP literals
│
├── data/                          # Empty at first; populated at runtime
│   ├── databases/                 # conversations.db, system.db (encrypted)
│   ├── attachments/               # user-uploaded files (also referenced in DB)
│   ├── corpora/                   # JSON+CSV imports
│   └── lexicons/                  # JSON lexicons per script
│
└── dist/                          # build output (gitignored)
```

## 7. Technology Stack — exact pinned versions

| Component | Version | Source |
|---|---|---|
| Ollama daemon | ≥ v0.16.0 (April 2026 stable) | https://ollama.com/download |
| NASM | 2.16.03 | https://www.nasm.us |
| CMake | 3.28.x | https://cmake.org |
| MSVC | Visual Studio Build Tools 2022 (toolset 14.40, `_MSC_VER 1940+`) — C17 + C++20 | — |
| clang-cl (alt) | 18.x | LLVM |
| Node.js | 22.13.0 LTS | https://nodejs.org |
| npm | 10.9.x | bundled |
| SQLite amalgamation | 3.46.x | https://sqlite.org/download.html |
| SQLite3MultipleCiphers | 2.x (SQLCipher v4 compatible) | utelle/SQLite3MultipleCiphers |
| `better-sqlite3-multiple-ciphers` | 12.6.x | npm |
| `ws` | 8.18.x | npm |
| `pino` | 9.x | npm |
| `zod` | 3.23.x | npm |
| `ulid` | 2.3.x | npm |
| `libsodium-wrappers` | 0.7.x | npm (Argon2id KDF) |
| `pdfjs-dist` | 4.x | npm (server-side page→PNG via node-canvas) |
| `node-canvas` | 3.x | npm |
| `node-ffi-napi` + `ref-napi` | latest stable | for FFI to `decipher-core.dll` |

## 8. Database Schemas

### 8.1 `conversations.db` (chat history; encrypted)

```sql
PRAGMA user_version = 1;

CREATE TABLE sessions (
  id              TEXT    PRIMARY KEY,         -- ULID
  title           TEXT    NOT NULL,
  script          TEXT,                         -- e.g. 'Linear A', 'Indus', 'Voynich'
  model           TEXT    NOT NULL,             -- e.g. 'qwen3:8b'
  model_digest    TEXT    NOT NULL,
  system_prompt   TEXT,
  options_json    TEXT    NOT NULL,             -- num_ctx, temperature, etc.
  created_at      INTEGER NOT NULL,             -- unix ms
  updated_at      INTEGER NOT NULL,
  archived        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);
CREATE INDEX idx_sessions_script  ON sessions(script);

CREATE TABLE messages (
  id                 TEXT    PRIMARY KEY,       -- ULID
  session_id         TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  parent_id          TEXT             REFERENCES messages(id),
  role               TEXT    NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content            TEXT    NOT NULL,
  thinking           TEXT,                       -- captured reasoning trace if model emits one
  tool_name          TEXT,                       -- when role='tool'
  tool_call_id       TEXT,
  tool_calls_json    TEXT,                       -- when role='assistant' and tools were invoked
  format_schema_json TEXT,                       -- structured-output schema applied
  prompt_tokens      INTEGER,
  completion_tokens  INTEGER,
  total_duration_ns  INTEGER,
  load_duration_ns   INTEGER,
  prompt_eval_ns     INTEGER,
  eval_ns            INTEGER,
  done_reason        TEXT,
  created_at         INTEGER NOT NULL,
  finished_at        INTEGER
);
CREATE INDEX idx_messages_session ON messages(session_id, created_at);

CREATE TABLE attachments (
  id           TEXT    PRIMARY KEY,             -- ULID
  message_id   TEXT    NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind         TEXT    NOT NULL CHECK (kind IN ('image','pdf','text','glyph','audio')),
  filename     TEXT    NOT NULL,
  mime         TEXT    NOT NULL,
  bytes        INTEGER NOT NULL,
  sha256_hex   TEXT    NOT NULL,
  storage_path TEXT    NOT NULL,                -- relative to data/attachments
  width        INTEGER,
  height       INTEGER,
  pages        INTEGER,                          -- for PDFs
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_attach_msg ON attachments(message_id);

CREATE TABLE message_audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  prompt_sha256 TEXT NOT NULL,
  request_json  TEXT NOT NULL,                   -- exact JSON sent to Ollama (sans secrets)
  endpoint      TEXT NOT NULL,                   -- '/api/chat' | '/api/generate'
  ollama_version TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_audit_msg ON message_audit(message_id);
```

### 8.2 `system.db` (models, lexicons, corpora, settings; encrypted)

```sql
PRAGMA user_version = 1;

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE auth_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash  TEXT    NOT NULL UNIQUE,           -- argon2id(token)
  label       TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  last_used   INTEGER
);

CREATE TABLE models (
  name             TEXT PRIMARY KEY,             -- 'qwen3:8b'
  digest           TEXT NOT NULL,
  family           TEXT,
  parameter_size   TEXT,
  quantization     TEXT,
  context_length   INTEGER,
  capabilities_json TEXT NOT NULL,                -- {"thinking":true,"tools":true,"vision":false,...}
  template         TEXT,
  parameters       TEXT,
  last_seen_at     INTEGER NOT NULL
);

CREATE TABLE scripts (
  id          TEXT PRIMARY KEY,                   -- 'linear_a', 'indus', 'cypro_minoan'
  display     TEXT NOT NULL,
  era         TEXT,
  region      TEXT,
  notes       TEXT
);

CREATE TABLE signs (
  id          TEXT PRIMARY KEY,                   -- 'LinA-AB01'
  script_id   TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  glyph_pua   TEXT,                               -- private-use codepoint if assigned
  image_path  TEXT,                               -- relative path under data/
  variant_of  TEXT REFERENCES signs(id),
  notes       TEXT
);
CREATE INDEX idx_signs_script ON signs(script_id);

CREATE TABLE corpora (
  id          TEXT PRIMARY KEY,                   -- ULID
  script_id   TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  source      TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE inscriptions (
  id           TEXT PRIMARY KEY,                  -- ULID
  corpus_id    TEXT NOT NULL REFERENCES corpora(id) ON DELETE CASCADE,
  reference    TEXT NOT NULL,                     -- 'HT 31', 'M-1429', etc.
  transcription TEXT NOT NULL,                    -- canonical sign-id sequence (space sep)
  raw_text     TEXT,                              -- as published
  image_path   TEXT,
  metadata_json TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_inscr_corpus ON inscriptions(corpus_id);

CREATE VIRTUAL TABLE inscriptions_fts USING fts5(
  reference, transcription, raw_text,
  content='inscriptions', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER inscriptions_ai AFTER INSERT ON inscriptions BEGIN
  INSERT INTO inscriptions_fts(rowid, reference, transcription, raw_text)
  VALUES (new.rowid, new.reference, new.transcription, new.raw_text);
END;
CREATE TRIGGER inscriptions_ad AFTER DELETE ON inscriptions BEGIN
  INSERT INTO inscriptions_fts(inscriptions_fts, rowid, reference, transcription, raw_text)
  VALUES ('delete', old.rowid, old.reference, old.transcription, old.raw_text);
END;
CREATE TRIGGER inscriptions_au AFTER UPDATE ON inscriptions BEGIN
  INSERT INTO inscriptions_fts(inscriptions_fts, rowid, reference, transcription, raw_text)
  VALUES ('delete', old.rowid, old.reference, old.transcription, old.raw_text);
  INSERT INTO inscriptions_fts(rowid, reference, transcription, raw_text)
  VALUES (new.rowid, new.reference, new.transcription, new.raw_text);
END;

CREATE TABLE lexicons (
  id          TEXT PRIMARY KEY,
  script_id   TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE lexicon_entries (
  id           TEXT PRIMARY KEY,
  lexicon_id   TEXT NOT NULL REFERENCES lexicons(id) ON DELETE CASCADE,
  token        TEXT NOT NULL,                     -- sign-id sequence
  gloss        TEXT,                              -- proposed reading
  pos          TEXT,                              -- part-of-speech if known
  confidence   REAL NOT NULL DEFAULT 0.0,         -- 0..1
  source       TEXT,                              -- inscription_id or citation
  notes        TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_lex_token ON lexicon_entries(lexicon_id, token);

CREATE TABLE analysis_runs (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('zipf','shannon','conditional','rényi','yule_k','frequency','align')),
  corpus_id    TEXT REFERENCES corpora(id) ON DELETE CASCADE,
  inputs_json  TEXT NOT NULL,
  results_json TEXT NOT NULL,
  duration_ms  INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_runs_corpus_kind ON analysis_runs(corpus_id, kind);

CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  script_id   TEXT REFERENCES scripts(id),
  description TEXT,
  state_json  TEXT NOT NULL,                      -- working hypotheses, notes
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
```

### 8.3 PRAGMA bootstrap (both DBs)

```js
const db = new Database(path, { fileMustExist: false });
db.pragma(`cipher='sqlcipher'`);
db.pragma(`legacy=4`);
db.pragma(`key="x'${derivedKeyHex}'"`);
db.pragma(`journal_mode=WAL`);
db.pragma(`synchronous=NORMAL`);
db.pragma(`foreign_keys=ON`);
db.pragma(`temp_store=MEMORY`);
db.pragma(`mmap_size=268435456`);
db.pragma(`cache_size=-65536`);
db.pragma(`busy_timeout=5000`);
```

The 256-bit key is derived via `libsodium-wrappers` `crypto_pwhash` (Argon2id, OPSLIMIT_MODERATE, MEMLIMIT_MODERATE) from the user passphrase + per-install salt persisted in `data/databases/.salt` (mode 0600).

## 9. Internal Node.js HTTP API (REST)

All endpoints accept/return `application/json`, require `Authorization: Bearer <token>` and the same-origin-only CORS policy `OLLAMA_ORIGINS`-style allow-list pulled from `system.db` settings.

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/health` | `{status:"ok", ollama:{reachable,version}, db:{ok}}` |
| GET  | `/api/version` | server semver |
| GET  | `/api/models` | proxy `/api/tags` and `/api/ps`, joined with cached metadata |
| GET  | `/api/models/:name` | proxy `/api/show`, augmented with capability detection |
| POST | `/api/models/pull` | streams progress over WS `pull:<id>` |
| DELETE | `/api/models/:name` | proxy `/api/delete` |
| GET  | `/api/sessions` | list |
| POST | `/api/sessions` | create |
| GET  | `/api/sessions/:id` | get |
| PATCH | `/api/sessions/:id` | rename, archive, change model/options |
| DELETE | `/api/sessions/:id` | delete (cascade messages+attachments) |
| GET  | `/api/sessions/:id/messages` | paginated |
| POST | `/api/sessions/:id/messages` | append user message (returns ID) — actual generation runs over WS |
| POST | `/api/attachments` | multipart upload; PDF→PNG fan-out; returns `attachment_id`s |
| GET  | `/api/attachments/:id` | binary download (auth-checked) |
| GET  | `/api/lexicons?script=...` | list |
| POST | `/api/lexicons` | create |
| GET  | `/api/lexicons/:id/entries` | list, filter, paginate |
| POST | `/api/lexicons/:id/entries` | upsert |
| DELETE | `/api/lexicons/:id/entries/:eid` | delete |
| POST | `/api/lexicons/:id/import` | accepts JSON array or CSV (auto-detect) |
| GET  | `/api/lexicons/:id/export?format=json|csv` | download |
| GET  | `/api/scripts` / `/api/signs` | meta |
| GET  | `/api/corpora` / `/api/inscriptions` | CRUD |
| POST | `/api/corpora/:id/import` | bulk JSON/CSV |
| POST | `/api/analysis/zipf` | `{corpus_id}` → rank/freq, slope, KS |
| POST | `/api/analysis/entropy` | `{corpus_id, kind: 'shannon'|'conditional'|'block'|'rényi'|'yule_k'}` |
| POST | `/api/analysis/frequency` | unigram/bigram/trigram with positional flags |
| POST | `/api/analysis/align` | cognate alignment via simulated annealing (calls FFI) |
| POST | `/api/chat` | non-stream fallback (proxies `/api/chat`) |
| POST | `/api/embed` | proxy `/api/embed` |
| GET  | `/api/settings` / `PUT /api/settings` | per-key |

## 10. Ollama Integration — Canonical Code Snippets (use exactly these patterns)

### 10.1 Streaming chat with thinking + tools (Node 22, ESM, no extra deps)

```js
// server/src/ollama/client.js
import { setTimeout as delay } from 'node:timers/promises';

export async function* ollamaChatStream({
  baseUrl, model, messages, tools, format, think, options, keepAlive, signal,
}) {
  const body = {
    model,
    messages,
    stream: true,
    ...(tools && { tools }),
    ...(format !== undefined && { format }),
    ...(think !== undefined && { think }),
    ...(options && { options }),
    ...(keepAlive !== undefined && { keep_alive: keepAlive }),
  };
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`ollama ${res.status}: ${text}`);
  }
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      yield JSON.parse(line);                      // Ollama NDJSON frames
    }
  }
  if (buf.trim()) yield JSON.parse(buf);
}
```

### 10.2 Tool calling round-trip (canonical)

```js
const tools = [{
  type: 'function',
  function: {
    name: 'lexicon_lookup',
    description: 'Look up a sign-id sequence in the active lexicon.',
    parameters: {
      type: 'object',
      required: ['lexicon_id', 'token'],
      properties: {
        lexicon_id: { type: 'string' },
        token:      { type: 'string', description: 'Space-separated sign IDs' }
      }
    }
  }
}];
```

When a streamed frame contains `message.tool_calls`, the server executes the registered handler from `server/src/tools/*.js`, appends `{ role: 'tool', tool_name, content: <JSON-stringified result> }` to the `messages` array, and re-issues `/api/chat` with the same `tools` array until `done: true` arrives without further tool calls.

### 10.3 Vision (image + text) — `/api/chat` with `images`

```js
// images: array of base64-encoded strings (no data: prefix)
const payload = {
  model: 'qwen3-vl',
  messages: [{
    role: 'user',
    content: 'Transcribe the visible glyphs and propose a sign sequence.',
    images: [b64png]
  }],
  stream: true,
  think: true,
  options: { num_ctx: 32768, temperature: 0.2 }
};
```

### 10.4 Structured-output report

```js
const FrequencyReport = {
  type: 'object',
  required: ['unigrams','bigrams','observations'],
  properties: {
    unigrams: { type: 'array', items: { type: 'object',
       required: ['sign','count'], properties: {
         sign: { type:'string' }, count: { type:'integer', minimum:0 } } } },
    bigrams: { type: 'array', items: { type: 'object',
       required: ['a','b','count'], properties: {
         a: {type:'string'}, b:{type:'string'}, count:{type:'integer',minimum:0} } } },
    observations: { type: 'string' }
  }
};
// pass as { format: FrequencyReport, think: false, stream: false }
```

### 10.5 Embeddings

```js
const r = await fetch(`${base}/api/embed`, {
  method:'POST',
  headers:{'content-type':'application/json'},
  body: JSON.stringify({ model:'nomic-embed-text', input: tokens })
});
const { embeddings } = await r.json();   // float32[][], L2-normalised
```

## 11. WebSocket Protocol (`ws://localhost:7341/ws`)

All frames are JSON text. Framing uses a discriminated `type`. Heartbeat: client sends `{type:'ping',t:Date.now()}` every 25 s; server replies `{type:'pong',t}`. Server closes idle sockets after 60 s of silence.

```jsonc
// Client → Server
{ "type": "auth",         "token": "<bearer>" }
{ "type": "chat.start",
  "session_id": "01HV...",
  "user_message_id": "01HV...",
  "content": "...",
  "attachments": ["att_id1","att_id2"],
  "model": "qwen3:8b",
  "think": true,
  "tools": ["lexicon_lookup","corpus_search"],
  "format": null,
  "options": { "num_ctx": 8192, "temperature": 0.4 } }
{ "type": "chat.cancel",  "session_id": "..." }
{ "type": "pull.start",   "model": "qwen3-vl:8b" }

// Server → Client
{ "type": "ready", "server_version": "1.0.0", "ollama_version": "0.16.0" }
{ "type": "chat.thinking.delta", "message_id":"...", "delta":"..." }
{ "type": "chat.content.delta",  "message_id":"...", "delta":"..." }
{ "type": "chat.tool_call",      "message_id":"...", "name":"...", "arguments":{...} }
{ "type": "chat.tool_result",    "message_id":"...", "name":"...", "result":{...} }
{ "type": "chat.done", "message_id":"...", "stats":{
    "prompt_tokens": 123, "completion_tokens": 456,
    "total_duration_ns": 9876543210, "done_reason":"stop"
}}
{ "type": "error", "code":"OLLAMA_UNAVAILABLE", "message":"..." }
{ "type": "pull.progress", "model":"...", "completed":1234, "total":98765, "status":"downloading" }
```

The server MUST never forward `req`/`res` raw bytes; every Ollama NDJSON frame is parsed, persisted to `messages` / `message_audit`, then re-emitted as the WS frame above.

## 12. Frontend Architecture

- **No frameworks.** Plain ES modules, custom-element-free. State is a tiny pub/sub (`webui/js/util/store.js`-style closures).
- `app.js` boots, fetches `/api/health`, opens `WebSocket('ws://'+location.host+'/ws')`, sends `auth` with token from `sessionStorage`, then renders the layout.
- **Components (modules):**
  - `chat/view.js` — virtualised message list (windowing for >5k msgs).
  - `chat/thinking.js` — collapsible `<details>` panel binding to `chat.thinking.delta` frames; rendered with `<pre>` and a token-count badge; never rendered as Markdown to preserve fidelity.
  - `chat/markdown.js` — minimal CommonMark subset (headings, code, lists, links to data: URIs only); strips `<script>`, `javascript:`, event handlers.
  - `corpus/inscription.js` — HTML5 `<canvas>` glyph viewer with zoom/pan; reads `signs.image_path` via `/api/attachments/:id`.
  - `corpus/stats.js` — Zipf log-log plot, entropy bar charts, frequency Pareto. All drawing is custom canvas — no external chart libraries, no CDN.
  - `lexicon/editor.js` — table editor with inline edit + JSON/CSV import-export, drag-drop.
  - `models/picker.js` — lists models from `/api/models`; shows badges (vision/tools/thinking), context length, quantisation, last_used.
  - `settings/view.js` — set `OLLAMA_HOST`, default model, default `num_ctx`, default `keep_alive`, change passphrase.
- **CSP** (set via response header by the static handler):
  `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' ws://localhost:* http://localhost:*; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`.
- **A11y:** keyboard navigation throughout, ARIA roles on chat list, prefers-color-scheme honoured.

## 13. Core Engine (C / C++ / NASM) — Public ABI

`core/include/dc_api.h` (excerpt):

```c
#ifdef _WIN32
#  define DC_API __declspec(dllexport)
#else
#  define DC_API __attribute__((visibility("default")))
#endif

typedef struct dc_engine dc_engine;
typedef struct dc_corpus dc_corpus;

DC_API int  dc_init(const char* log_path);
DC_API void dc_shutdown(void);

DC_API int  dc_db_open(const char* db_path, const char* hex_key, dc_engine** out);
DC_API void dc_db_close(dc_engine*);

DC_API int  dc_corpus_load_json(dc_engine*, const char* json_utf8, size_t len, dc_corpus** out);
DC_API int  dc_corpus_unigram(const dc_corpus*, char** json_out);   /* caller frees with dc_free */
DC_API int  dc_corpus_bigram (const dc_corpus*, char** json_out);
DC_API int  dc_corpus_zipf   (const dc_corpus*, char** json_out);   /* slope, R², KS */
DC_API int  dc_corpus_shannon(const dc_corpus*, double* out_h);
DC_API int  dc_corpus_cond_entropy(const dc_corpus*, double* out_h);
DC_API int  dc_corpus_renyi  (const dc_corpus*, double alpha, double* out);
DC_API int  dc_corpus_yule_k (const dc_corpus*, double* out_k);
DC_API int  dc_align_anneal(const dc_corpus*, const char* known_lexicon_json,
                            const char* params_json, char** result_json);

DC_API int  dc_sha256       (const void* data, size_t n, uint8_t out32[32]);
DC_API int  dc_b64_encode   (const void* in, size_t n, char* out, size_t out_cap, size_t* written);

DC_API void dc_free(void* p);
```

`core/asm/sha256_avx2.asm` and `freq_count_avx2.asm` are NASM x86-64 implementations using `extern` C-callable names with the Microsoft x64 calling convention (`rcx, rdx, r8, r9`, then stack; XMM6–15 callee-saved). On non-AVX2 CPUs the C scalar fallbacks (`dc_sha256.c`, `dc_b64.c`) are dispatched at runtime via `IsProcessorFeaturePresent`/CPUID.

## 14. Build System

### 14.1 `CMakeLists.txt` (top-level)

```cmake
cmake_minimum_required(VERSION 3.28)
project(decipher_copilot
  VERSION 1.0.0
  LANGUAGES C CXX ASM_NASM)

set(CMAKE_C_STANDARD 17)              # C17
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 20)            # C++20
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

if(MSVC)
  add_compile_options(/W4 /permissive- /Zc:__cplusplus /Zc:preprocessor /utf-8 /GS /guard:cf
                      /sdl /Qspectre /DUNICODE /D_UNICODE)
  add_link_options(/guard:cf /DYNAMICBASE /NXCOMPAT /HIGHENTROPYVA)
else()
  add_compile_options(-Wall -Wextra -Wpedantic -Wshadow -Wconversion -fstack-protector-strong)
endif()

set(CMAKE_ASM_NASM_OBJECT_FORMAT "win64")           # Windows; "elf64" elsewhere
set(CMAKE_ASM_NASM_FLAGS "${CMAKE_ASM_NASM_FLAGS} -Xvc")

add_subdirectory(third_party/sqlite)
add_subdirectory(third_party/sqlite3mc)
add_subdirectory(core)
enable_testing()
```

### 14.2 `core/CMakeLists.txt`

```cmake
file(GLOB CORE_C_SRC CONFIGURE_DEPENDS src/*.c)
file(GLOB CORE_CPP_SRC CONFIGURE_DEPENDS cpp/*.cpp)
set(CORE_ASM_SRC
  asm/sha256_avx2.asm
  asm/base64_avx2.asm
  asm/freq_count_avx2.asm
  asm/log2_lookup.asm
  asm/memzero_secure.asm)

add_library(decipher_core SHARED
  ${CORE_C_SRC} ${CORE_CPP_SRC} ${CORE_ASM_SRC})
target_include_directories(decipher_core PUBLIC include
  PRIVATE ${CMAKE_SOURCE_DIR}/third_party/sqlite3mc)
target_link_libraries(decipher_core PRIVATE sqlite3mc)
set_target_properties(decipher_core PROPERTIES
  OUTPUT_NAME "decipher-core"
  WINDOWS_EXPORT_ALL_SYMBOLS OFF)

add_executable(test_entropy tests/test_entropy.c)
target_link_libraries(test_entropy PRIVATE decipher_core)
add_test(NAME entropy COMMAND test_entropy)
# … one add_test per file in core/tests/
```

### 14.3 SQLite + SQLite3MultipleCiphers libraries

```cmake
# third_party/sqlite/CMakeLists.txt is replaced by sqlite3mc which contains both.
add_library(sqlite3mc STATIC sqlite3mc.c)
target_include_directories(sqlite3mc PUBLIC .)
target_compile_definitions(sqlite3mc PUBLIC
  SQLITE_THREADSAFE=1
  SQLITE_ENABLE_FTS5
  SQLITE_ENABLE_JSON1
  SQLITE_ENABLE_RTREE
  SQLITE_USE_URI=1
  SQLITE_DEFAULT_WAL_SYNCHRONOUS=1
  SQLITE_HAS_CODEC
  HAVE_CIPHER_SQLCIPHER=1
  HAVE_CIPHER_AES256CBC=1)
```

### 14.4 Node side (`server/package.json`)

```json
{
  "name": "decipher-server",
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=22.13.0 <23" },
  "private": true,
  "scripts": {
    "start": "node src/index.js",
    "test": "node --test test/",
    "lint": "eslint src test"
  },
  "dependencies": {
    "better-sqlite3-multiple-ciphers": "12.6.2",
    "ws": "8.18.0",
    "pino": "9.5.0",
    "zod": "3.23.8",
    "ulid": "2.3.0",
    "libsodium-wrappers": "0.7.13",
    "pdfjs-dist": "4.7.76",
    "canvas": "3.0.0",
    "ffi-napi": "4.0.3",
    "ref-napi": "3.0.3"
  }
}
```

### 14.5 Build pipeline (`scripts/build.ps1`)

```powershell
# 1) Configure & build native core
cmake --preset windows-release
cmake --build --preset windows-release --target decipher_core --parallel
ctest --preset windows-release

# 2) Stage native artefacts to server/native
New-Item -ItemType Directory -Force -Path server/native | Out-Null
Copy-Item build/windows-release/core/Release/decipher-core.dll server/native/

# 3) Install Node deps (offline cache enforced)
pushd server
npm ci --prefer-offline --no-audit --fund=false
node --test test/
popd

# 4) Optional: bundle Node into single exe via @yao-pkg/pkg or Node SEA
node scripts/build_sea.mjs

# 5) Copy webui static + create dist/
$dist = "dist/decipher-copilot"
Remove-Item -Recurse -Force $dist -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $dist | Out-Null
Copy-Item -Recurse webui $dist/webui
Copy-Item -Recurse server/native $dist/native
Copy-Item server/decipher-server.exe $dist/
Copy-Item -Recurse server/migrations $dist/migrations
Copy-Item docs/SECURITY.md $dist/
```

## 15. Security Considerations

1. **Local-only by default.** The HTTP server binds to `127.0.0.1:7340` (REST) and `127.0.0.1:7341` (WS). Ollama URL is read from `system.db` settings (default `http://127.0.0.1:11434`). No outbound DNS resolution is made by the Node process; the only connect calls are to that explicit IP/hostname.
2. **No telemetry.** `scripts/verify_no_telemetry.ps1` greps the source tree for any of: `googleapis`, `mixpanel`, `segment`, `sentry`, `datadog`, `analytics`, `ga4`, `posthog`, `amplitude`, `cloud.ollama.com`, `0.0.0.0`, fails build on hit. The `pino` logger uses only file transports.
3. **Encryption at rest.** Both DBs are SQLCipher v4 (AES-256-CBC + HMAC-SHA-512). Key is Argon2id-derived from passphrase + per-install salt. Key material is wiped via NASM `memzero_secure` and never logged.
4. **Auth.** Single-user bearer token generated at first run, stored Argon2id-hashed in `system.db.auth_tokens`, plaintext shown once and then only retrievable by the OS user via the local file `data/.token` (mode 0600). Token is required on every REST call and on the first WS frame.
5. **CSRF.** REST mutating routes require either bearer token or double-submit cookie + `X-CSRF-Token` header; SameSite=Strict, Secure, HttpOnly for the cookie.
6. **Input limits.** Body limit 32 MiB; attachments capped 100 MiB; PDF page count capped 500; per-request `num_ctx` clamped to model max (queried via `/api/show`).
7. **Sandboxed PDF rasterisation.** `pdfjs-dist` runs in a `worker_threads.Worker` with `resourceLimits` (max-old-space 256 MiB).
8. **Secure HTTP headers.** `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(),microphone=(),geolocation=()`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Resource-Policy: same-origin`, plus the CSP above.
9. **Path traversal.** All user-supplied paths normalised against an absolute base via `path.resolve` + `startsWith` check; symlinks rejected via `fs.lstat`.
10. **Crypto-strict random.** `crypto.randomBytes`/`crypto.randomUUID` only.
11. **Process hardening.** Run as non-admin; on Windows enable `PROCESS_MITIGATION_DEP_POLICY` + `PROCESS_MITIGATION_ASLR_POLICY` via the C++ launcher; CFG and `/guard:cf` in the DLL.
12. **No `eval`, no `Function()`, no remote `<script>`** in the web UI; SRI not needed because zero remote assets.

## 16. Decipherment-Specific Copilot Features

- **Active script context.** Every chat session is bound to a `script` (and optionally a `corpus_id` and `lexicon_id`). The system prompt template inlines:
  *“You are a research copilot for the {{script.display}} script. Active corpus: {{corpus.name}} ({{n_inscriptions}} inscriptions). Active lexicon: {{lexicon.name}} ({{n_entries}} entries). Use the provided tools (lexicon_lookup, corpus_search, frequency_report, entropy_report, zipf_report) before guessing. Cite inscription IDs.”*
- **LLM-callable tools** (registered in `server/src/tools/*.js`, declared to Ollama via `tools[]`):
  - `lexicon_lookup(lexicon_id, token)`
  - `corpus_search(corpus_id, query, mode: 'fts'|'regex')`
  - `frequency_report(corpus_id, n: 1|2|3, positional: bool)`
  - `entropy_report(corpus_id, kind)`
  - `zipf_report(corpus_id)`
  - `align_proposal(corpus_id, known_lexicon_id, params)` (calls `dc_align_anneal`)
  - `add_lexicon_entry(lexicon_id, token, gloss, confidence, source)`
  - `cross_inscription_check(corpus_id, hypothesis_json)`
- **Cross-inscription coherence checker** runs the proposed sign→reading map across the entire corpus and reports: collocation Mutual Information uplift, n-gram coverage delta, broken-cognate count.
- **Glyph image analysis** uses `qwen3-vl` / `gemma3` / `llama3.2-vision`: PDFs and image attachments are converted to PNGs, then sent as `images: [b64,…]`. The model returns either prose or a structured JSON (when `format` is supplied) listing detected sign IDs with bounding boxes the UI overlays on the canvas.
- **Project state** persisted as JSON in `projects.state_json`: pinned hypotheses, ranked sign-readings, attached corpora, attached lexicons, last analysis runs.
- **Reproducibility.** Every assistant message is paired with a `message_audit` row containing the SHA-256 of the exact request JSON, the Ollama version, and the model digest from `/api/show` — required for academic reuse.

## 17. Operational Behaviour

- On boot the Node server pings `GET {OLLAMA_HOST}/api/version`; if unreachable it serves the UI in a degraded read-only mode and surfaces actionable error toasts (“Ollama not running. Run `ollama serve` or set OLLAMA_HOST.”).
- `OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`, and `OLLAMA_NUM_PARALLEL=2` are recommended in `docs/OLLAMA_NOTES.md` and pre-set by `scripts/start_ollama.ps1`.
- 503 from Ollama (queue full) triggers exponential-backoff retries (50 ms → 1.6 s, max 6 attempts) before surfacing the error.
- Cancelling a chat client-side closes the upstream `fetch` via `AbortController`, which Ollama interprets as cancel.
- Periodic WAL checkpoint task every 60 s: if `*.wal` > 32 MiB → `PRAGMA wal_checkpoint(RESTART)`.
- Log rotation: pino-roll, daily, 14-file retention, gzip; logs are local-only.

## 18. Testing & Acceptance Criteria

- **Unit tests** for every C/C++ source file (`add_test` per file); ASM kernels are tested against the C scalar fallback for byte-exact equality on 1 MiB random inputs.
- **Node tests** (`node --test`): Ollama client (mocked NDJSON server), WS protocol round-trip, DB migrations, route auth, CSRF, attachment validators, PDF rasterisation worker.
- **Web UI smoke tests** via the headless Chromium WebDriver BiDi script in `scripts/smoke_ui.mjs`.
- **End-to-end golden test:** the build succeeds only if a real local Ollama with `qwen3:8b` produces a deterministic (`seed=42, temperature=0`) JSON-schema-constrained answer to a fixed prompt and the response is persisted with thinking tokens captured.

## 19. Build / Run — Command sequence the LLM must produce

```powershell
git clone <repo> && cd decipher-copilot
# prerequisites: VS 2022 BT, NASM 2.16.03, CMake 3.28, Node 22.13, Ollama >= 0.16
pwsh scripts/build.ps1
ollama serve                         # in another terminal
ollama pull qwen3:8b
ollama pull qwen3-vl:8b
ollama pull nomic-embed-text
dist\decipher-copilot\decipher-server.exe --data-dir .\data
# then open http://127.0.0.1:7340 in a Chromium-based browser
```

---

## Caveats

- **Ollama version drift.** The Ollama project ships frequently (≥ one release every 5 days on average; v0.12 → v0.16 between Nov 2025 and Feb 2026, with v0.21–v0.22 RCs in April 2026). Field names like `message.thinking`, `tool_calls[].function.arguments`, and the `format` schema acceptance have been stable since v0.5/v0.9, but the LLM implementing this build MUST query `/api/version` at startup and fail loudly if the daemon is older than v0.9 (no thinking field) or older than v0.5 (no JSON-schema `format`).
- **Streaming + tools** require server-side parser support that landed in 2025; older Ollama servers force `stream:false` when `tools` is set. The implementation in `chatStream.js` therefore probes `/api/version` and falls back to non-stream tool calls on `< 0.7.0`.
- **Vision models vary.** `qwen3-vl`, `gemma3`, `llama3.2-vision`, `qwen2.5vl`, `llava`, `bakllava`, `granite3.2-vision`, `moondream`, `llama4` all accept `images[]`, but exact OCR/layout fidelity differs sharply; the UI lets the user pick per-task.
- **`gpt-oss` reasoning** uses a string `think: "low"|"medium"|"high"` rather than boolean; the client must adapt based on family detected via `/api/show.capabilities` and `/api/show.details.family`.
- **Document ingestion is client-side.** Ollama has no Files API; PDFs must be rasterised in the Node tier before being passed as base64 images. There is no OCR built into Ollama; if pure-text extraction from a scanned PDF is needed, run a local OCR step (e.g. Tesseract via a worker) before sending to a chat model.
- **SQLCipher dependency.** `better-sqlite3-multiple-ciphers` ships pre-built binaries for current Node LTS; if a future Node ABI breaks it, the build pipeline must `npm rebuild --build-from-source` and depend on a system OpenSSL — document this in `docs/BUILD.md`.
- **Cross-platform.** Although Windows is primary, all C/C++ code uses portable headers; the only Windows-specific code is `dc_api.c` thread-safety initialisers (`InitOnceExecuteOnce`) and the launcher hardening flags. NASM object format flips between `win64` and `elf64`/`macho64` via CMake variables.
- **Decipherment realism.** The literature is unanimous that no current method “solves” undeciphered scripts; the copilot is a **research assistant**, not an oracle. Confidence values must be surfaced and the audit table preserved. Models emit hypotheses; humans ratify them.
- **No web search inside the app.** Although Ollama 0.16 ships an OpenClaw-backed web search, this build deliberately disables it (`disable_ollama_cloud:true` in `~/.ollama/server.json`) to honour the zero-telemetry, fully-local mandate.