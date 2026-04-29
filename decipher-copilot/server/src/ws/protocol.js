/**
 * WebSocket frame schemas using Zod.
 * All client→server and server→client frames validated here.
 */
import { z } from 'zod';

// ─── Client → Server ────────────────────────────────────────────────────────

export const AuthFrame = z.object({
  type: z.literal('auth'),
  token: z.string().min(1),
});

export const PingFrame = z.object({
  type: z.literal('ping'),
  t: z.number(),
});

export const ChatStartFrame = z.object({
  type: z.literal('chat.start'),
  session_id: z.string().min(1),
  user_message_id: z.string().optional(),
  content: z.string().min(1),
  attachments: z.array(z.string()).optional(),
  model: z.string().optional(),
  think: z.union([z.boolean(), z.enum(['low', 'medium', 'high'])]).optional(),
  tools: z.array(z.string()).optional(),
  format: z.any().optional(),
  options: z.record(z.any()).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    content: z.string(),
  })).optional(),
  script: z.string().optional(),
  corpus: z.any().optional(),
  lexicon: z.any().optional(),
});

export const ChatCancelFrame = z.object({
  type: z.literal('chat.cancel'),
  session_id: z.string().min(1),
});

export const ModelSwitchFrame = z.object({
  type: z.literal('model.switch'),
  session_id: z.string().optional(),
  model: z.string().min(1),
});

export const PullStartFrame = z.object({
  type: z.literal('pull.start'),
  model: z.string().min(1),
});

// ─── Server → Client (builders) ─────────────────────────────────────────────

export const Frames = {
  ready: (serverVersion, ollamaVersion, defaultModel) => ({
    type: 'ready',
    server_version: serverVersion,
    ollama_version: ollamaVersion || 'unknown',
    default_model: defaultModel,
    hotswap_enabled: true,
  }),

  pong: (t) => ({ type: 'pong', t }),

  authOk: () => ({ type: 'auth.ok' }),
  authFail: (reason) => ({ type: 'auth.fail', reason }),

  thinkingDelta: (messageId, delta) => ({
    type: 'chat.thinking.delta',
    message_id: messageId,
    delta,
  }),

  contentDelta: (messageId, delta) => ({
    type: 'chat.content.delta',
    message_id: messageId,
    delta,
  }),

  toolCall: (messageId, name, args) => ({
    type: 'chat.tool_call',
    message_id: messageId,
    name,
    arguments: args,
  }),

  toolResult: (messageId, name, result) => ({
    type: 'chat.tool_result',
    message_id: messageId,
    name,
    result,
  }),

  done: (messageId, model, stats) => ({
    type: 'chat.done',
    message_id: messageId,
    model,
    stats: {
      prompt_tokens: stats?.prompt_eval_count || 0,
      completion_tokens: stats?.eval_count || 0,
      total_duration_ns: stats?.total_duration || 0,
      done_reason: stats?.done_reason || 'stop',
    },
  }),

  cancelled: (messageId) => ({ type: 'chat.cancelled', message_id: messageId }),

  error: (code, message) => ({ type: 'error', code, message }),

  modelSwitched: (model, sessionId) => ({
    type: 'model.switched',
    model,
    session_id: sessionId,
  }),

  pullProgress: (model, completed, total, status) => ({
    type: 'pull.progress',
    model,
    completed,
    total,
    status,
  }),
};

/**
 * Parse and validate an inbound WS frame.
 * Returns { ok: true, frame } or { ok: false, error }
 */
export function parseFrame(raw) {
  let data;
  try {
    data = JSON.parse(raw.toString());
  } catch {
    return { ok: false, error: 'PARSE_ERROR' };
  }

  const type = data?.type;
  const schemas = {
    auth: AuthFrame,
    ping: PingFrame,
    'chat.start': ChatStartFrame,
    'chat.cancel': ChatCancelFrame,
    'model.switch': ModelSwitchFrame,
    'pull.start': PullStartFrame,
  };

  const schema = schemas[type];
  if (!schema) {
    // Unknown type — pass through for switch-default handling
    return { ok: true, frame: data };
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: `VALIDATION_ERROR: ${result.error.message}` };
  }
  return { ok: true, frame: result.data };
}
