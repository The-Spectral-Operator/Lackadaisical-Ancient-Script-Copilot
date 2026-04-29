import { WebSocketServer } from 'ws';
import { ollamaChatStream } from '../ollama/client.js';
import { ThinkParser } from '../ollama/thinkParser.js';
import { buildSystemPrompt, TOOL_DEFINITIONS, getThinkMode } from '../ollama/tools.js';
import { ulid } from '../util/ids.js';

export function createWsHub(server, db, config, logger) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Map();
  const activeStreams = new Map(); // sessionId -> AbortController

  wss.on('connection', (ws, req) => {
    const clientId = ulid();
    clients.set(clientId, { ws, authenticated: false });
    logger.info({ clientId }, 'ws client connected');

    // Send ready message
    ws.send(JSON.stringify({
      type: 'ready',
      server_version: '1.0.0',
      default_model: config.defaultModel,
      hotswap_enabled: true,
    }));

    ws.on('message', async (data) => {
      try {
        const frame = JSON.parse(data.toString());
        await handleFrame(clientId, frame, ws, db, config, logger, activeStreams);
      } catch (err) {
        logger.error({ err: err.message, clientId }, 'ws frame error');
        ws.send(JSON.stringify({ type: 'error', code: 'PARSE_ERROR', message: err.message }));
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
      logger.info({ clientId }, 'ws client disconnected');
    });

    ws.on('pong', () => { /* alive */ });
  });

  // Heartbeat
  const heartbeat = setInterval(() => {
    for (const [id, { ws }] of clients) {
      if (ws.readyState === ws.OPEN) ws.ping();
    }
  }, 25000);

  return {
    close() {
      clearInterval(heartbeat);
      for (const controller of activeStreams.values()) controller.abort();
      wss.close();
    },
  };
}

async function handleFrame(clientId, frame, ws, db, config, logger, activeStreams) {
  switch (frame.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', t: frame.t }));
      break;

    case 'auth':
      // Single-user local auth - accept any token for now
      ws.send(JSON.stringify({ type: 'auth.ok' }));
      break;

    case 'chat.start':
      await handleChatStart(frame, ws, db, config, logger, activeStreams);
      break;

    case 'chat.cancel': {
      const controller = activeStreams.get(frame.session_id);
      if (controller) { controller.abort(); activeStreams.delete(frame.session_id); }
      break;
    }

    case 'model.switch':
      // Hotswap model for session
      ws.send(JSON.stringify({
        type: 'model.switched',
        model: frame.model,
        session_id: frame.session_id,
      }));
      break;

    default:
      ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_FRAME', message: `Unknown type: ${frame.type}` }));
  }
}

async function handleChatStart(frame, ws, db, config, logger, activeStreams) {
  const {
    session_id,
    content,
    model = config.defaultModel,
    think = true,
    tools: requestedTools,
    options,
    images,
    attachments,
  } = frame;

  const messageId = ulid();
  const controller = new AbortController();
  activeStreams.set(session_id, controller);

  // Build messages array
  const systemPrompt = buildSystemPrompt(config, frame.script, frame.corpus, frame.lexicon);
  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  // Add history if available
  if (frame.history && Array.isArray(frame.history)) {
    messages.push(...frame.history);
  }

  // Add current user message
  const userMsg = { role: 'user', content };
  if (images && images.length > 0) userMsg.images = images;
  messages.push(userMsg);

  // Determine think mode for model
  const thinkMode = getThinkMode(model, think);

  // Tools to expose
  const tools = requestedTools ? TOOL_DEFINITIONS.filter(t =>
    requestedTools.includes(t.function.name)
  ) : TOOL_DEFINITIONS;

  try {
    const thinkParser = new ThinkParser();

    for await (const chunk of ollamaChatStream({
      baseUrl: config.ollamaHost,
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      think: thinkMode,
      options: { ...config.modelOptions, ...(options || {}) },
      keepAlive: config.hotswap.keepAlive,
      signal: controller.signal,
    })) {
      const parsed = thinkParser.processChunk(chunk);

      if (parsed.thinking) {
        ws.send(JSON.stringify({
          type: 'chat.thinking.delta',
          message_id: messageId,
          delta: parsed.thinking,
        }));
      }

      if (parsed.content) {
        ws.send(JSON.stringify({
          type: 'chat.content.delta',
          message_id: messageId,
          delta: parsed.content,
        }));
      }

      if (parsed.toolCalls) {
        for (const tc of parsed.toolCalls) {
          ws.send(JSON.stringify({
            type: 'chat.tool_call',
            message_id: messageId,
            name: tc.function.name,
            arguments: tc.function.arguments,
          }));
          // Execute tool and send result back
          // TODO: implement tool dispatch
        }
      }

      if (parsed.done) {
        ws.send(JSON.stringify({
          type: 'chat.done',
          message_id: messageId,
          model,
          stats: parsed.stats,
        }));
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      ws.send(JSON.stringify({ type: 'chat.cancelled', message_id: messageId }));
    } else {
      logger.error({ err: err.message }, 'chat stream error');
      ws.send(JSON.stringify({
        type: 'error',
        code: 'OLLAMA_UNAVAILABLE',
        message: err.message,
      }));
    }
  } finally {
    activeStreams.delete(session_id);
  }
}
