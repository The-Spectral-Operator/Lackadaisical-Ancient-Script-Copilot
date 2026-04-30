# Ollama Integration Notes

## Verified API Surface (April 2026)

### Default Bind
`127.0.0.1:11434` — override with `OLLAMA_HOST` env var.

### Endpoints Used by This System

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/version` | Version check at startup; server refuses to boot if response missing |
| GET | `/api/tags` | List locally installed models with metadata |
| GET | `/api/ps` | Currently loaded models + VRAM usage + `expires_at` |
| POST | `/api/show` | Model details: family, capabilities, template, quantization |
| POST | `/api/chat` | Streaming conversational inference (NDJSON) |
| POST | `/api/generate` | Single-shot generation (not primary path) |
| POST | `/api/embed` | Batch embeddings — use this, NOT `/api/embeddings` |
| POST | `/api/pull` | Download a model with streaming progress |
| DELETE | `/api/delete` | Remove a model |

### Streaming Format

NDJSON — one JSON object per line, terminated by newline.
Each chunk during generation:
```json
{"model":"gemma4:e4b","created_at":"...","message":{"role":"assistant","content":"chunk","thinking":"reason"},"done":false}
```
Final chunk:
```json
{"done":true,"done_reason":"stop","total_duration":3500000000,"load_duration":120000000,"prompt_eval_count":87,"prompt_eval_duration":450000000,"eval_count":312,"eval_duration":2900000000}
```

### Thinking / Reasoning Capture

When `"think": true` is set in the request and the model supports it (DeepSeek-R1, Qwen3, QwQ, Cogito, Phi-4-reasoning, gemma4, gpt-oss), each stream chunk may contain `message.thinking` separately from `message.content`. Both fields stream simultaneously. Capture both and display thinking in a collapsible panel.

For `gpt-oss` models, `think` accepts `"low" | "medium" | "high"` instead of boolean. Detect via `/api/show` `details.family` field.

### Tool Calling

Pass `tools: [...]` (JSON Schema function definitions) in the `/api/chat` body. When the model decides to call a tool, the stream emits `message.tool_calls` instead of content. The server must:
1. Catch chunks where `message.tool_calls` is set
2. Execute the named tool locally
3. Append `{role: "tool", tool_name: "...", content: "<JSON result>"}` to messages
4. Re-call `/api/chat` with updated messages + same tools
5. Repeat until response has no `tool_calls`

### Vision / Multimodal

Pass `images: ["<base64_no_prefix>", ...]` on the user message object (chat endpoint) or as top-level field (generate endpoint). Compatible models: `gemma4`, `llama3.2-vision`, `llama4`, `qwen2.5vl`, `granite3.2-vision`, `moondream`, `llava`.

PDFs must be rasterized to PNG pages server-side before sending. Ollama has no Files API.

### Recommended Models (April 2026)

| Model | Size | Thinking | Vision | Tools | Notes |
|-------|------|----------|--------|-------|-------|
| `gemma4:e4b` | 4B | ✓ | ✓ | ✓ | Best all-round for this use case |
| `gemma4:e12b` | 12B | ✓ | ✓ | ✓ | Better reasoning at cost of speed |
| `gemma4:e27b` | 27B | ✓ | ✓ | ✓ | Research-grade, needs 24GB+ VRAM |
| `llama3.2-vision:11b` | 11B | — | ✓ | ✓ | Strong vision/OCR |
| `phi-4-reasoning:14b` | 14B | ✓ | — | ✓ | Exceptional step-by-step analysis |
| `gpt-oss:20b` | 20B | `"high"` | — | ✓ | GPT-OSS reasoning, think=string |
| `nomic-embed-text` | 137M | — | — | — | Embeddings only |

### Blocked Models

Do not use models from the following families due to unverifiable training data provenance and potential embedded telemetry/RLHF biases:
`qwen`, `qwq`, `deepseek`, `yi`, `baichuan`, `chatglm`, `internlm`, `aquila`, `moss`, `tigerbot`, `skywork`

### Performance Tuning

Recommended env vars for `ollama serve`:
```bash
OLLAMA_FLASH_ATTENTION=1        # 20-40% speed boost on supported GPUs
OLLAMA_KV_CACHE_TYPE=q8_0       # halves KV cache VRAM at minor quality cost
OLLAMA_NUM_PARALLEL=2           # allow 2 concurrent requests
OLLAMA_MAX_LOADED_MODELS=2      # keep 2 models warm
OLLAMA_KEEP_ALIVE=10m           # unload after 10 min idle
```

Per-request context override: `options.num_ctx` in the chat body. Query the model's max via `/api/show` before setting.

### Version Compatibility

| Ollama Version | Notes |
|----------------|-------|
| < 0.5.0 | No JSON-schema `format` — fail loudly |
| < 0.7.0 | `stream: false` forced when `tools` set — use non-stream tool path |
| < 0.9.0 | No `message.thinking` field — disable think |
| ≥ 0.16.0 | Full feature set: think, tools, streaming tools, vision |
| ≥ 0.21.0 | Harmony/gpt-oss think levels: `"low"|"medium"|"high"` |

The server probes `/api/version` at startup and disables features accordingly.

### Local-Only Enforcement

Set in `~/.ollama/server.json`:
```json
{ "disable_ollama_cloud": true }
```
This prevents Ollama from phoning home for telemetry or model recommendations.
