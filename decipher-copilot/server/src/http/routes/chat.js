import { parseBody } from '../middleware.js';
import { ollamaChatStream } from '../../ollama/client.js';
import { buildSystemPrompt, getThinkMode } from '../../ollama/tools.js';

export function createChatRoute(db, config, logger) {
  return async (req, res) => {
    const body = await parseBody(req);
    const {
      model = config.defaultModel,
      messages = [],
      think = true,
      tools: requestedTools,
      format,
      options,
    } = body;

    // Build system prompt with abliteration and live DB catalog
    const systemPrompt = buildSystemPrompt(config, body.script, body.corpus, body.lexicon, db.system);
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    // Determine think mode based on model family
    const thinkMode = getThinkMode(model, think);

    try {
      // Non-streaming chat (REST fallback)
      const ollamaRes = await fetch(`${config.ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...config.ollamaAuthHeaders },
        body: JSON.stringify({
          model,
          messages: fullMessages,
          stream: false,
          ...(thinkMode !== undefined && { think: thinkMode }),
          ...(format && { format }),
          ...(options && { options: { ...config.modelOptions, ...options } }),
          keep_alive: config.hotswap.keepAlive,
        }),
      });

      if (!ollamaRes.ok) {
        const text = await ollamaRes.text();
        res.writeHead(ollamaRes.status);
        res.end(JSON.stringify({ error: 'ollama_error', message: text }));
        return;
      }

      const data = await ollamaRes.json();
      res.writeHead(200);
      res.end(JSON.stringify(data));
    } catch (err) {
      logger.error({ err: err.message }, 'chat error');
      res.writeHead(503);
      res.end(JSON.stringify({ error: 'ollama_unavailable', message: err.message }));
    }
  };
}
