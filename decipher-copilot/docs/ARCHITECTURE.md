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

## Analysis Engines

### Cross-Script Correlation Engine (`tools/crossScriptCorrelation.js`)

Compares structural properties between different writing systems:
- **Frequency Correlation**: Rank-frequency profile cosine similarity + vocabulary ratio
- **Bigram Correlation**: Transition entropy comparison + bigram-to-unigram ratio
- **Positional Correlation**: Initial/final sign distribution KS-distance comparison
- **Entropy Correlation**: Shannon H1 ratio + conditional H2 ratio similarity

The matrix mode runs all pairs and produces a ranked similarity table.

### Glyph Chaining Engine (`tools/glyphChaining.js`)

Three levels of analysis:

1. **Single Glyph Analysis**: Full profile of one sign — frequency, rank, positional preference, predecessor/successor distributions, combinatorial freedom, contextual usage
2. **Glyph Chain Detection**: Extract all n-grams (2–6), score by PMI/log-likelihood/Dice, categorize as formulaic/lexical/grammatical
3. **Multi-Glyph Analysis**: Deep-dive on a specific sequence — PMI, positional preference, surrounding patterns

### Dataset Loader (`core/datasetImporter.js`)

Handles 5+ JSON schema variants and CSV:
- Array-format entries
- Object-keyed dictionaries
- Nested sections with inner arrays
- Grammar/rule structures
- Large file streaming (>100MB)
- Auto-unzip of .zip archives

### Script Family Organization (`routes/scriptFamily.js`)

Hierarchical organization of 63 scripts into 12 families:
- Semitic, Aegean, Indic, East Asian, Iranian, Anatolian
- Northeast African, European, Mesoamerican, Southeast Asian
- Undeciphered, Isolates

Each script has: family, region, writing type (alphabet/abjad/abugida/syllabary/logographic/mixed), and decipherment status.

## Database Schema

### System Database (system.db)
- `scripts` — Writing system registry with family/region/status
- `script_families` — Hierarchical family tree
- `lexicons` → `lexicon_entries` — Sign vocabularies
- `corpora` → `inscriptions` — Inscription collections
- `analysis_runs` — Historical analysis results
- `glyph_chains` — Detected recurring sign sequences
- `cross_script_correlations` — Pairwise correlation results
- `dataset_uploads` — User-uploaded dataset tracking
- `sign_clusters` — Visual/structural clustering results
- `models` — Available Ollama models
- `settings` — Runtime configuration
- `auth_tokens` — API authentication

### Conversations Database (conversations.db)
- `sessions` — Chat sessions with model/script context
- `messages` — Full message history with thinking tokens and tool calls

## Tool Dispatch (WebSocket Hub)

Available LLM-callable tools (12 total):
1. `lexicon_lookup` — Search sign vocabularies
2. `corpus_search` — Full-text/regex inscription search
3. `frequency_report` — Unigram/bigram/trigram frequencies
4. `entropy_report` — Shannon/conditional/block/Rényi/Yule's K
5. `zipf_report` — Rank-frequency law fit
6. `add_lexicon_entry` — Add proposed readings
7. `cross_inscription_check` — Validate hypotheses across corpus
8. `cross_script_correlation` — Compare two scripts structurally
9. `cross_script_matrix` — Pairwise all-corpora comparison
10. `single_glyph_analysis` — Comprehensive single sign profiling
11. `glyph_chain_detection` — Multi-glyph sequence detection
12. `multi_glyph_analysis` — Analyze specific sign sequences in context

## Frontend Architecture

Vanilla ES2023, zero frameworks, zero CDN dependencies:
- `app.js` — Main orchestrator, event binding, WebSocket management
- `chat/` — Message rendering, streaming, thinking panel, markdown
- `lexicon/` — Lexicon browser panel
- `corpus/` — Corpus explorer panel
- `stats/` — Real-time statistics dashboard (auto-refresh)
- `upload/` — Dataset upload with client-side file reading
- `models/` — Model picker and hotswap
- `settings/` — Configuration panel with model creation

