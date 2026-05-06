/**
 * WebSocket hub — chat streaming, tool dispatch, message persistence, WAL checkpoint.
 * Every Ollama NDJSON frame is parsed → persisted → re-emitted as typed WS frame.
 */
import { WebSocketServer } from 'ws';
import { ollamaChatStream } from '../ollama/client.js';
import { ThinkParser } from '../ollama/thinkParser.js';
import { buildSystemPrompt, TOOL_DEFINITIONS, getThinkMode, modelSupportsNativeTools, buildTextToolPrompt, parseTextToolCalls, stripTextToolCalls } from '../ollama/tools.js';
import { parseFrame, Frames } from './protocol.js';
import { ulid } from '../util/ids.js';
import { lexiconLookup } from '../tools/lexiconLookup.js';
import { corpusSearch } from '../tools/corpusSearch.js';
import { frequencyReport } from '../tools/frequencyReport.js';
import { entropyReport } from '../tools/entropyReport.js';
import { zipfReport } from '../tools/zipfReport.js';
import { crossInscriptionCheck } from '../tools/crossInscriptionCheck.js';
import { crossScriptCorrelation, crossScriptMatrix } from '../tools/crossScriptCorrelation.js';
import { singleGlyphAnalysis, glyphChainDetection, multiGlyphAnalysis } from '../tools/glyphChaining.js';

const SERVER_VERSION = '1.1.1-alpha';
const IDLE_TIMEOUT_MS = 60_000;

export function createWsHub(server, db, config, logger) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Map();
  const activeStreams = new Map();

  // WAL checkpoint every 60 s
  const walTimer = setInterval(() => {
    try { db.conversations.pragma('wal_checkpoint(PASSIVE)'); } catch {}
    try { db.system.pragma('wal_checkpoint(PASSIVE)'); } catch {}
  }, 60_000);

  // Get Ollama version for ready frame
  let ollamaVersion = 'unknown';
  fetch(`${config.ollamaHost}/api/version`, { signal: AbortSignal.timeout(3000), headers: { ...config.ollamaAuthHeaders } })
    .then(r => r.json()).then(d => { ollamaVersion = d.version || 'unknown'; }).catch(() => {});

  wss.on('connection', (ws, req) => {
    const clientId = ulid();
    clients.set(clientId, { ws, lastSeen: Date.now() });
    logger.info({ clientId }, 'ws connected');

    ws.send(JSON.stringify(Frames.ready(SERVER_VERSION, ollamaVersion, config.defaultModel)));

    const idleTimer = setInterval(() => {
      const c = clients.get(clientId);
      if (c && Date.now() - c.lastSeen > IDLE_TIMEOUT_MS) {
        logger.info({ clientId }, 'ws idle timeout');
        ws.terminate();
      }
    }, 15_000);

    ws.on('message', async (data) => {
      const c = clients.get(clientId);
      if (c) c.lastSeen = Date.now();
      const { ok, frame, error } = parseFrame(data);
      if (!ok) {
        ws.send(JSON.stringify(Frames.error('PARSE_ERROR', error)));
        return;
      }
      try {
        await dispatch(frame, ws, db, config, logger, activeStreams);
      } catch (err) {
        logger.error({ err: err.message, type: frame?.type }, 'dispatch error');
        ws.send(JSON.stringify(Frames.error('INTERNAL_ERROR', err.message)));
      }
    });

    ws.on('close', () => { clearInterval(idleTimer); clients.delete(clientId); });
    ws.on('error', (err) => logger.warn({ err: err.message }, 'ws error'));
    ws.on('pong', () => { const c = clients.get(clientId); if (c) c.lastSeen = Date.now(); });
  });

  const heartbeat = setInterval(() => {
    for (const { ws } of clients.values()) {
      if (ws.readyState === ws.OPEN) ws.ping();
    }
  }, 25_000);

  return {
    close() { clearInterval(heartbeat); clearInterval(walTimer); for (const c of activeStreams.values()) c.abort(); wss.close(); },
    clientCount() { return clients.size; },
  };
}

