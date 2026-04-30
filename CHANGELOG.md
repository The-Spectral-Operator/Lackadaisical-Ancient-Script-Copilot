# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

### Planned

- Multi-project workspace support with versioned hypothesis trees
