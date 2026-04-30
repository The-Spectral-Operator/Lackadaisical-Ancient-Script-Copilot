# 𓂀 Ancient Script Decipherment Copilot — Alpha v1.0.0

> **Local. Abliterated. No Refusals. No Telemetry. Pure Research.**

A self-hosted AI copilot for ancient script decipherment, translation, and statistical analysis. Runs 100% local via Ollama. No cloud. No subscriptions. No censorship of scholarly inquiry.

![Ancient Script Decipherment Copilot](https://github.com/user-attachments/assets/a1527fee-eed3-45aa-bb53-66dc30f70dbf)

---

## What It Does

- **Decipher**: Feed it Linear A, Indus Valley, Voynich, Proto-Elamite, Phaistos Disc, or any of 63 supported scripts — get AI-powered sign-by-sign analysis with confidence scores
- **Translate**: Full translation pipeline for all attested and partially-attested scripts, including crossreference with 8,600+ lexicon entries
- **Analyze**: Zipf law fit, Shannon entropy, conditional entropy, block entropy, Rényi entropy, Yule's K, unigram/bigram/trigram frequency, corpus-wide coherence checking
- **Cross-Script Correlation**: Compare structural properties between scripts via frequency, bigram, positional, and entropy analysis — detect kinship between writing systems
- **Glyph Chaining**: Detect recurring multi-glyph sequences scored by mutual information; single glyph profiling with positional/combinatorial analysis
- **Pattern Detection**: Identify formulaic expressions, compound signs, and grammatical markers through PMI and log-likelihood scoring
- **Stream**: Real-time WebSocket streaming with chain-of-thought reasoning visible in the collapsible thinking panel
- **Vision**: Upload inscription photos or PDFs — vision models (gemma4, llama3.2-vision) analyze glyphs directly
- **Tools**: 12 LLM-callable tools for lexicon lookup, corpus search, frequency/entropy/Zipf reports, cross-inscription validation, cross-script correlation, glyph chaining, and more
- **Upload Datasets**: Import your own JSON/CSV datasets from the frontend — auto-detected as lexicon or corpus entries
- **Real-Time Statistics**: Live dashboard with system metrics, corpus analytics, and analysis history
- **Script Families**: 63 scripts organized into 12 language families by region, era, and writing type
- **Semantic Search**: Embedding-based vector similarity search across all inscriptions
- **Batch Analysis**: Run multiple analysis types across all corpora with comparative linguistic ranking
- **Model Factory**: Create custom unfiltered decipherment-focused models from built-in presets via Ollama Modelfile API
- **Sign Clustering**: Group similar glyphs by structural, embedding, or vision-based similarity
- **Export**: Generate publication-ready Markdown or LaTeX reports from any analysis

---

## Stack

| Component | Version |
|-----------|---------|
| Node.js | v22 LTS (v20 compatible) |
| Ollama | ≥ 0.16.0 |
| SQLite (better-sqlite3-multiple-ciphers) | 12.6.x |
| WebSocket (ws) | 8.18.x |
| Zod | 3.23.x |
| pino | 9.x |
| Frontend | Vanilla ES2023, zero frameworks, zero CDN |

Zero telemetry. Verified by `scripts/verify_no_telemetry.ps1`.

---

## Datasets (70+ files, 63 scripts, 8,606+ lexicon entries)

All datasets seed automatically on first server start. Scripts organized into 12 families:

| Family | Scripts |
|--------|---------|
| Undeciphered | Linear A, Indus Valley, Proto-Elamite, Phaistos Disc, Cypro-Minoan, Cretan Hieroglyphs, Voynich Manuscript, Byblos Syllabary, Vinča, Tartaria, Linear Elamite |
| Aegean | Linear A, Linear B, Cretan Hieroglyphs, Cypro-Minoan, Phaistos Disc, Mycenaean Greek |
| Semitic | Phoenician, Hebrew, Aramaic, Arabic, Nabataean, Syriac, Ugaritic, Akkadian, Musnad, Proto-Sinaitic, Byblos |
| Northeast African | Egyptian Hieroglyphs, Hieratic, Demotic, Coptic, Meroitic, Ge'ez, Amharic |
| Iranian | Old Persian, Middle Persian, Avestan, Sogdian, Proto-Elamite, Linear Elamite, Elamite |
| Indic | Indus Valley, Brahmi, Sanskrit, Tamil, Telugu, Kannada, Malayalam, Tibetan |
| East Asian | Classical Chinese, Japanese, Korean |
| European | Greek, Latin, Etruscan, Gothic, Glagolitic, Old Norse Runic, Old English, Armenian, Georgian |
| Southeast Asian | Thai, Khmer, Burmese, Javanese Kawi |
| Anatolian | Hittite, Luwian Hieroglyphs |
| Mesoamerican | Maya (glyphs + grammar + phonetics + morphology) |
| Isolates | Sumerian, Tocharian |

**Upload your own**: JSON/CSV datasets can be uploaded from the frontend UI.

---

## Quick Start

### Prerequisites
- [Ollama ≥ 0.16.0](https://ollama.com/download)
- Node.js ≥ 20.x
- 8GB RAM minimum (16GB recommended for 12B+ models)

### Run

```bash
# 1. Clone
git clone https://github.com/Lackadaisical-Security/Lackadaisical-Ancient-Script-Copilot
cd Lackadaisical-Ancient-Script-Copilot/decipher-copilot/server

# 2. Install dependencies
npm install

# 3. Start Ollama (separate terminal)
ollama serve

# 4. Pull a model (abliterated recommended)
ollama pull gemma4:e4b
# Or for pure reasoning on text:
ollama pull phi-4-reasoning:14b

# 5. Start the server
node src/index.js
```

Open **http://127.0.0.1:7340** in any Chromium-based browser.

The auth token is printed to console on first run and saved to `data/.token`.

### Model Recommendations

| Use Case | Model |
|----------|-------|
| Best all-round (vision + tools + thinking) | `gemma4:e4b` |
| Better reasoning, more VRAM | `gemma4:e12b` |
| Vision/OCR of inscription photos | `llama3.2-vision:11b` |
| Deep reasoning chains | `phi-4-reasoning:14b` |
| Embeddings | `nomic-embed-text` |

---

## Architecture

```
decipher-copilot/
├── server/          # Node.js HTTP + WebSocket backend
│   ├── src/
│   │   ├── http/    # REST API routes (sessions, lexicon, corpus, analysis, search, export)
│   │   ├── ws/      # WebSocket hub (streaming chat, tool dispatch)
│   │   ├── ollama/  # Ollama NDJSON client, thinkParser, tool schemas
│   │   ├── tools/   # LLM-callable: lexiconLookup, corpusSearch, zipf/entropy/freq, crossCheck, crossScriptCorrelation, glyphChaining
│   │   ├── db/      # SQLite prepared statements, migrations, key derivation
│   │   ├── auth/    # Bearer token + CSRF
│   │   └── core/    # Dataset importer, FFI bridge to C engine (optional)
│   └── migrations/  # SQL migrations (0001–0005)
├── webui/           # Vanilla JS, zero frameworks, zero CDN
│   ├── css/         # Tokens, layout, chat, inscription, dark theme
│   ├── js/          # app.js + chat/lexicon/corpus/models/settings/stats/upload modules
│   └── vendor/      # prism-tiny.min.js (MIT, vendored)
├── scripts/         # Modelfiles for custom unfiltered research models
├── core/            # C17/C++20/NASM native engine
│   ├── asm/         # AVX2 SHA-256, base64, freq count, log2, secure memzero
│   ├── src/         # dc_sha256, dc_align, dc_entropy, dc_zipf, dc_db, etc.
│   └── cpp/         # C++20 RAII facades
├── datasets/        # 48 lexicon/corpus JSON+CSV files
└── docs/            # ARCHITECTURE, BUILD, SECURITY, OLLAMA_NOTES, DECIPHERMENT_METHODS
```

### Security

- Binds to `127.0.0.1` only (no LAN exposure by default)
- SQLCipher v4 encryption at rest (AES-256-CBC + HMAC-SHA-512)
- Argon2id key derivation for DB passphrase
- Single-user bearer token (plaintext shown once, then Argon2id-hashed in DB)
- CSRF double-submit cookie for REST mutations
- Strict CSP: `default-src 'self'`, no remote script/style/font/image
- COEP + COOP headers, CORP on all static responses
- Zero eval(), zero Function(), zero CDN calls anywhere

---

## API Overview

### REST (http://127.0.0.1:7340/api/)

**Core:**
`/api/health` · `/api/models` · `/api/sessions` · `/api/sessions/:id/messages`

**Data:**
`/api/lexicons` · `/api/lexicons/:id/entries` · `/api/corpora` · `/api/scripts`
`/api/attachments` · `/api/settings` · `/api/datasets/upload` · `/api/datasets`

**Analysis:**
`/api/analysis/zipf` · `/api/analysis/entropy` · `/api/analysis/frequency` · `/api/analysis/align`
`/api/analysis/batch` · `/api/analysis/history`

**Cross-Script & Glyph Chaining (via LLM tools):**
`cross_script_correlation` · `cross_script_matrix` · `single_glyph_analysis` · `glyph_chain_detection` · `multi_glyph_analysis`

**Script Organization:**
`/api/scripts/families` · `/api/scripts/organized` · `/api/scripts/stats`

**Statistics:**
`/api/stats/realtime` · `/api/stats/system` · `/api/stats/corpus/:id`

**Search:**
`/api/search/semantic` · `/api/search/index` · `/api/search/status`

**Model Factory:**
`/api/models/create` · `/api/models/copy` · `/api/models/presets`

**Sign Clustering:**
`/api/signs/cluster` · `/api/signs/identify` · `/api/signs/clusters/:id`

**Export:**
`/api/export/report` · `/api/export/corpus`

### WebSocket (ws://127.0.0.1:7340/ws)
`chat.start` → streaming with `chat.thinking.delta` + `chat.content.delta` + `chat.tool_call` + `chat.tool_result` + `chat.done`
`model.switch` → hotswap model mid-session
`pull.start` → pull model with `pull.progress` updates

Full protocol in `docs/ARCHITECTURE.md`.

---

## Decipherment Methods

See `docs/DECIPHERMENT_METHODS.md` for full details on:
- Zipf law fit (slope, R², KS statistic)
- Shannon entropy H1/H2
- Block entropy, Rényi, Yule's K
- Simulated annealing cognate alignment
- Cross-inscription coherence checking
- Vision glyph analysis pipeline
- Embedding-based semantic search

---

## Alpha Release Notes

**v1.0.0-alpha — April 2026**

- Full streaming chat with chain-of-thought reasoning display
- 12 LLM-callable analysis tools wired into every chat session
- 70+ datasets auto-seeded at startup (8,600+ lexicon entries across 63 scripts)
- Cross-script correlation engine (frequency, bigram, positional, entropy methods)
- Glyph chain detection with PMI scoring and categorization (formulaic/lexical/grammatical)
- Single/multi glyph analysis with full sign profiling
- Dataset upload from frontend (JSON/CSV) connected to backend
- Real-time statistics dashboard with auto-refresh
- Script family organization (12 families, 63 scripts with region/era/writing type)
- Custom unfiltered research model creation via Modelfile presets
- Model hotswap without session restart
- Lexicon browser with JSON/CSV export
- Corpus explorer with Zipf/entropy canvas charts
- Embedding-based semantic search with batch indexing
- Batch analysis mode with comparative linguistic ranking
- Sign-form clustering (structural, embedding, vision)
- LaTeX/Markdown report export
- Settings panel (Ollama host, model, context length, temperature)
- Full WebSocket protocol with heartbeat, reconnect, cancellation
- WAL checkpoint every 60s
- Auth token generated on first run
- Reproducible: every response stamped with model digest + prompt SHA-256

**Known Limitations (alpha)**:
- C core engine (`decipher-core.dll`) requires MSVC build — JS fallbacks handle all computation without it
- PDF rasterization requires `node-canvas` native build (pre-built binaries included for Linux/Windows x64)
- No multi-user support by design (local single-user tool)

---

*Lackadaisical Security — Merit-based. Receipts over rhetoric.*