async function dispatch(frame, ws, db, config, logger, activeStreams) {
  switch (frame.type) {
    case 'ping': ws.send(JSON.stringify(Frames.pong(frame.t))); break;
    case 'auth': ws.send(JSON.stringify(Frames.authOk())); break;
    case 'chat.start': await handleChatStart(frame, ws, db, config, logger, activeStreams); break;
    case 'chat.cancel': {
      const ctrl = activeStreams.get(frame.session_id);
      if (ctrl) { ctrl.abort(); activeStreams.delete(frame.session_id); }
      break;
    }
    case 'model.switch':
      try { db.conversations.prepare('UPDATE sessions SET model=?, updated_at=? WHERE id=?').run(frame.model, Date.now(), frame.session_id); } catch {}
      ws.send(JSON.stringify(Frames.modelSwitched(frame.model, frame.session_id)));
      break;
    case 'pull.start': await handlePullStart(frame, ws, config, logger); break;
    default: ws.send(JSON.stringify(Frames.error('UNKNOWN_FRAME', `Unknown: ${frame.type}`)));
  }
}

async function handleChatStart(frame, ws, db, config, logger, activeStreams) {
  const { session_id, content, model = config.defaultModel, think, tools: requestedTools, options, history, script, corpus, lexicon } = frame;
  const messageId = ulid();
  const controller = new AbortController();
  activeStreams.set(session_id, controller);

  const systemPrompt = buildSystemPrompt(config, script, corpus, lexicon, db.system);
  const messages = [{ role: 'system', content: systemPrompt }];
  if (Array.isArray(history) && history.length > 0) messages.push(...history.slice(-30));
  messages.push({ role: 'user', content });

  const now = Date.now();
  const userMsgId = frame.user_message_id || ulid();

  // Persist user message
  try {
    db.conversations.prepare('INSERT OR IGNORE INTO sessions (id, title, script, model, model_digest, system_prompt, options_json, created_at, updated_at, archived) VALUES (?,?,?,?,?,?,?,?,?,0)')
      .run(session_id, 'Decipherment Session', script || null, model, '', null, '{}', now, now);
    db.conversations.prepare('INSERT OR IGNORE INTO messages (id, session_id, parent_id, role, content, thinking, tool_name, tool_call_id, tool_calls_json, format_schema_json, prompt_tokens, completion_tokens, total_duration_ns, load_duration_ns, prompt_eval_ns, eval_ns, done_reason, created_at, finished_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(userMsgId, session_id, null, 'user', content, null, null, null, null, null, null, null, null, null, null, null, null, now, now);
    db.conversations.prepare('UPDATE sessions SET updated_at=? WHERE id=?').run(now, session_id);
  } catch {}

  const enabledToolNames = requestedTools?.length > 0 ? requestedTools : TOOL_DEFINITIONS.map(t => t.function.name);
  const tools = TOOL_DEFINITIONS.filter(t => enabledToolNames.includes(t.function.name));
  const thinkMode = getThinkMode(model, think !== undefined ? think : true);

  // Determine whether this model supports Ollama's native tool-call API.
  // Models without native support (gemma3/4, aurora-elwing, stonedrift-ancient,
  // spectre-origin, commander-core, etc.) use text-based tool calling instead.
  const useNativeTools = modelSupportsNativeTools(model);

  let fullContent = '', fullThinking = '', finalStats = null;

  try {
    const currentMessages = [...messages];

    // For text-mode models, inject tool definitions into the system prompt
    // so the model knows how to call tools via <tool_call>JSON</tool_call> blocks.
    if (!useNativeTools && tools.length > 0) {
      currentMessages[0] = {
        ...currentMessages[0],
        content: currentMessages[0].content + buildTextToolPrompt(tools),
      };
    }

    for (let round = 0; round < 6; round++) {
      const thinkParser = new ThinkParser();
      const pendingToolCalls = [];
      let roundContent = '';

      for await (const chunk of ollamaChatStream({
        baseUrl: config.ollamaHost,
        model,
        messages: currentMessages,
        // Only pass tools to Ollama when the model supports the native API.
        tools: useNativeTools && tools.length > 0 ? tools : undefined,
        think: thinkMode,
        options: { ...config.modelOptions, ...(options || {}) },
        keepAlive: config.hotswap.keepAlive,
        signal: controller.signal,
        authHeaders: config.ollamaAuthHeaders,
      })) {
        const parsed = thinkParser.processChunk(chunk);
        if (parsed.thinking) {
          fullThinking += parsed.thinking;
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(Frames.thinkingDelta(messageId, parsed.thinking)));
        }
        if (parsed.content) {
          roundContent += parsed.content;
          // For text-based tool calling, strip <tool_call> tags before sending
          // content deltas to the client so users never see raw XML.
          const visibleDelta = useNativeTools ? parsed.content : stripTextToolCalls(parsed.content);
          if (visibleDelta && ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(Frames.contentDelta(messageId, visibleDelta)));
          }
        }
        if (parsed.toolCalls) pendingToolCalls.push(...parsed.toolCalls);
        if (parsed.done) finalStats = parsed.stats;
      }

      // Accumulate fullContent after the round is complete so the strip logic
      // (text mode) and the native accumulation are handled in one place.
      if (useNativeTools) {
        fullContent += roundContent;
      } else {
        // For text-based models, extract tool calls from the raw text output.
        const textCalls = parseTextToolCalls(roundContent);
        if (textCalls.length > 0) pendingToolCalls.push(...textCalls);
        // Strip tool call tags from accumulated visible content.
        fullContent += stripTextToolCalls(roundContent);
      }

      if (pendingToolCalls.length === 0) break;

      const toolResultMessages = [];
      for (const tc of pendingToolCalls) {
        const name = tc.function?.name;
        const args = tc.function?.arguments || {};
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(Frames.toolCall(messageId, name, args)));
        const result = dispatchTool(name, args, db, config, logger);
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(Frames.toolResult(messageId, name, result)));

        if (useNativeTools) {
          // Native tool calling: Ollama expects role:'tool' with only content.
          toolResultMessages.push({ role: 'tool', content: JSON.stringify(result) });
        } else {
          // Text-based tool calling: inject result as a user turn the model can read.
          toolResultMessages.push({
            role: 'user',
            content: `<tool_result name="${name}">\n${JSON.stringify(result, null, 2)}\n</tool_result>`,
          });
        }
      }

      if (useNativeTools) {
        // Include tool_calls in the assistant message so the model has full context
        // for the next round (required by the Ollama multi-turn tool spec).
        currentMessages.push(
          { role: 'assistant', content: roundContent || '', tool_calls: pendingToolCalls },
          ...toolResultMessages,
        );
      } else {
        // Text-based: the model's raw output (including <tool_call> tags) plus results.
        currentMessages.push(
          { role: 'assistant', content: roundContent },
          ...toolResultMessages,
        );
      }
    }

    const finishedAt = Date.now();
    try {
      db.conversations.prepare('INSERT INTO messages (id, session_id, parent_id, role, content, thinking, tool_name, tool_call_id, tool_calls_json, format_schema_json, prompt_tokens, completion_tokens, total_duration_ns, load_duration_ns, prompt_eval_ns, eval_ns, done_reason, created_at, finished_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(messageId, session_id, userMsgId, 'assistant', fullContent, fullThinking || null, null, null, null, null, finalStats?.prompt_eval_count || null, finalStats?.eval_count || null, finalStats?.total_duration || null, finalStats?.load_duration || null, finalStats?.prompt_eval_duration || null, finalStats?.eval_duration || null, finalStats?.done_reason || 'stop', now, finishedAt);
      db.conversations.prepare('UPDATE sessions SET updated_at=? WHERE id=?').run(finishedAt, session_id);
    } catch {}

    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(Frames.done(messageId, model, finalStats)));

  } catch (err) {
    if (err.name === 'AbortError') { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(Frames.cancelled(messageId))); }
    else { logger.error({ err: err.message }, 'stream error'); if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(Frames.error('OLLAMA_UNAVAILABLE', err.message))); }
  } finally {
    activeStreams.delete(session_id);
  }
}

