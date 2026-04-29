# System Test Report

**Date:** 2026-04-29  
**Version:** 1.0.0-alpha  
**Environment:** Ubuntu Linux (CI), Node.js 20.20.2  

---

## Server Startup

✅ Server starts cleanly  
✅ Auth token generated on first run  
✅ Datasets auto-imported (36 scripts, 36 lexicons, 8,606 entries)  
✅ Data directories created automatically  
✅ Migrations run successfully  
✅ Graceful shutdown handlers registered  

**Startup Output:**
```
╔══════════════════════════════════════════╗
║  Ancient Script Decipherment Copilot     ║
║  Alpha Release v1.0.0                    ║
╠══════════════════════════════════════════╣
║  UI:     http://127.0.0.1:7340          ║
║  WS:     ws://127.0.0.1:7340/ws         ║
║  Ollama: http://127.0.0.1:11434         ║
║  Model:  gemma4:e4b (abliterated)       ║
╚══════════════════════════════════════════╝
```

---

## API Endpoint Tests

### System Endpoints

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/health` | GET | ✅ | Returns full system status |
| `/api/version` | GET | ✅ | Returns `{"version":"1.0.0","model":"gemma4:e4b"}` |
| `/api/settings` | GET | ✅ | Full config response |
| `/api/settings` | PUT | ✅ | Updates runtime config |

### Scripts & Lexicons

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/scripts` | GET | ✅ | Returns 36 scripts |
| `/api/lexicons` | GET | ✅ | Returns 36 lexicons, 8,606 total entries |
| `/api/lexicons/:id/entries` | GET | ✅ | Returns full entry list (tested: Indus Valley 2,502, Maya 597) |
| `/api/lexicons/:id/entries` | POST | ✅ | Upsert entries |
| `/api/lexicons/:id/import` | POST | ✅ | Bulk import |

### Sessions & Messages

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/sessions` | GET | ✅ | Lists sessions |
| `/api/sessions` | POST | ✅ | Creates session with ULID, returns full object |
| `/api/sessions/:id` | GET | ✅ | Session detail |
| `/api/sessions/:id` | PATCH | ✅ | Update |
| `/api/sessions/:id` | DELETE | ✅ | Delete |
| `/api/sessions/:id/messages` | GET | ✅ | Message history |

### Analysis

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/analysis/zipf` | POST | ✅ | Returns error for empty corpus (correct) |
| `/api/analysis/entropy` | POST | ✅ | Shannon/conditional/block/Rényi/Yule |
| `/api/analysis/frequency` | POST | ✅ | Unigram/bigram/trigram |
| `/api/analysis/align` | POST | ✅ | Simulated annealing |
| `/api/analysis/batch` | POST | ✅ | Multi-corpus batch analysis |
| `/api/analysis/history` | GET | ✅ | Returns past runs |

### Search

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/search/semantic` | POST | ✅ | Vector similarity search |
| `/api/search/index` | POST | ✅ | Build embedding index |
| `/api/search/status` | GET | ✅ | Index coverage |

### Models

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/models` | GET | ✅ | Lists available (requires Ollama) |
| `/api/models/pull` | POST | ✅ | Pull model (requires Ollama) |
| `/api/models/create` | POST | ✅ | Custom model creation |
| `/api/models/copy` | POST | ✅ | Model aliasing |
| `/api/models/presets` | GET | ✅ | 5 built-in presets |

### Sign Clustering

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/signs/cluster` | POST | ✅ | Structural/embedding/vision clustering |
| `/api/signs/identify` | POST | ✅ | Vision sign identification |
| `/api/signs/clusters/:id` | GET | ✅ | Retrieve results |

### Export

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/export/report` | POST | ✅ | Markdown/LaTeX report generation |
| `/api/export/corpus` | POST | ✅ | Full corpus export |

### Other

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/corpora` | GET | ✅ | List corpora |
| `/api/corpora` | POST | ✅ | Create corpus |
| `/api/attachments` | POST | ✅ | File upload |
| `/api/embed` | POST | ✅ | Embedding generation |

---

## WebSocket Protocol Tests

| Frame | Direction | Status | Notes |
|-------|-----------|--------|-------|
| `ready` | Server→Client | ✅ | Sent on connect with server info |
| `ping`/`pong` | Bidirectional | ✅ | Heartbeat working |
| `chat.start` | Client→Server | ✅ | Initiates streaming |
| `chat.content.delta` | Server→Client | ✅ | Token streaming |
| `chat.thinking.delta` | Server→Client | ✅ | CoT streaming |
| `chat.tool_call` | Server→Client | ✅ | Tool invocation |
| `chat.tool_result` | Server→Client | ✅ | Tool response |
| `chat.done` | Server→Client | ✅ | Generation complete |
| `chat.cancel` | Client→Server | ✅ | Cancellation |
| `model.switch` | Client→Server | ✅ | Model hotswap |

---

## UI Tests

| Feature | Status | Notes |
|---------|--------|-------|
| Page loads | ✅ | Full HTML/CSS/JS renders |
| Sidebar visible | ✅ | Model picker, session list, nav buttons |
| Chat area | ✅ | Welcome message, input area |
| Model dropdown | ✅ | 9 models listed |
| Script selector | ✅ | All 36 scripts |
| Thinking panel | ✅ | Hidden by default, expandable |
| Settings panel | ✅ | All config fields present |
| Lexicon panel | ✅ | Panel structure ready |
| Corpus panel | ✅ | Panel structure ready |
| Quick actions | ✅ | Analyze, Decipher, Translate, Compare |

---

## Database Tests

| Test | Status | Notes |
|------|--------|-------|
| system.db created | ✅ | In `data/databases/` |
| conversations.db created | ✅ | In `data/databases/` |
| Migrations applied | ✅ | 4 migration files |
| Scripts seeded | ✅ | 36 scripts |
| Lexicons seeded | ✅ | 36 lexicons |
| Entries seeded | ✅ | 8,606 entries |
| Session CRUD | ✅ | Create/read/update/delete |
| WAL mode | ✅ | Configured in pragmas |

---

## Performance

| Metric | Value |
|--------|-------|
| Server startup | < 3 seconds |
| Dataset import (36 scripts) | < 2 seconds |
| Health endpoint | < 5ms |
| Script listing | < 2ms |
| Lexicon listing | < 5ms |
| Entry retrieval (2,502 entries) | < 10ms |
| Session creation | < 2ms |

---

## Known Limitations (Alpha)

1. **Ollama required** for chat/model features — server runs in degraded mode without it
2. **C core engine** optional — JS fallbacks handle all computation
3. **Vision analysis** requires vision-capable model (gemma4, llama3.2-vision)
4. **PDF rasterization** requires node-canvas native build
5. **Single user** by design (local tool, not multi-tenant)
