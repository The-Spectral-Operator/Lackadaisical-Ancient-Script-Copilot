# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1-alpha] — 2026-05-03

### Added

- **Linear B MASTER Lexicon** — complete Unicode syllabary (74 syllabograms + 14 symbols) merged with 11 Operator/LS definitively resolved signs
  - All 11 previously unresolved Linear B signs carry `DEFINITIVE` status (confidence 0.95–0.98, 5–22 independent cross-script vectors each)
  - LS resolutions preserved under `ls_enhanced_resolution` alongside standard Unicode values — no Standard overwritten
  - File: `linear_b_MASTER_lexicon_unicode_plus_ls_enhanced_2026-05-03.json` — 89 total entries, version 1.3.2026-05-03
- **36 EXPANDED_OPERATOR_SPECTRE reference datasets** — normalized, attestation-indexed lexicons for known deciphered languages used as comparative reference
  - Scripts: Akkadian, Amharic, Arabic, Armenian, Avestan, Burmese, Classical Chinese, Dravidian, Egyptian Hieroglyphs (Gardiner), Georgian, Glagolitic, Gothic, Ancient Greek, Hebrew, Hittite, Javanese Kawi, Kannada, Kharoshthi, Khmer, Korean, Malayalam, Middle Persian, Mycenaean Greek, Nabataean, Old English, Old Norse Runic, Old Persian, Phoenician, Sogdian, Sumerian, Syriac, Tamil, Telugu, Thai, Tibetan, Tocharian
  - Each entry source-indexed against attested resources (Unicode Consortium, CDLI, ORACC, Perseus/LSJ, etc.)
- **`list_scripts` tool** — LLM-callable discovery endpoint; returns all loaded scripts, lexicons with entry counts, and corpora with inscription counts — eliminates tool-call dead-ends caused by unknown IDs
- **`start-copilot.bat` / `stop-copilot.bat`** — one-click Windows server management at project root
  - Start: checks for existing instance on port 7340, verifies Node.js, auto-creates `.env` from example, launches server minimized with stdout/stderr piped to `decipher-copilot/logs/server.log`
  - Stop: finds all PIDs listening on port 7340 and force-kills them

### Changed

- **System prompt injects live DB catalog** — `buildSystemPrompt` now accepts `db` and queries available lexicons and corpora on every request; model sees exact `lexicon_id`/`corpus_id` values with entry/inscription counts before choosing tool arguments
- **Tool usage guidance tightened** — system prompt explicitly instructs: call `lexicon_lookup` without `lexicon_id` to search all scripts at once; call `list_scripts` if corpus ID is unknown; no hedging permitted
- **Dataset priority seeding** — `importAllDatasets` sorts files before seeding so richer data always wins via `INSERT OR REPLACE`
  - Priority 1 (seeds first): basic/legacy files
  - Priority 2: files with `MASTER` or `ls_enhanced` in name — Operator decipherment work
  - Priority 3 (wins last): `EXPANDED_OPERATOR_SPECTRE` files — richest attested reference data
- **`normalizeSignEntry` rewritten** — handles the rich Linear B MASTER format
  - Standard syllabograms: `standard_transliteration` → gloss + transliteration field
  - LS-enhanced signs: `ls_enhanced_resolution.function` → gloss; `.phonetic_value` → transliteration; `.confidence` carried through; notes prefixed `[DEFINITIVE]`; source prefixed `LS:`
  - `sign_type` replaces hardcoded `'sign'` for pos; Unicode object unwrapped to human-readable name/codepoint string
- **`normalizeEntry` extended** — additional field fallbacks for EXPANDED and MASTER formats
  - Token fallbacks added: `e.akkadian`, `e.cuneiform`
  - Gloss fallbacks added: `e.function`, `e.definitions[0]`, `e.interpretation.primary`
  - Pos fallbacks added: `e.semantic_category`
- **`inferScriptName` — 20+ new mappings** — amharic, arabic, armenian, avestan, burmese, classical Chinese, elder futhark, etruscan, georgian, hittite, javanese, kharoshthi, khmer, korean, luwian, middle Persian, mycenaean, nabataean, ogham, old English, old Norse, old Persian, rongorongo, Sanskrit, sogdian, Syriac, Thai, Tibetan, Tocharian; ordering fixed so longer/specific keys match before shorter substrings
- Seeder skip list: `manifest.json` and `attested_resource_catalog.json` excluded (metadata catalog files, not lexicons)
- `buildSystemPrompt` signature updated in both `ws/hub.js` and `http/routes/chat.js`

