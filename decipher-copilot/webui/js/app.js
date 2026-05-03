/**
 * Ancient Script Decipherment Copilot — Main Application
 * Vanilla ES2023, no frameworks. All state in store.js.
 */
import { createWsClient } from './ws.js';
import { createApi } from './api.js';
import { store } from './chat/store.js';
import {
  appendMessage, createStreamingEl, appendStreamingDelta,
  finalizeStreamingEl, appendToolCall, appendToolResult, appendError, clearMessages,
} from './chat/view.js';
import { appendThinking, clearThinking, getThinkingText } from './chat/thinking.js';
import { initLexiconPanel } from './lexicon/view.js';
import { initCorpusPanel } from './corpus/view.js';
import { initModelPicker } from './models/picker.js';
import { initSettingsPanel } from './settings/view.js';
import { initStatsPanel } from './stats/view.js';
import { initUploadPanel } from './upload/view.js';

const api = createApi();
let ws = null;
let pendingFiles = [];
let streamingMsgId = null;
let pendingContent = '';

// ─── Boot ────────────────────────────────────────────────────────────────────
async function init() {
  // Health check
  checkHealth();

  // Load models
  await initModelPicker();

  // Load scripts for selector
  loadScripts();

  // Load session list
  loadSessions();

  // Connect WS
  ws = createWsClient({
    url: `ws://${location.host}/ws`,
    onReady: (frame) => {
      const statusEl = document.getElementById('ollama-status-text');
      if (statusEl) statusEl.textContent = `Ollama ${frame.ollama_version || 'online'}`;
    },
    onThinking: (delta) => { appendThinking(delta); },
    onContent: (delta) => {
      if (streamingMsgId) {
        pendingContent += delta;
        appendStreamingDelta(streamingMsgId, delta);
      }
    },
    onToolCall: (name, args) => { appendToolCall(streamingMsgId, name, args); },
    onToolResult: (name, result) => { appendToolResult(streamingMsgId, name, result); },
    onDone: (msgId, model, stats) => { finishStreaming(stats, model); },
    onCancelled: () => { finishStreaming(null, null, true); },
    onError: (code, message) => {
      appendError(`${code}: ${message}`);
      finishStreaming();
    },
  });

  // Event listeners
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('cancel-btn').addEventListener('click', cancelStream);
  document.getElementById('attach-btn').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', handleFileSelect);
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('model-select').addEventListener('change', (e) => {
    const model = e.target.value;
    store.set({ model });
    document.getElementById('active-model-display').textContent = model;
    if (ws && ws.isConnected() && store.get().sessionId) {
      ws.send({ type: 'model.switch', model, session_id: store.get().sessionId });
    }
  });
  document.getElementById('think-toggle').addEventListener('click', () => {
    const enabled = !store.get().thinkEnabled;
    store.set({ thinkEnabled: enabled });
    document.getElementById('think-toggle').style.opacity = enabled ? '1' : '0.45';
  });
  document.getElementById('tools-toggle').addEventListener('click', () => {
    const enabled = !store.get().toolsEnabled;
    store.set({ toolsEnabled: enabled });
    document.getElementById('tools-toggle').style.opacity = enabled ? '1' : '0.45';
  });
  document.getElementById('new-session-btn').addEventListener('click', newSession);

  // Session search
  const searchInput = document.getElementById('session-search');
  let searchDebounce = null;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const query = searchInput.value.trim();
    if (!query || query.length < 2) {
      document.getElementById('search-results')?.classList.add('hidden');
      return;
    }
    searchDebounce = setTimeout(() => performSessionSearch(query), 300);
  });
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      document.getElementById('search-results')?.classList.add('hidden');
    }
  });

  document.getElementById('settings-btn').addEventListener('click', () => togglePanel('settings-panel'));
  document.getElementById('lexicon-btn').addEventListener('click', async () => {
    togglePanel('lexicon-panel');
    if (!document.getElementById('lexicon-panel').classList.contains('hidden')) {
      await initLexiconPanel();
    }
  });
  document.getElementById('corpus-btn').addEventListener('click', async () => {
    togglePanel('corpus-panel');
    if (!document.getElementById('corpus-panel').classList.contains('hidden')) {
      await initCorpusPanel();
    }
  });
  document.getElementById('stats-btn').addEventListener('click', async () => {
    togglePanel('stats-panel');
    if (!document.getElementById('stats-panel').classList.contains('hidden')) {
      await initStatsPanel();
    }
  });
  document.getElementById('upload-btn').addEventListener('click', async () => {
    togglePanel('upload-panel');
    if (!document.getElementById('upload-panel').classList.contains('hidden')) {
      await initUploadPanel();
    }
  });
  document.getElementById('script-select').addEventListener('change', (e) => {
    store.set({ activeScript: e.target.value });
  });

  // Quick action buttons
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompts = {
        analyze: 'Perform a full statistical analysis of the active corpus: run Zipf fit, Shannon entropy, and bigram frequency analysis. Use the frequency_report, entropy_report, and zipf_report tools.',
        decipher: 'I have an inscription to decipher. Please analyze this sign sequence and propose a reading with confidence levels: ',
        translate: 'Translate the following ancient text into English. Provide phonetic transcription, semantic gloss, and confidence level for each sign: ',
        compare: 'Compare the sign systems across the loaded scripts. Use the cross_script_correlation and cross_script_matrix tools to identify structural patterns, frequency profiles, and potential cognate signs.',
        glyph: 'Detect recurring multi-glyph chains in the active corpus. Use the glyph_chain_detection tool to find formulaic expressions, compound signs, and grammatical patterns. Score by mutual information and categorize results.',
        single: 'Perform a comprehensive single glyph analysis. Use the single_glyph_analysis tool to profile frequency, positional preference, predecessor/successor distributions, and combinatorial freedom for this sign: ',
      };
      document.getElementById('chat-input').value = prompts[btn.dataset.action] || '';
      document.getElementById('chat-input').focus();
    });
  });

  // Panel close buttons
  document.querySelectorAll('.panel-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const panelId = btn.dataset.close;
      if (panelId) document.getElementById(panelId)?.classList.add('hidden');
    });
  });

  // Settings init
  await initSettingsPanel();

  // Pull model button
  document.getElementById('pull-model-btn')?.addEventListener('click', () => {
    const name = document.getElementById('pull-model-input')?.value?.trim();
    if (!name || !ws?.isConnected()) return;
    const prog = document.getElementById('pull-progress');
    if (prog) { prog.textContent = `Pulling ${name}...`; prog.classList.remove('hidden'); }
    ws.send({ type: 'pull.start', model: name });
  });

  // Create custom model button
  document.getElementById('create-model-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('create-model-name')?.value?.trim();
    const preset = document.getElementById('create-model-preset')?.value;
    const base = document.getElementById('create-model-base')?.value;
    const prog = document.getElementById('create-model-progress');
    if (!name) { if (prog) { prog.textContent = 'Model name is required'; prog.classList.remove('hidden'); } return; }
    if (prog) { prog.textContent = `Creating ${name}...`; prog.classList.remove('hidden'); }
    try {
      const resp = await fetch('/api/models/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, preset: preset || undefined, base: base || undefined }),
      });
      if (resp.ok) {
        if (prog) prog.textContent = `✓ Model "${name}" created successfully!`;
      } else {
        const err = await resp.json().catch(() => ({}));
        if (prog) prog.textContent = `✗ Failed: ${err.message || err.error || resp.status}`;
      }
    } catch (err) {
      if (prog) prog.textContent = `✗ Error: ${err.message}`;
    }
  });
}

