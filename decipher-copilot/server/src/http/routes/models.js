import { parseBody } from '../middleware.js';

export function createModelsRoute(db, config, logger) {
  return {
    // GET /api/models - list all available models (hotswap candidates)
    async list(_req, res) {
      try {
        // Get models from Ollama
        const [tagsRes, psRes] = await Promise.all([
          fetch(`${config.ollamaHost}/api/tags`, { signal: AbortSignal.timeout(5000) }),
          fetch(`${config.ollamaHost}/api/ps`, { signal: AbortSignal.timeout(5000) }),
        ]);

        let models = [];
        let running = [];

        if (tagsRes.ok) {
          const tagsData = await tagsRes.json();
          models = tagsData.models || [];
        }

        if (psRes.ok) {
          const psData = await psRes.json();
          running = psData.models || [];
        }

        const enriched = models
          // Filter out blocked Chinese-origin models for security
          .filter(m => !config.blockedModels.some(blocked => m.name.toLowerCase().includes(blocked)))
          .map(m => ({
          name: m.name,
          digest: m.digest,
          size: m.size,
          modified_at: m.modified_at,
          family: m.details?.family || null,
          parameter_size: m.details?.parameter_size || null,
          quantization: m.details?.quantization_level || null,
          is_running: running.some(r => r.name === m.name),
          is_default: m.name === config.defaultModel,
          is_recommended: config.recommendedModels.includes(m.name),
          capabilities: {
            vision: m.name.includes('vision') || m.name.includes('vl') || m.name.includes('gemma4') || m.name.includes('gemma3'),
            thinking: m.name.includes('reasoning') || m.name.includes('gpt-oss') || m.name.includes('gemma4'),
            tools: true, // most modern models support tools
            audio: m.name.includes('gemma4'), // gemma4 supports audio input
          },
        }));

        res.writeHead(200);
        res.end(JSON.stringify({
          models: enriched,
          default: config.defaultModel,
          hotswap_enabled: config.hotswap.enabled,
          allow_any: config.hotswap.allowAnyModel,
          recommended: config.recommendedModels,
        }));
      } catch (err) {
        logger.error({ err: err.message }, 'failed to list models');
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'ollama_unavailable', message: 'Cannot reach Ollama. Run `ollama serve`.' }));
      }
    },

    // GET /api/models/:name - show model details + capabilities
    async show(_req, res, path) {
      const name = decodeURIComponent(path.replace('/api/models/', ''));

      // Security: block Chinese-origin models
      if (config.blockedModels.some(blocked => name.toLowerCase().includes(blocked))) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'model_blocked', message: `Model ${name} is blocked for security reasons (Chinese-origin).` }));
        return;
      }

      try {
        const r = await fetch(`${config.ollamaHost}/api/show`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name }),
          signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) {
          res.writeHead(r.status);
          res.end(JSON.stringify({ error: 'model_not_found', message: `Model ${name} not found` }));
          return;
        }
        const data = await r.json();

        // Detect capabilities for hotswap UI
        const capabilities = {
          vision: !!(data.capabilities?.includes?.('vision') || name.includes('vl') || name.includes('vision') || name.includes('gemma4') || name.includes('gemma3')),
          thinking: !!(data.capabilities?.includes?.('thinking') || name.includes('reasoning') || name.includes('gpt-oss') || name.includes('gemma4')),
          tools: !!(data.capabilities?.includes?.('tools') || true),
          audio: !!(data.capabilities?.includes?.('audio') || name.includes('gemma4')),
          embedding: !!(data.capabilities?.includes?.('embedding') || name.includes('embed')),
          cloud: name.includes('-cloud'),
        };

        // Detect think mode: gpt-oss uses string levels, gemma4/others use boolean
        const thinkMode = name.includes('gpt-oss') ? 'levels' : 'boolean';

        res.writeHead(200);
        res.end(JSON.stringify({
          ...data,
          capabilities,
          think_mode: thinkMode,
          hotswap_ready: true,
        }));
      } catch (err) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'ollama_unavailable', message: err.message }));
      }
    },

    // POST /api/models/pull - pull a model
    async pull(req, res) {
      const body = await parseBody(req);
      const { name } = body;
      if (!name) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'missing_model', message: 'Provide model name' }));
        return;
      }

      try {
        const r = await fetch(`${config.ollamaHost}/api/pull`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, stream: false }),
        });
        const data = await r.json();
        res.writeHead(r.ok ? 200 : r.status);
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'pull_failed', message: err.message }));
      }
    },

    // DELETE /api/models/:name - delete a model
    async remove(_req, res, path) {
      const name = decodeURIComponent(path.replace('/api/models/', ''));
      try {
        const r = await fetch(`${config.ollamaHost}/api/delete`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        res.writeHead(r.ok ? 200 : r.status);
        res.end(JSON.stringify({ deleted: r.ok, name }));
      } catch (err) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'delete_failed', message: err.message }));
      }
    },
  };
}