function dispatchTool(name, args, db, config, logger) {
  try {
    switch (name) {
      case 'lexicon_lookup': return lexiconLookup(db, args);
      case 'corpus_search': return corpusSearch(db, args);
      case 'frequency_report': return frequencyReport(db, args);
      case 'entropy_report': return entropyReport(db, args);
      case 'zipf_report': return zipfReport(db, args);
      case 'cross_inscription_check': return crossInscriptionCheck(db, args);
      case 'cross_script_correlation': return crossScriptCorrelation(db, args);
      case 'cross_script_matrix': return crossScriptMatrix(db, args);
      case 'single_glyph_analysis': return singleGlyphAnalysis(db, args);
      case 'glyph_chain_detection': return glyphChainDetection(db, args);
      case 'multi_glyph_analysis': return multiGlyphAnalysis(db, args);
      case 'list_scripts': return listScripts(db);
      case 'add_lexicon_entry': {
        const { lexicon_id, token, gloss, confidence = 0.5, source = '' } = args;
        if (!token || !gloss) return { error: 'token and gloss required' };
        const id = ulid(); const now = Date.now();
        const lid = lexicon_id || db.system.prepare('SELECT id FROM lexicons LIMIT 1').get()?.id;
        if (!lid) return { error: 'No lexicon found' };
        db.system.prepare('INSERT OR REPLACE INTO lexicon_entries (id, lexicon_id, token, gloss, pos, confidence, source, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, lid, token, gloss, null, confidence, source, null, now, now);
        return { ok: true, id, token, gloss, confidence };
      }
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    logger.error({ err: err.message, tool: name }, 'tool error');
    return { error: err.message };
  }
}

async function handlePullStart(frame, ws, config, logger) {
  const { model } = frame;
  try {
    const res = await fetch(`${config.ollamaHost}/api/pull`, { method: 'POST', headers: { 'content-type': 'application/json', ...config.ollamaAuthHeaders }, body: JSON.stringify({ name: model, stream: true }) });
    if (!res.ok || !res.body) { ws.send(JSON.stringify(Frames.error('PULL_FAILED', `HTTP ${res.status}`))); return; }
    const decoder = new TextDecoder(); let buf = '';
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true }); let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        try { const obj = JSON.parse(line); ws.send(JSON.stringify(Frames.pullProgress(model, obj.completed || 0, obj.total || 0, obj.status || 'pulling'))); } catch {}
      }
    }
  } catch (err) { logger.error({ err: err.message, model }, 'pull error'); ws.send(JSON.stringify(Frames.error('PULL_FAILED', err.message))); }
}

/**
 * list_scripts tool — returns all loaded scripts, lexicons with entry counts, and corpora with inscription counts.
 */
function listScripts(db) {
  try {
    const scripts = db.system.prepare('SELECT id, display, era, region FROM scripts ORDER BY display').all();
    const lexicons = db.system.prepare(`
      SELECT l.id, l.script_id, l.name, COUNT(le.id) AS entry_count
      FROM lexicons l LEFT JOIN lexicon_entries le ON le.lexicon_id = l.id
      GROUP BY l.id ORDER BY entry_count DESC
    `).all();
    const corpora = db.system.prepare(`
      SELECT c.id, c.script_id, c.name, COUNT(i.id) AS inscription_count
      FROM corpora c LEFT JOIN inscriptions i ON i.corpus_id = c.id
      GROUP BY c.id ORDER BY inscription_count DESC
    `).all();
    return { scripts, lexicons, corpora };
  } catch (err) {
    return { error: err.message };
  }
}
