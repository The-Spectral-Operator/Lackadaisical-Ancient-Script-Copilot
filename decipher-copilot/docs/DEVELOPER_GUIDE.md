# Developer Guide

## Project Structure

```
decipher-copilot/
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── index.js        # Entry point — starts HTTP + WS server
│   │   ├── config.js       # All configuration, env vars, model lists
│   │   ├── logger.js       # Pino logger setup
│   │   ├── auth/           # Bearer token generation + validation
│   │   ├── core/           # Dataset importer, FFI bridge
│   │   ├── db/             # SQLite init, migrations, key derivation
│   │   ├── http/           # REST router, middleware, static serving, routes/
│   │   ├── ollama/         # Ollama client, think parser, tool definitions
│   │   ├── tools/          # LLM-callable tools (lexicon, corpus, entropy, etc.)
│   │   ├── util/           # ULID generator, helpers
│   │   └── ws/             # WebSocket hub, protocol frames
│   ├── migrations/         # SQL schema files (0001–0004)
│   └── test/               # Node test runner tests
├── webui/                  # Frontend (vanilla JS, zero frameworks)
│   ├── css/                # Design tokens, layout, chat, dark theme
│   ├── js/                 # app.js + modules (chat, lexicon, corpus, models, settings)
│   ├── vendor/             # prism-tiny.min.js (syntax highlighting)
│   └── index.html          # Single-page app shell
├── core/                   # C17/C++20/NASM native engine
│   ├── asm/                # x86-64 NASM kernels (SHA-256, base64, freq, log2)
│   ├── src/                # C modules (align, db, entropy, sha256, zipf, etc.)
│   ├── cpp/                # C++20 RAII facades
│   └── include/            # Headers
├── datasets/               # 48 JSON/CSV lexicon files (auto-imported)
├── docs/                   # Documentation + screenshots
├── scripts/                # Build/verify scripts
├── third_party/            # Vendored sqlite3mc
└── fonts/                  # System fonts for UI
```

## Development Workflow

### Running in Development

```bash
cd decipher-copilot/server
npm install
node src/index.js
```

The server auto-imports all datasets from `datasets/` on first run (idempotent).

### Running Tests

```bash
cd decipher-copilot/server
npm test
```

### Linting

```bash
cd decipher-copilot/server
npm run lint
```

Uses ESLint with the config in `eslint.config.mjs`.

---

## Adding a New API Route

1. Create route file in `server/src/http/routes/yourRoute.js`:

```javascript
import { parseBody } from '../middleware.js';

export function createYourRoute(db, config, logger) {
  return {
    async myEndpoint(req, res) {
      const body = await parseBody(req);
      // ... logic ...
      res.writeHead(200);
      res.end(JSON.stringify({ result: 'ok' }));
    },
  };
}
```

2. Import and register in `server/src/http/router.js`:

```javascript
import { createYourRoute } from './routes/yourRoute.js';

// In createRouter():
const routes = {
  // ... existing ...
  yourRoute: createYourRoute(db, config, logger),
};

// Add route matching:
if (path === '/api/your/endpoint' && method === 'POST') return routes.yourRoute.myEndpoint(req, res);
```

---

## Adding a New LLM Tool

1. Create tool in `server/src/tools/yourTool.js`:

```javascript
/**
 * @param {object} db - Database handles
 * @param {object} args - Tool arguments from LLM
 * @returns {object} - Result to return to LLM
 */
export function yourTool(db, args) {
  const { corpus_id, param1 } = args;
  if (!corpus_id) return { error: 'corpus_id required' };
  // ... computation ...
  return { result: 'data' };
}
```

2. Register in `server/src/ollama/tools.js` (TOOL_DEFINITIONS array):

```javascript
{
  type: 'function',
  function: {
    name: 'your_tool',
    description: 'What this tool does',
    parameters: {
      type: 'object',
      required: ['corpus_id'],
      properties: {
        corpus_id: { type: 'string' },
        param1: { type: 'number' },
      },
    },
  },
}
```

3. Wire dispatch in `server/src/ws/hub.js` (dispatchTool function):

```javascript
case 'your_tool': return yourTool(db, args);
```

---

## Adding a New Dataset

1. Create JSON file in `datasets/`:

```json
{
  "metadata": {
    "script": "your_script",
    "display": "Your Script Name",
    "version": "1.0",
    "sources": ["Citation 2025"]
  },
  "entries": [
    { "token": "SIGN-01", "gloss": "reading", "confidence": 0.8, "source": "ref" }
  ]
}
```

Or CSV format: `token,gloss,confidence,source`

2. The dataset importer (`server/src/core/datasetImporter.js`) auto-detects format on server start.

---

## Database Schema

Two encrypted SQLite databases:

### system.db
- `scripts` — Script metadata (id, display, era, region)
- `lexicons` — Lexicon metadata
- `lexicon_entries` — Sign→reading pairs with confidence
- `corpora` — Corpus metadata
- `inscriptions` — Individual inscriptions with transcriptions
- `signs` — Sign inventory per script
- `analysis_runs` — Persisted analysis results
- `auth_tokens` — Hashed bearer tokens
- `settings` — Runtime config
- `inscription_embeddings` — Vector embeddings for semantic search
- `sign_clusters` — Clustering results

### conversations.db
- `sessions` — Chat session metadata
- `messages` — Full message history with thinking tokens
- `message_audit` — SHA-256 + model digest for reproducibility

---

## Architecture Decisions

### Why no framework?
- Faster boot time
- No dependency churn
- Full control over HTTP handling
- WebSocket protocol is custom anyway
- Zero attack surface from framework vulnerabilities

### Why vanilla JS frontend?
- No build step needed
- No bundle size concerns
- No framework lock-in
- Direct DOM manipulation is fine for a local tool
- Loads instantly (no hydration, no virtual DOM)

### Why SQLCipher?
- Encrypted at rest (AES-256)
- Same API as SQLite (zero learning curve)
- Single-file databases (portable)
- HMAC integrity verification

### Why Ollama?
- Local-only inference (no cloud dependency)
- Model hotswap without restart
- Streaming support
- Tool calling support
- Vision model support
- Thinking/reasoning mode

---

## Security Considerations

- Server binds to `127.0.0.1` only — never exposed to network
- Bearer token required for API access (auto-generated on first run)
- Chinese-origin models blocked (security policy)
- No telemetry, no outbound connections except to Ollama
- All user input sanitized before DB queries (parameterized)
- CSP headers prevent XSS
- CORS restricted to localhost origins
- Rate limiting: 120 requests/minute per default

---

## Performance Tips

- Use `gemma4:e2b` for faster responses (2B parameter model)
- Set `OLLAMA_FLASH_ATTENTION=1` for faster inference
- Set `OLLAMA_KV_CACHE_TYPE=q8_0` to reduce memory
- Reduce `num_ctx` for less memory usage
- Embedding index (`/api/search/index`) should be run once then queried
- Batch analysis (`/api/analysis/batch`) runs analyses in parallel internally