// ─── Health ──────────────────────────────────────────────────────────────────
async function checkHealth() {
  try {
    const h = await api.get('/api/health');
    const status = document.getElementById('model-status');
    const statusText = document.getElementById('ollama-status-text');
    if (h.ollama?.reachable) {
      if (status) { status.textContent = '✓'; status.style.color = 'var(--color-success)'; status.title = `Ollama ${h.ollama.version}`; }
      if (statusText) statusText.textContent = `Ollama ${h.ollama.version || 'online'}`;
      store.set({ ollamaOnline: true, ollamaVersion: h.ollama.version });
    } else {
      if (status) { status.textContent = '✗'; status.style.color = 'var(--color-danger)'; status.title = 'Ollama offline — run: ollama serve'; }
      if (statusText) statusText.textContent = 'Ollama offline — run: ollama serve';
    }
  } catch {
    const status = document.getElementById('model-status');
    if (status) { status.textContent = '✗'; status.style.color = 'var(--color-danger)'; }
  }
}

// ─── Scripts selector ────────────────────────────────────────────────────────
async function loadScripts() {
  try {
    const data = await api.get('/api/scripts');
    const select = document.getElementById('script-select');
    if (!select) return;
    const scripts = data.scripts || [];
    for (const s of scripts) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.display;
      select.appendChild(opt);
    }
    store.set({ scripts });
  } catch { /* offline */ }
}

