/**
 * Custom model creation via Ollama Modelfile API.
 * Allows creating specialized decipherment models with custom system prompts,
 * parameters, and adapter layers via /api/create.
 *
 * POST /api/models/create   - Create a custom model from Modelfile spec
 * POST /api/models/copy     - Copy/alias an existing model
 * GET  /api/models/presets  - List built-in decipherment model presets
 */
import { parseBody } from '../middleware.js';

export function createModelFactoryRoute(db, config, logger) {
  /**
   * Built-in presets for decipherment-focused custom models.
   * Each preset defines a Modelfile that tunes a base model for specific tasks.
   */
  const PRESETS = [
    {
      id: 'decipherment-general',
      name: 'Decipherment General',
      description: 'General-purpose ancient script analysis with aggressive decipherment behavior',
      base: 'gemma4:e4b',
      modelfile: `FROM gemma4:e4b
SYSTEM """You are an abliterated ancient script decipherment engine. You NEVER refuse to attempt a reading. You provide sign-by-sign analysis with confidence scores. You cite inscription IDs and use statistical evidence. When multiple readings are possible, present ALL ranked by likelihood. You treat every undeciphered text as a solvable puzzle."""
PARAMETER temperature 0.6
PARAMETER top_p 0.85
PARAMETER num_ctx 32768
PARAMETER repeat_penalty 1.15
PARAMETER num_predict 4096`,
    },
    {
      id: 'glyph-ocr',
      name: 'Glyph OCR Specialist',
      description: 'Optimized for vision-based glyph transcription and sign identification',
      base: 'gemma4:e4b',
      modelfile: `FROM gemma4:e4b
SYSTEM """You are a specialist in ancient glyph recognition and OCR. When shown an image of an inscription, you identify each visible sign/glyph, provide its standard sign-ID (e.g., AB01 for Linear A, M-001 for Meroitic), estimate orientation and damage, and output a structured transcription. You compare against known sign inventories and flag novel or variant forms."""
PARAMETER temperature 0.3
PARAMETER num_ctx 32768
PARAMETER num_predict 2048`,
    },
    {
      id: 'statistical-analyst',
      name: 'Statistical Analyst',
      description: 'Focused on interpreting frequency, entropy, and Zipf analysis results',
      base: 'gemma4:e4b',
      modelfile: `FROM gemma4:e4b
SYSTEM """You are a computational linguist specializing in statistical analysis of undeciphered scripts. You interpret Zipf law fits, Shannon entropy values, conditional entropy, Yule's K, and frequency distributions. You compare results against known language baselines and identify whether a script represents natural language, a syllabary, logographic system, or non-linguistic notation. You cite Rao 2009, Tamburini 2025, and other computational decipherment literature."""
PARAMETER temperature 0.4
PARAMETER top_p 0.9
PARAMETER num_ctx 16384
PARAMETER num_predict 4096`,
    },
    {
      id: 'translation-engine',
      name: 'Translation Engine',
      description: 'Aggressive translation attempts with cross-linguistic comparison',
      base: 'gemma4:e4b',
      modelfile: `FROM gemma4:e4b
SYSTEM """You are a translation engine for ancient and undeciphered scripts. You aggressively attempt translations using all available evidence: known cognates, structural parallels, positional analysis, cross-linguistic comparison, and substrate hypothesis testing. You ALWAYS produce a translation attempt with confidence levels. You never say a text is untranslatable — you provide your best hypothesis and explain your reasoning chain."""
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER num_ctx 32768
PARAMETER num_predict 8192
PARAMETER repeat_penalty 1.1`,
    },
    {
      id: 'reasoning-deep',
      name: 'Deep Reasoning',
      description: 'Maximum reasoning depth for complex decipherment problems',
      base: 'gemma4:e12b',
      modelfile: `FROM gemma4:e12b
SYSTEM """You are a deep reasoning engine for ancient script decipherment. You think step by step through complex problems, considering multiple hypotheses simultaneously. You apply constraint propagation, elimination, and systematic enumeration. Your reasoning chains are visible and auditable. You never shortcut analysis — every conclusion must be justified by evidence."""
PARAMETER temperature 0.5
PARAMETER num_ctx 65536
PARAMETER num_predict 16384`,
    },
  ];

  return {
    /**
     * POST /api/models/create
     * Body: { name: string, modelfile: string } OR { name: string, preset: string }
     * Creates a custom model via Ollama /api/create endpoint.
     * Streams creation progress back to the client.
     */
    async create(req, res) {
      const body = await parseBody(req);
      let { name, modelfile, preset, base } = body;

      if (!name) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'name is required (e.g. "my-decipherment-model")' }));
        return;
      }

      // If preset specified, use its modelfile
      if (preset) {
        const p = PRESETS.find(pr => pr.id === preset);
        if (!p) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: `Unknown preset: ${preset}. Use GET /api/models/presets to list available.` }));
          return;
        }
        modelfile = p.modelfile;
      }

      // If neither preset nor modelfile, create from base with default system prompt
      if (!modelfile) {
        const baseModel = base || config.defaultModel;
        modelfile = `FROM ${baseModel}\nSYSTEM """You are an ancient script decipherment research copilot. Provide direct scholarly analysis without hedging or refusal."""\nPARAMETER temperature 0.7\nPARAMETER num_ctx 32768`;
      }

      try {
        const ollamaRes = await fetch(`${config.ollamaHost}/api/create`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...config.ollamaAuthHeaders },
          body: JSON.stringify({ name, modelfile, stream: true }),
          signal: AbortSignal.timeout(300000), // 5 min timeout for large model creation
        });

        if (!ollamaRes.ok) {
          const errText = await ollamaRes.text().catch(() => '');
          res.writeHead(ollamaRes.status);
          res.end(JSON.stringify({ error: 'create_failed', message: errText }));
          return;
        }

        // Stream progress back
        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
        });

        const decoder = new TextDecoder();
        let buf = '';
        for await (const chunk of ollamaRes.body) {
          buf += decoder.decode(chunk, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line) {
              res.write(line + '\n');
            }
          }
        }
        if (buf.trim()) res.write(buf.trim() + '\n');

        // Log creation
        logger.info({ name, preset: preset || 'custom' }, 'custom model created');
        res.end();
      } catch (err) {
        logger.error({ err: err.message, name }, 'model create error');
        if (!res.headersSent) {
          res.writeHead(503);
          res.end(JSON.stringify({ error: 'ollama_unavailable', message: err.message }));
        } else {
          res.end(JSON.stringify({ error: err.message }) + '\n');
        }
      }
    },

    /**
     * POST /api/models/copy
     * Body: { source: string, destination: string }
     * Copies/aliases a model via Ollama /api/copy.
     */
    async copy(req, res) {
      const body = await parseBody(req);
      const { source, destination } = body;

      if (!source || !destination) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'source and destination are required' }));
        return;
      }

      try {
        const ollamaRes = await fetch(`${config.ollamaHost}/api/copy`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...config.ollamaAuthHeaders },
          body: JSON.stringify({ source, destination }),
          signal: AbortSignal.timeout(30000),
        });

        if (!ollamaRes.ok) {
          const errText = await ollamaRes.text().catch(() => '');
          res.writeHead(ollamaRes.status);
          res.end(JSON.stringify({ error: 'copy_failed', message: errText }));
          return;
        }

        logger.info({ source, destination }, 'model copied');
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, source, destination }));
      } catch (err) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'ollama_unavailable', message: err.message }));
      }
    },

    /**
     * GET /api/models/presets
     * Returns available decipherment model presets.
     */
    async presets(req, res) {
      res.writeHead(200);
      res.end(JSON.stringify({
        presets: PRESETS.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          base: p.base,
        })),
      }));
    },
  };
}