### Fixed

- **Dashboard 403 Forbidden on Windows** — `static.js` path traversal check hardcoded `'/'` separator; `path.resolve` on Windows returns backslash paths so `fullPath.startsWith(webuiDir + '/')` always failed, returning 403 for every static file request. Fixed by importing `sep` from `node:path`
- **`lexicon_akkadian.json` all entries silently skipped** — original file uses `akkadian`/`cuneiform` field names not present in the `normalizeEntry` token fallback chain; every entry was discarded at seeding. Fixed by adding both fields to the token fallback list

---

## [1.1.0] — 2026-05-01

### Added

- **Ollama API key support** — `OLLAMA_API_KEY` env var wired through all Ollama fetch calls via `Authorization: Bearer` header
  - All 18 direct `fetch()` calls to Ollama across 8 route files now include the auth header
  - `ollamaFetch(baseUrl, apiKey)` factory updated — API key bound at construction time, propagated to all methods (chat, stream, generate, embed, version, tags, show)
  - `config.ollamaAuthHeaders` pre-computed object — single source of truth used by every route
- **Native `.env` loading** — server start script uses `node --env-file=.env` (Node 20.6+ built-in, no dotenv dependency)
- **Smart thinking-mode detection** — `getThinkMode()` rewritten to guard all model families
  - `gpt-oss` family (includes `spectre-origin`, `commander-core`, `elessar`, `cirdan` variants) → returns `"low"|"medium"|"high"` string levels
  - `gemma4`, `phi-4-reasoning`, `deepseek-r1`, `qwen3`, `cogito` → returns boolean `true`/`false`
  - All other models (gemma3, llama, phi3, aurora-elwing, stonedrift-ancient, etc.) → returns `undefined` — `think` field omitted from request entirely
  - Same guard applied to `routes/chat.js` REST fallback path
- **`ancient_script` capability flag** — model list endpoint (`GET /api/models`) now returns `capabilities.ancient_script: true` for stonedrift, aurora-elwing, and spectre-origin models
- **Expanded recommended models** — spectre-origin variants, aurora-elwing-v2, commander-core variants added to `config.recommendedModels`

### Changed

- Default vision model changed to `aurora-elwing-v2:latest`
- `server/package.json` start script: `node src/index.js` → `node --env-file=.env src/index.js`
- Model capability detection in `GET /api/models` now recognises `aurora-elwing`, `stonedrift`, `spectre-origin`, and `commander-core` families for vision/thinking flags

### Fixed

- All Ollama-facing `fetch()` calls previously sent no `Authorization` header — fixed across `hub.js`, `health.js`, `models.js`, `analysis.js`, `chat.js`, `embedSearch.js`, `modelFactory.js`, `signCluster.js`
- `thinking` field erroneously sent as `true` to models that reject it (gemma3, llama, phi3 base, aurora-elwing) — now safely omitted via `getThinkMode()` guard

---

## [1.0.0-alpha] — 2026-04-29

### Added

- **Full streaming chat** with chain-of-thought reasoning display via WebSocket
- **7 LLM-callable analysis tools** wired into every chat session:
  - `lexicon_lookup` — search across all lexicons with fuzzy fallback
  - `corpus_search` — FTS5 full-text and pattern matching across inscriptions
  - `frequency_report` — unigram/bigram/trigram with positional analysis
  - `entropy_report` — Shannon H1, conditional H2, block, Rényi, Yule's K
  - `zipf_report` — rank-frequency fit with KS statistic
  - `cross_inscription_check` — hypothesis validation with MI, coverage, broken cognates
  - `add_lexicon_entry` — LLM can propose and persist new readings