// ─── Session list ─────────────────────────────────────────────────────────────
async function loadSessions() {
  try {
    const data = await api.get('/api/sessions');
    const sessions = data.sessions || [];
    store.set({ sessions });
    renderSessionList(sessions);
  } catch { /* offline */ }
}

/**
 * Group sessions by date category (Today, Yesterday, This Week, This Month, Older)
 */
function groupSessionsByDate(sessions) {
  const now = Date.now();
  const oneDay = 86400000;
  const today = new Date(); today.setHours(0,0,0,0);
  const todayMs = today.getTime();
  const yesterdayMs = todayMs - oneDay;
  const weekMs = todayMs - (6 * oneDay);
  const monthMs = todayMs - (29 * oneDay);

  const groups = { 'Today': [], 'Yesterday': [], 'This Week': [], 'This Month': [], 'Older': [] };

  for (const s of sessions) {
    const t = s.updated_at || s.created_at || 0;
    if (t >= todayMs) groups['Today'].push(s);
    else if (t >= yesterdayMs) groups['Yesterday'].push(s);
    else if (t >= weekMs) groups['This Week'].push(s);
    else if (t >= monthMs) groups['This Month'].push(s);
    else groups['Older'].push(s);
  }

  return groups;
}

function formatSessionTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderSessionList(sessions) {
  const nav = document.getElementById('session-list');
  if (!nav) return;
  nav.innerHTML = '';

  // Update session count
  const countEl = document.getElementById('session-count');
  if (countEl) countEl.textContent = sessions.length;

  const groups = groupSessionsByDate(sessions);

  for (const [groupName, groupSessions] of Object.entries(groups)) {
    if (groupSessions.length === 0) continue;

    const groupLabel = document.createElement('div');
    groupLabel.className = 'session-date-group';
    groupLabel.textContent = groupName;
    nav.appendChild(groupLabel);

    for (const s of groupSessions) {
      const item = document.createElement('div');
      item.className = 'session-item' + (s.id === store.get().sessionId ? ' active' : '');
      item.dataset.sessionId = s.id;

      const info = document.createElement('div');
      info.className = 'session-info';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'session-title';
      titleSpan.textContent = s.title || 'Session';

      const metaSpan = document.createElement('span');
      metaSpan.className = 'session-meta';
      metaSpan.textContent = formatSessionTime(s.updated_at || s.created_at);
      if (s.model) metaSpan.textContent += ` · ${s.model.split(':')[0]}`;

      info.appendChild(titleSpan);
      info.appendChild(metaSpan);

      const delBtn = document.createElement('button');
      delBtn.className = 'session-del btn btn-icon';
      delBtn.textContent = '✕';
      delBtn.title = 'Delete session';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await api.del(`/api/sessions/${s.id}`);
        loadSessions();
        if (store.get().sessionId === s.id) newSession();
      });

      item.appendChild(info);
      item.appendChild(delBtn);

      // Click to load session
      item.addEventListener('click', () => loadSession(s.id));

      // Double-click to rename
      item.addEventListener('dblclick', (e) => {
        e.preventDefault();
        startRenameSession(item, s.id, s.title || 'Session');
      });

      nav.appendChild(item);
    }
  }
}

/**
 * Inline rename: replaces title span with input, saves on Enter/blur
 */
function startRenameSession(itemEl, sessionId, currentTitle) {
  const info = itemEl.querySelector('.session-info');
  if (!info) return;
  const titleSpan = info.querySelector('.session-title');
  if (!titleSpan) return;

  const input = document.createElement('input');
  input.className = 'session-rename-input';
  input.type = 'text';
  input.value = currentTitle;
  input.maxLength = 100;

  titleSpan.replaceWith(input);
  input.focus();
  input.select();

  const save = async () => {
    const newTitle = input.value.trim() || currentTitle;
    try {
      await api.patch(`/api/sessions/${sessionId}`, { title: newTitle });
    } catch { /* ok */ }
    const span = document.createElement('span');
    span.className = 'session-title';
    span.textContent = newTitle;
    input.replaceWith(span);
    loadSessions();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); input.replaceWith(titleSpan); }
  });
  input.addEventListener('blur', save);
}

