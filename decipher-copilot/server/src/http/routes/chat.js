import { parseBody } from '../middleware.js';
import { ollamaChatStream } from '../../ollama/client.js';
import { buildSystemPrompt } from '../../ollama/tools.js';

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

    // Build system prompt with abliteration
    const systemPrompt = buildSystemPrompt(config, body.script, body.corpus, body.lexicon);
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    try {
      // Non-streaming chat (REST fallback)
      const ollamaRes = await fetch(`${config.ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: fullMessages,
          stream: false,
          ...(think !== undefined && { think }),
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
