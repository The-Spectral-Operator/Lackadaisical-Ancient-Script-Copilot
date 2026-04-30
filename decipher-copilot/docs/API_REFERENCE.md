# API Reference

## Base URL

```
http://127.0.0.1:7340/api
```

All API responses are JSON. WebSocket endpoint: `ws://127.0.0.1:7340/ws`

---

## System

### GET /api/health

System health check. Returns Ollama connectivity, DB status, model config.

**Response:**
```json
{
  "status": "ok",
  "ollama": {
    "reachable": true,
    "version": "0.22.4"
  },
  "db": { "ok": true },
  "defaultModel": "gemma4:e4b",
  "hotswap": true
}
```

Status values: `ok` (all green), `degraded` (Ollama unreachable), `error` (DB failure)

### GET /api/version

```json
{ "version": "1.0.0", "model": "gemma4:e4b" }
```

### GET /api/settings

Returns current server configuration (read-only sensitive fields omitted).

### PUT /api/settings

Update runtime settings (Ollama host, model options, etc.).

---

## Models

### GET /api/models

List available Ollama models. Proxies to Ollama `/api/tags`.

### GET /api/models/:name

Show model details (size, parameters, template). Proxies to Ollama `/api/show`.

### POST /api/models/pull

Pull a model from Ollama registry.

```json
{ "name": "gemma4:e4b" }
```

Streams progress via NDJSON.

### DELETE /api/models/:name

Delete a model from Ollama.

### POST /api/models/create

Create a custom model from a Modelfile spec or built-in preset.

```json
{ "name": "my-decipher", "preset": "decipherment-general" }
```

Or with raw Modelfile:
```json
{ "name": "my-model", "modelfile": "FROM gemma4:e4b\nSYSTEM \"...\"" }
```

### POST /api/models/copy

Copy/alias a model.

```json
{ "source": "gemma4:e4b", "destination": "my-backup" }
```

### GET /api/models/presets

List built-in decipherment model presets.

```json
{
  "presets": [
    { "id": "decipherment-general", "name": "Decipherment General", "base": "gemma4:e4b" },
    { "id": "glyph-ocr", "name": "Glyph OCR Specialist", "base": "gemma4:e4b" },
    { "id": "statistical-analyst", "name": "Statistical Analyst", "base": "gemma4:e4b" },
    { "id": "translation-engine", "name": "Translation Engine", "base": "gemma4:e4b" },
    { "id": "reasoning-deep", "name": "Deep Reasoning", "base": "gemma4:e12b" }
  ]
}
```

---

## Sessions

### GET /api/sessions

List all chat sessions.

### POST /api/sessions

Create a new session.

```json
{ "title": "Linear A Analysis", "script": "linear_a", "model": "gemma4:e4b" }
```

### GET /api/sessions/:id

Get session details.

### PATCH /api/sessions/:id

Update session (title, script, model, archived flag).

### DELETE /api/sessions/:id

Delete a session and all its messages.

---

## Messages

### GET /api/sessions/:id/messages

List messages in a session. Returns full conversation history with thinking tokens.

### POST /api/sessions/:id/messages

Send a message (non-streaming fallback). For streaming, use WebSocket.

---

## Lexicons

### GET /api/lexicons

List all loaded lexicons with entry counts.

**Response (abbreviated):**
```json
{
  "lexicons": [
    { "id": "lex_indus_valley", "script_id": "indus_valley", "name": "Indus Valley Lexicon", "entry_count": 2502 },
    { "id": "lex_demotic_egyptian", "script_id": "demotic_egyptian", "name": "Demotic Egyptian Lexicon", "entry_count": 1276 },
    { "id": "lex_imperial_aramaic", "script_id": "imperial_aramaic", "name": "Imperial Aramaic Lexicon", "entry_count": 1256 }
  ]
}
```

### POST /api/lexicons

Create a new lexicon.

### GET /api/lexicons/:id/entries

List entries in a lexicon (paginated).

### POST /api/lexicons/:id/entries

Add or update a lexicon entry.

```json
{ "token": "AB01", "gloss": "a", "confidence": 0.85, "source": "Godart & Olivier 1976" }
```

### POST /api/lexicons/:id/import

Bulk import entries from JSON/CSV.

---

## Corpora

### GET /api/corpora

List all loaded corpora.

### POST /api/corpora

Create a new corpus.

### POST /api/corpora/:id/import