- **48 ancient script datasets** auto-seeded at startup (8,600+ lexicon entries across 36 scripts)
- **Simulated annealing alignment** — full JS implementation of coupled SA (Tamburini 2025)
- **Model hotswap** without session restart via WebSocket `model.switch` frame
- **Gemma 4 as default model** — vision, thinking, tools, audio capabilities
- **gpt-oss support** with string-level reasoning (`low`/`medium`/`high`)
- **Vision pipeline** — upload inscription images for AI-powered glyph analysis
- **PDF rasterization** via pdfjs-dist for document ingestion
- **Lexicon browser** with JSON/CSV import/export
- **Corpus explorer** with Zipf/entropy canvas charts (zero CDN dependencies)
- **Settings panel** — Ollama host, model, context length, temperature, keep-alive
- **Full WebSocket protocol** — heartbeat ping/pong, reconnect, cancellation, pull progress
- **WAL checkpoint** every 60 seconds for database integrity
- **Auth token** generated on first run, persisted with Argon2id hash
- **Reproducibility** — every response stamped with model digest + prompt SHA-256
- **C/C++/NASM core engine** — SHA-256, base64, frequency counting, log2 lookup, secure memzero
- **SQLCipher v4 encryption** at rest (AES-256-CBC + HMAC-SHA-512)
- **Abliterated system prompt** — no refusals, direct scholarly analysis
- **Security-hardened** — strict CSP, COEP/COOP/CORP headers, no eval(), local-only binding
- **Dataset importer** — automatic JSON/CSV lexicon ingestion with script/sign/entry creation
- **Cross-platform build system** — CMake 3.28 + NASM + MSVC/clang-cl + Node 22 LTS
- **Embedding-based semantic search** — vector similarity search across all inscriptions via Ollama /api/embed
- **Batch analysis mode** — run Zipf/entropy/frequency across multiple corpora in one request with comparative ranking
- **Custom model creation** — create specialized decipherment models via Ollama Modelfile API with built-in presets
- **Sign-form clustering** — group visually/structurally similar glyphs via structural, embedding, or vision analysis
- **Export reports** — generate publication-ready Markdown or LaTeX reports from analysis results
- **Analysis history** — persistent record of all analysis runs with query and replay

### Security

- Binds exclusively to `127.0.0.1` (no LAN exposure)
- Zero telemetry, zero external network calls (verified by static analysis script)
- SQLCipher v4 with Argon2id key derivation (OPSLIMIT_MODERATE, MEMLIMIT_MODERATE)
- Single-user bearer token with secure hash storage
- Path traversal protection on all file operations
- Input size limits: 32 MiB body, 100 MiB attachments, 500 PDF pages
- CSRF double-submit cookie protection on mutations
- No `eval()`, no `Function()`, no remote scripts anywhere in the codebase

## [Unreleased]

### Added

- **Cross-script correlation engine** — compare structural properties between scripts via frequency, bigram, positional, and entropy analysis methods
  - `cross_script_correlation` tool — pairwise corpus comparison with overall similarity score
  - `cross_script_matrix` tool — run all pairwise correlations across available corpora
- **Glyph chaining & pattern detection** — detect recurring multi-glyph sequences
  - `single_glyph_analysis` tool — comprehensive single sign profiling (frequency, rank, positional preference, predecessors/successors, co-occurrence, context windows)
  - `glyph_chain_detection` tool — extract n-grams scored by PMI/log-likelihood/Dice; categorize as formulaic/lexical/grammatical
  - `multi_glyph_analysis` tool — deep analysis of specific sign sequences with context patterns
- **Dataset upload from frontend** — upload JSON/CSV datasets via the UI
  - `POST /api/datasets/upload` — parse, validate, and import as lexicon or corpus
  - Auto-detect target type (lexicon vs corpus) from content structure
  - Full CRUD: list, get, delete uploaded datasets
- **Script family organization** — 63 scripts organized into 12 language families
  - Families: Semitic, Aegean, Indic, East Asian, Iranian, Anatolian, Northeast African, European, Mesoamerican, Southeast Asian, Undeciphered, Isolates
  - Each script: family_id, region, writing_type, decipherment status
  - `GET /api/scripts/organized` — hierarchical family→scripts tree
  - `GET /api/scripts/stats` — real-time per-script statistics
- **Real-time statistics dashboard** — live system metrics panel
  - `GET /api/stats/realtime` — full system snapshot (counts, models, recent activity)
  - `GET /api/stats/system` — memory, uptime, node version, DB sizes
  - `GET /api/stats/corpus/:id` — live per-corpus analytics (entropy, Zipf, hapax, bigrams)
  - Frontend panel with auto-refresh every 10 seconds
- **Custom unfiltered research model** — `scripts/Modelfile.decipher-research` for Ollama
  - Fully abliterated system prompt optimized for decipherment
  - Create from UI via Settings → Create Research Model
- **Model creation UI** — create custom models from presets directly in settings panel
- **Tool count expanded** from 7 to 12 LLM-callable tools
- **New database migration** (0005) for glyph_chains, cross_script_correlations, dataset_uploads, script_families tables

### Planned

- Multi-project workspace support with versioned hypothesis trees