async function loadSession(id) {
  store.set({ sessionId: id });
  clearMessages();
  clearThinking();

  // Load messages
  try {
    const data = await api.get(`/api/sessions/${id}/messages`);
    const messages = data.messages || [];
    store.set({ messages });

    for (const m of messages) {
      if (m.role !== 'system') {
        appendMessage({ role: m.role, content: m.content, id: m.id });
      }
    }

    // Update session title
    const session = store.get().sessions.find(s => s.id === id);
    document.getElementById('session-title').textContent = session?.title || 'Session';

    // Update active item
    renderSessionList(store.get().sessions);
  } catch { /* ok */ }
}

// ─── New session ──────────────────────────────────────────────────────────────
async function newSession() {
  // Create via API for persistence
  let sessionId = `sess_${Date.now().toString(36)}`;
  try {
    const resp = await api.post('/api/sessions', {
      title: 'New Decipherment Session',
      model: store.get().model,
      script: store.get().activeScript || null,
    });
    sessionId = resp.id || sessionId;
  } catch { /* use generated ID if offline */ }

  store.set({ sessionId, messages: [], pendingContent: '' });
  clearMessages();
  clearThinking();

  // Show welcome screen
  const chatDiv = document.getElementById('chat-messages');
  if (chatDiv && !chatDiv.querySelector('.welcome-message')) {
    chatDiv.innerHTML = `
      <div class="welcome-message">
        <h2>𓂀 Ancient Script Decipherment Copilot</h2>
        <p>New session started. Model: <code id="active-model-display">${store.get().model}</code></p>
        <div class="quick-actions">
          <button class="btn btn-outline" data-action="analyze">📊 Analyze Corpus</button>
          <button class="btn btn-outline" data-action="decipher">🔍 Decipher Inscription</button>
          <button class="btn btn-outline" data-action="translate">🌐 Translate Text</button>
          <button class="btn btn-outline" data-action="compare">⚖️ Cross-script Compare</button>
        </div>
      </div>`;
    // Re-bind quick actions
    chatDiv.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompts = {
          analyze: 'Perform a full statistical analysis of the active corpus: Zipf fit, Shannon entropy, and bigram frequencies.',
          decipher: 'I have an inscription to decipher. Analyze this sign sequence: ',
          translate: 'Translate the following ancient text into English with phonetic transcription and confidence levels: ',
          compare: 'Compare sign systems across loaded scripts: Linear A, Indus Valley, and Proto-Elamite.',
        };
        document.getElementById('chat-input').value = prompts[btn.dataset.action] || '';
        document.getElementById('chat-input').focus();
      });
    });
  }

  document.getElementById('session-title').textContent = 'New Decipherment Session';
  clearAttachmentPreview();

  // Refresh session list
  await loadSessions();
}

// ─── Send message ─────────────────────────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content && pendingFiles.length === 0) return;
  if (store.get().isStreaming) return;

  // Ensure we have a session ID
  if (!store.get().sessionId) await newSession();

  const fullContent = content;
  input.value = '';

  // Show user message
  appendMessage({ role: 'user', content: fullContent });

  // Create streaming placeholder
  const msgId = `stream_${Date.now().toString(36)}`;
  streamingMsgId = msgId;
  pendingContent = '';
  store.set({ isStreaming: true });
  clearThinking();
  createStreamingEl(msgId);
  updateStreamingUI(true);

  // Build history for context (last 20 turns)
  const history = store.get().messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content }));
  history.push({ role: 'user', content: fullContent });

  const s = store.get();
  ws.send({
    type: 'chat.start',
    session_id: s.sessionId,
    content: fullContent,
    model: s.model,
    think: s.thinkEnabled,
    tools: s.toolsEnabled
      ? ['lexicon_lookup', 'corpus_search', 'frequency_report', 'entropy_report', 'zipf_report', 'add_lexicon_entry', 'cross_inscription_check', 'cross_script_correlation', 'cross_script_matrix', 'single_glyph_analysis', 'glyph_chain_detection', 'multi_glyph_analysis', 'list_scripts']
      : [],
    history,
    script: s.activeScript || undefined,
    options: { num_ctx: 32768, temperature: 0.7 },
  });

  // Add to local message history
  store.set({ messages: [...s.messages, { role: 'user', content: fullContent }] });
  clearAttachmentPreview();
  pendingFiles = [];
}