Import inscriptions into a corpus.

### GET /api/scripts

List all registered script systems (75 total).

---

## Analysis

### POST /api/analysis/zipf

Zipf law rank-frequency analysis.

```json
{ "corpus_id": "..." }
```

Returns: slope, R², KS statistic, top-30 signs, interpretation.

### POST /api/analysis/entropy

Entropy metrics computation.

```json
{ "corpus_id": "...", "kind": "shannon" }
```

Kinds: `shannon`, `conditional`, `block`, `rényi`, `yule_k`

### POST /api/analysis/frequency

N-gram frequency analysis.

```json
{ "corpus_id": "...", "n": 2, "positional": true }
```

### POST /api/analysis/align

Simulated annealing alignment. Finds optimal sign→reading mappings.

```json
{
  "corpus_id": "...",
  "known_lexicon_id": "...",
  "params": { "max_iterations": 10000, "initial_temp": 2.0, "cooling_rate": 0.9995 }
}
```

### POST /api/analysis/batch

Run multiple analyses across corpora.

```json
{
  "corpus_ids": ["id1", "id2"],
  "analyses": ["zipf", "shannon", "conditional", "frequency"],
  "frequency_n": 2
}
```

Returns comparative linguistic ranking across corpora.

### GET /api/analysis/history

Past analysis runs with results.

---

## Semantic Search

### POST /api/search/index

Build embedding index for a corpus.

```json
{ "corpus_id": "...", "model": "nomic-embed-text", "batch_size": 32 }
```

### POST /api/search/semantic

Search by meaning across indexed inscriptions.

```json
{ "query": "offering to goddess", "corpus_id": "...", "top_k": 20 }
```

### GET /api/search/status

Index status per corpus (coverage percentage).

---

## Sign Clustering

### POST /api/signs/cluster

Cluster signs by similarity.

```json
{ "script_id": "linear_a", "method": "structural" }
```

Methods: `structural`, `embedding`, `vision`

### POST /api/signs/identify

Identify a sign from an image using vision model.

```json
{ "image_base64": "...", "script_id": "linear_a" }
```

### GET /api/signs/clusters/:id

Retrieve a previously computed cluster result.

---

## Export

### POST /api/export/report

Generate analysis report.

```json
{ "corpus_id": "...", "format": "latex", "title": "My Report", "author": "Researcher" }
```

Formats: `markdown`, `latex`

### POST /api/export/corpus

Export full corpus + analysis history.

```json
{ "corpus_id": "...", "format": "markdown", "include_inscriptions": true }
```

---

## Attachments

### POST /api/attachments

Upload image or PDF for analysis.

### GET /api/attachments/:id

Retrieve an uploaded attachment.

---

## WebSocket Protocol

### Connection

```
ws://127.0.0.1:7340/ws
```

### Frames (Client → Server)

| Type | Purpose |
|------|---------|
| `ping` | Heartbeat |
| `auth` | Authentication |
| `chat.start` | Start streaming chat |
| `chat.cancel` | Cancel active generation |
| `model.switch` | Switch model mid-session |
| `pull.start` | Pull a model |

### Frames (Server → Client)

| Type | Purpose |
|------|---------|
| `ready` | Server info on connect |
| `pong` | Heartbeat response |
| `auth.ok` | Auth confirmed |
| `chat.thinking.delta` | Reasoning token stream |
| `chat.content.delta` | Response token stream |
| `chat.tool_call` | Tool invocation |
| `chat.tool_result` | Tool response |
| `chat.done` | Generation complete |
| `chat.cancelled` | Generation cancelled |
| `model.switched` | Model change confirmed |
| `pull.progress` | Model download progress |
| `error` | Error frame |

### Example: Chat Start

```json
{
  "type": "chat.start",
  "session_id": "01JAXYZ...",
  "content": "Decipher this inscription: A-SA-SA-RA-ME",
  "model": "gemma4:e4b",
  "think": true,
  "tools": ["lexicon_lookup", "corpus_search"],
  "script": "linear_a"
}
```

---

## Error Responses

All errors follow the format:

```json
{ "error": "error_code", "message": "Human-readable description" }
```

Common codes:
- `not_found` — Route or resource doesn't exist
- `validation_error` — Invalid request body
- `ollama_unavailable` — Ollama not reachable
- `model_blocked` — Model on security blocklist
- `internal` — Server error
