# User Guide

## Quick Start

### 1. Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 22.13 LTS | Required for server |
| Ollama | ≥ 0.16 | Local AI inference |
| RAM | 8 GB+ | 16 GB for large models |
| Disk | 10 GB+ | For models + datasets |

### 2. Installation

```bash
cd decipher-copilot/server
npm install
```

### 3. Start Ollama

```bash
# Terminal 1
ollama serve

# Pull recommended models
ollama pull gemma4:e4b          # Default (vision + tools + thinking)
ollama pull nomic-embed-text    # For semantic search
```

### 4. Start the Server

```bash
# Terminal 2
cd decipher-copilot/server
node src/index.js
```

On first run, an auth token is generated and printed to console. Save it.

### 5. Open the UI

Navigate to **http://127.0.0.1:7340** in any Chromium-based browser.

---

## Interface Overview

![Main Chat UI](screenshots/01-main-ui.png)

### Sidebar (Left)
- **Model Picker** — Switch between available Ollama models instantly
- **Session List** — All your decipherment sessions, click to resume
- **+ New** — Start a fresh session
- **Settings** — Configure Ollama host, model parameters, abliteration, create custom models
- **Lexicon** — Browse all loaded sign vocabularies
- **Corpus** — Explore loaded inscription corpora
- **Statistics** — Real-time system statistics dashboard (auto-refreshing)
- **Upload Dataset** — Import your own JSON/CSV datasets

### Main Area (Center)
- **Chat Messages** — Streaming conversation with the AI
- **Thinking Panel** — Expandable chain-of-thought reasoning
- **Input Area** — Type messages, attach images/PDFs

### Controls (Header)
- **Script Select** — Filter to a specific writing system
- **🧠 Think** — Toggle chain-of-thought display
- **🔧 Tools** — Toggle LLM tool use (lexicon/corpus lookup)

---

## Working with Scripts

The system ships with **76 ancient and modern scripts** pre-loaded:

| Category | Scripts |
|----------|---------|
| Undeciphered | Linear A, Indus Valley, Proto-Elamite, Phaistos Disc, Cypro-Minoan, Cretan Hieroglyphs, Voynich Manuscript, Byblos Syllabary, Vinča, Tartaria |
| Deciphered | Linear B, Egyptian Hieroglyphs, Hieratic, Demotic, Akkadian, Sumerian, Ugaritic, Phoenician, Paleo-Hebrew, Aramaic, Meroitic, Proto-Sinaitic |
| Classical | Latin (215k+ entries), Ancient Greek, Sanskrit, Old Persian, Hittite, Tocharian, Avestan |
| Semitic/Near East | Arabic, Hebrew, Syriac, Nabataean, Elamite, Luwian Hieroglyphs, Middle Persian, Sogdian |
| Asian | Brahmi, Tamil, Telugu, Kannada, Malayalam, Japanese, Chinese Classical, Korean, Thai, Tibetan, Burmese, Khmer, Javanese Kawi |
| European | Glagolitic, Gothic, Old Norse Runic, Old English, Armenian, Georgian, Etruscan |
| African | Ge'ez, Coptic, Amharic, Maya |

![Scripts API Response](screenshots/03-scripts-api.png)

---

## Chat Features

### Basic Decipherment

Type an inscription or describe a glyph:

```
Decipher this Linear A inscription: A-SA-SA-RA-ME
```

The AI will:
1. Look up signs in the lexicon (via tools)
2. Check corpus frequency data
3. Apply linguistic analysis
4. Provide a reading with confidence levels

### Image Analysis

Click **📎** to attach an inscription photo. Vision-capable models (gemma4, llama3.2-vision) will:
- Identify visible glyphs
- Transcribe the sign sequence
- Provide a decipherment attempt

### Chain-of-Thought

Enable **🧠 Think** to see the model's internal reasoning. This shows:
- Which signs it's considering
- Cross-references to known forms
- Statistical reasoning about frequencies

### Tool Use

With **🔧 Tools** enabled, the model can automatically:
- `lexicon_lookup` — Search sign vocabularies
- `corpus_search` — Find parallel inscriptions
- `frequency_report` — Analyze sign distributions
- `entropy_report` — Compute linguistic metrics
- `zipf_report` — Check Zipf law compliance
- `cross_inscription_check` — Validate hypotheses across corpus
- `cross_script_correlation` — Compare two scripts structurally
- `cross_script_matrix` — Pairwise comparison across all corpora
- `single_glyph_analysis` — Comprehensive single sign profiling
- `glyph_chain_detection` — Find recurring multi-glyph sequences
- `multi_glyph_analysis` — Analyze specific sign sequences in context
- `add_lexicon_entry` — Propose new readings

---

## Cross-Script Correlation

Use the **⚖️ Cross-script Compare** quick action or ask:

```
Compare Linear A and Indus Valley structurally using frequency, bigram, and entropy correlation.
```

The engine compares:
- **Frequency profiles** — Rank-frequency distribution similarity (cosine)
- **Bigram structure** — Transition entropy and complexity ratios
- **Positional patterns** — How signs distribute in initial/final positions
- **Entropy profiles** — Information density comparison

Results include an overall score (0–1) with interpretation.

---

## Glyph Chaining & Pattern Detection

### Single Glyph Analysis

Use the **🔬 Single Glyph Profile** quick action:

```
Analyze sign AB01 in the Linear A corpus. What is its positional preference and combinatorial freedom?
```

Returns: frequency, rank, positional preference, predecessor/successor distributions, co-occurrence networks.

### Chain Detection

Use the **🔗 Glyph Chain Analysis** quick action:

```
Detect all recurring multi-glyph chains in the Linear A corpus with minimum frequency 3.
```

Chains are scored by Pointwise Mutual Information (PMI) and categorized:
- **Formulaic** — Appear primarily at inscription boundaries
- **Lexical** — High PMI (likely compound words or logograms)
- **Grammatical** — Moderate frequency with positional flexibility

### Multi-Glyph Sequence Analysis

```
Analyze the sequence "AB01 AB02 AB03" in the Linear A corpus.
```

Returns: all occurrences, PMI score, positional preference, context patterns.

---

## Uploading Your Own Datasets

Click **⬆ Upload Dataset** in the sidebar to import your own data:

1. **Select a file** — JSON or CSV format
2. **Choose script family** — Optional, auto-detected if omitted
3. **Choose target type** — Lexicon (sign→meaning entries) or Corpus (inscriptions), or auto-detect
4. **Name your dataset** — For display in the interface
5. **Click Upload** — File is parsed client-side and imported server-side

### Supported JSON Formats

```json
// Array of entries
[{"token": "A", "gloss": "water", "confidence": 0.9}]

// Object with entries array
{"entries": [{"token": "A", "gloss": "water"}]}

// Object-keyed dictionary
{"A": {"gloss": "water", "phoneme": "a"}}
```

### Supported CSV Format

```csv
token,gloss,confidence,source
A,water,0.9,Smith 2020
B,house,0.8,Jones 2021
```

Uploaded datasets appear in the lexicon/corpus browsers immediately.

---

## Real-Time Statistics

Click **📊 Statistics** in the sidebar for a live dashboard showing:
- Total scripts, lexicon entries, corpora, inscriptions
- Active sessions and message counts
- Analysis run history
- System metrics (memory, uptime, node version)
- Available models
- Auto-refreshes every 10 seconds

---

## Lexicon Browser

Click **📖 Lexicon** in the sidebar to browse loaded vocabularies.

![Lexicons](screenshots/05-lexicons-api.png)

Each lexicon contains:
- **Token** — The sign ID sequence
- **Gloss** — Proposed reading/translation
- **Confidence** — Scholar confidence (0.0–1.0)
- **Source** — Academic reference

---

## Analysis Tools

### Frequency Analysis

Compute unigram/bigram/trigram frequencies for any corpus:

```
POST /api/analysis/frequency
{ "corpus_id": "...", "n": 2, "positional": true }
```

### Zipf Law Fit

Test whether a script follows Zipf's law (indicative of natural language):

```
POST /api/analysis/zipf
{ "corpus_id": "..." }
```

### Entropy Metrics

Available metrics:
- **Shannon H1** — First-order entropy
- **Conditional H2** — Next-sign predictability
- **Block entropy** — Multi-sign patterns
- **Rényi entropy** — Collision entropy
- **Yule's K** — Vocabulary richness

### Batch Analysis

Run all metrics across multiple corpora in one request:

```
POST /api/analysis/batch
{ "corpus_ids": [...], "analyses": ["zipf", "shannon", "frequency"] }
```

---

## Semantic Search

Build an embedding index for similarity search:

```
POST /api/search/index
{ "corpus_id": "...", "model": "nomic-embed-text" }
```

Then search by meaning:

```
POST /api/search/semantic
{ "query": "fish offering to deity", "top_k": 10 }
```

---

## Model Management

### Hotswap

Switch models anytime from the sidebar dropdown or via API. No restart needed.

### Custom Models

Create decipherment-specialized models from built-in presets:

```
POST /api/models/create
{ "name": "my-decipher", "preset": "decipherment-general" }
```

Available presets:
- `decipherment-general` — Aggressive decipherment
- `glyph-ocr` — Vision sign identification
- `statistical-analyst` — Metric interpretation
- `translation-engine` — Translation attempts
- `reasoning-deep` — Long reasoning chains

---

## Export

Generate publication-ready reports:

```
POST /api/export/report
{ "corpus_id": "...", "format": "latex", "title": "My Analysis" }
```

Supported formats:
- **Markdown** — For documentation, GitHub
- **LaTeX** — For academic papers

---

## Settings

![Settings](screenshots/04-settings-api.png)

Configurable via UI or environment variables:

| Setting | Env Var | Default |
|---------|---------|---------|
| Host | `DECIPHER_HOST` | 127.0.0.1 |
| Port | `DECIPHER_PORT` | 7340 |
| Ollama Host | `OLLAMA_HOST` | http://127.0.0.1:11434 |
| Default Model | `DECIPHER_MODEL` | gemma4:e4b |
| DB Passphrase | `DECIPHER_DB_PASSPHRASE` | (auto-generated) |
| Log Level | `DECIPHER_LOG_LEVEL` | info |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Ollama not reachable" | Run `ollama serve` in another terminal |
| Model not responding | Check `ollama list` — pull the model first |
| Slow responses | Use smaller model (gemma4:e2b) or reduce `num_ctx` |
| DB errors | Delete `data/databases/` and restart (fresh DB) |
| Port in use | Set `DECIPHER_PORT=7341` env var |
| High memory | Reduce `num_ctx` in settings, use quantized models |