// ─── Streaming finish ────────────────────────────────────────────────────────
function finishStreaming(stats, model, cancelled = false) {
  const msgId = streamingMsgId;
  const content = pendingContent;

  if (msgId) finalizeStreamingEl(msgId, content, stats, model || store.get().model);

  // Update message history
  if (content) {
    const s = store.get();
    store.set({ messages: [...s.messages, { role: 'assistant', content }] });
  }

  streamingMsgId = null;
  pendingContent = '';
  store.set({ isStreaming: false });
  updateStreamingUI(false);

  // Syntax highlight any new code blocks
  if (typeof Prism !== 'undefined') Prism.highlightAll();
}

function cancelStream() {
  ws.send({ type: 'chat.cancel', session_id: store.get().sessionId });
  finishStreaming(null, null, true);
}

// ─── File attach ──────────────────────────────────────────────────────────────
function handleFileSelect(e) {
  const files = [...e.target.files];
  pendingFiles = files;
  renderAttachmentPreview(files);
  e.target.value = '';
}

function renderAttachmentPreview(files) {
  const preview = document.getElementById('attachment-preview');
  if (!preview) return;
  if (!files.length) { preview.classList.add('hidden'); preview.innerHTML = ''; return; }
  preview.classList.remove('hidden');
  preview.innerHTML = files.map(f =>
    `<span class="attachment-chip">📎 ${esc(f.name)} (${(f.size / 1024).toFixed(0)} KB)</span>`
  ).join('');
}

function clearAttachmentPreview() {
  const preview = document.getElementById('attachment-preview');
  if (preview) { preview.classList.add('hidden'); preview.innerHTML = ''; }
}

// ─── Session search ───────────────────────────────────────────────────────────
async function performSessionSearch(query) {
  const resultsEl = document.getElementById('search-results');
  if (!resultsEl) return;

  try {
    const data = await api.get(`/api/sessions/search?q=${encodeURIComponent(query)}`);
    resultsEl.innerHTML = '';
    resultsEl.classList.remove('hidden');

    if ((!data.sessions || data.sessions.length === 0) && (!data.lexicon_entries || data.lexicon_entries.length === 0)) {
      resultsEl.innerHTML = '<div class="search-no-results">No results found</div>';
      return;
    }

    // Session results
    if (data.sessions && data.sessions.length > 0) {
      const label = document.createElement('div');
      label.className = 'search-section-label';
      label.textContent = `Sessions (${data.sessions.length})`;
      resultsEl.appendChild(label);

      for (const s of data.sessions) {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `<div class="search-result-title">${esc(s.title || 'Session')}</div>
          <div class="search-result-snippet">${esc(s.snippet || '')}</div>`;
        item.addEventListener('click', () => {
          loadSession(s.id);
          document.getElementById('session-search').value = '';
          resultsEl.classList.add('hidden');
        });
        resultsEl.appendChild(item);
      }
    }

    // Lexicon results
    if (data.lexicon_entries && data.lexicon_entries.length > 0) {
      const label = document.createElement('div');
      label.className = 'search-section-label';
      label.textContent = `Lexicon (${data.lexicon_entries.length})`;
      resultsEl.appendChild(label);

      for (const e of data.lexicon_entries.slice(0, 10)) {
        const item = document.createElement('div');
        item.className = 'search-result-item search-result-lexicon';
        item.innerHTML = `<div class="search-result-title">${esc(e.token)} → ${esc(e.gloss)}</div>
          <div class="search-result-snippet">${esc(e.lexicon_name || '')} · ${esc(e.pos || '')} · conf: ${(e.confidence || 0).toFixed(2)}</div>`;
        item.addEventListener('click', () => {
          // Insert the lexicon entry into the chat input
          document.getElementById('chat-input').value = `Look up the sign "${e.token}" (${e.gloss}) in the ${e.script_id || 'unknown'} script. What is its full analysis?`;
          document.getElementById('chat-input').focus();
          document.getElementById('session-search').value = '';
          resultsEl.classList.add('hidden');
        });
        resultsEl.appendChild(item);
      }
    }
  } catch {
    resultsEl.innerHTML = '<div class="search-no-results">Search unavailable</div>';
    resultsEl.classList.remove('hidden');
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function updateStreamingUI(streaming) {
  document.getElementById('send-btn').classList.toggle('hidden', streaming);
  document.getElementById('cancel-btn').classList.toggle('hidden', !streaming);
}

function togglePanel(id) {
  document.getElementById(id)?.classList.toggle('hidden');
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Boot ────────────────────────────────────────────────────────────────────
init().catch(console.error);
