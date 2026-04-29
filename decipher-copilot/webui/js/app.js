/**
 * Ancient Script Decipherment Copilot - Main Application
 * Vanilla ES2023, no frameworks
 */
import { createWsClient } from './ws.js';
import { createApi } from './api.js';

const state = {
  sessionId: null,
  model: 'gemma4:e4b',
  messages: [],
  thinking: '',
  isStreaming: false,
  thinkEnabled: true,
  toolsEnabled: true,
  availableModels: [],
};

let ws = null;
let api = null;

async function init() {
  api = createApi();

  // Check health
  try {
    const health = await api.get('/api/health');
    if (health.ollama?.reachable) {
      document.getElementById('model-status').textContent = '✓';
      document.getElementById('model-status').style.color = 'var(--color-success)';
    } else {
      document.getElementById('model-status').textContent = '✗';
      document.getElementById('model-status').style.color = 'var(--color-danger)';
    }
  } catch {
    document.getElementById('model-status').textContent = '✗';
  }

  // Load available models
  try {
    const data = await api.get('/api/models');
    state.availableModels = data.models || [];
    populateModelSelector(state.availableModels);
  } catch { /* offline mode */ }

  // Connect WebSocket
  ws = createWsClient({
    url: `ws://${location.host}/ws`,
    onThinking: (delta) => {
      state.thinking += delta;
      updateThinkingPanel();
    },
    onContent: (delta) => {
      appendAssistantDelta(delta);
    },
    onToolCall: (name, args) => {
      appendToolCall(name, args);
    },
    onDone: (stats) => {
      finishStreaming(stats);
    },
    onError: (err) => {
      appendError(err.message);
      finishStreaming();
    },
  });

  // Event listeners
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('cancel-btn').addEventListener('click', cancelStream);
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('model-select').addEventListener('change', (e) => {
    state.model = e.target.value;
    document.getElementById('active-model-display').textContent = state.model;
    // Hotswap: notify WS
    if (ws && ws.isConnected()) {
      ws.send({ type: 'model.switch', model: state.model, session_id: state.sessionId });
    }
  });
  document.getElementById('think-toggle').addEventListener('click', () => {
    state.thinkEnabled = !state.thinkEnabled;
    document.getElementById('think-toggle').style.opacity = state.thinkEnabled ? '1' : '0.5';
  });
  document.getElementById('tools-toggle').addEventListener('click', () => {
    state.toolsEnabled = !state.toolsEnabled;
    document.getElementById('tools-toggle').style.opacity = state.toolsEnabled ? '1' : '0.5';
  });
  document.getElementById('new-session-btn').addEventListener('click', newSession);
  document.getElementById('settings-btn').addEventListener('click', () => togglePanel('settings-panel'));
  document.getElementById('lexicon-btn').addEventListener('click', () => togglePanel('lexicon-panel'));
  document.getElementById('corpus-btn').addEventListener('click', () => togglePanel('corpus-panel'));

  // Quick actions
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const prompts = {
        analyze: 'Perform a full statistical analysis of the active corpus including Zipf fit, Shannon entropy, and bigram frequencies.',
        decipher: 'I have an inscription to decipher. Please analyze the following sign sequence: ',
        translate: 'Translate the following ancient text into English, providing confidence levels for each reading: ',
        compare: 'Compare the sign systems across the loaded scripts and identify potential cognates or shared structural patterns.',
      };
      document.getElementById('chat-input').value = prompts[action] || '';
      document.getElementById('chat-input').focus();
    });
  });
}

function populateModelSelector(models) {
  const select = document.getElementById('model-select');
  select.innerHTML = '';
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m.name;
    opt.textContent = `${m.name}${m.is_running ? ' (loaded)' : ''}${m.is_default ? ' ★' : ''}`;
    if (m.name === state.model) opt.selected = true;
    select.appendChild(opt);
  }
  // Always include recommended even if not installed
  const installed = new Set(models.map(m => m.name));
  const recommended = ['gemma4:e4b', 'gemma4:e2b', 'gemma4:e12b', 'gemma4:e27b', 'gemma4:e4b-cloud', 'gemma4:e27b-cloud', 'gpt-oss:20b', 'gpt-oss:120b', 'gpt-oss:120b-cloud'];
  for (const r of recommended) {
    if (!installed.has(r)) {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = `${r} (not installed)`;
      select.appendChild(opt);
    }
  }
}

function sendMessage() {
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content || state.isStreaming) return;

  // Add user message to UI
  appendMessage('user', content);
  state.messages.push({ role: 'user', content });

  // Clear input
  input.value = '';
  state.thinking = '';
  state.isStreaming = true;
  updateStreamingUI(true);

  // Start assistant message placeholder
  const msgDiv = createMessageElement('assistant', '');
  msgDiv.id = 'streaming-msg';
  document.getElementById('chat-messages').appendChild(msgDiv);
  scrollToBottom();

  // Send via WebSocket
  ws.send({
    type: 'chat.start',
    session_id: state.sessionId || 'default',
    content,
    model: state.model,
    think: state.thinkEnabled,
    tools: state.toolsEnabled ? ['lexicon_lookup', 'corpus_search', 'frequency_report', 'entropy_report', 'zipf_report'] : [],
    history: state.messages.slice(-20), // last 20 messages for context
    options: { num_ctx: 32768, temperature: 0.7 },
  });
}

function appendAssistantDelta(delta) {
  const el = document.getElementById('streaming-msg');
  if (el) {
    const contentEl = el.querySelector('.msg-content') || el;
    contentEl.textContent += delta;
    scrollToBottom();
  }
}

function appendMessage(role, content) {
  const el = createMessageElement(role, content);
  const container = document.getElementById('chat-messages');
  // Remove welcome if present
  const welcome = container.querySelector('.welcome-message');
  if (welcome) welcome.remove();
  container.appendChild(el);
  scrollToBottom();
}

function appendToolCall(name, args) {
  const el = createMessageElement('tool', `🔧 ${name}(${JSON.stringify(args)})`);
  document.getElementById('chat-messages').appendChild(el);
  scrollToBottom();
}

function appendError(msg) {
  const el = document.createElement('div');
  el.className = 'message assistant';
  el.style.borderColor = 'var(--color-danger)';
  el.textContent = `⚠ Error: ${msg}`;
  document.getElementById('chat-messages').appendChild(el);
  scrollToBottom();
}

function createMessageElement(role, content) {
  const el = document.createElement('div');
  el.className = `message ${role}`;
  const contentEl = document.createElement('div');
  contentEl.className = 'msg-content';
  contentEl.textContent = content;
  el.appendChild(contentEl);
  return el;
}

function finishStreaming(stats) {
  state.isStreaming = false;
  updateStreamingUI(false);

  const el = document.getElementById('streaming-msg');
  if (el) {
    el.removeAttribute('id');
    const content = el.querySelector('.msg-content')?.textContent || '';
    state.messages.push({ role: 'assistant', content });

    // Add stats badge
    if (stats) {
      const meta = document.createElement('div');
      meta.className = 'message-meta';
      meta.textContent = `${state.model} · ${stats.eval_count || '?'} tokens · ${stats.done_reason || 'stop'}`;
      el.appendChild(meta);
    }
  }
}

function cancelStream() {
  ws.send({ type: 'chat.cancel', session_id: state.sessionId || 'default' });
  finishStreaming();
}

function updateStreamingUI(streaming) {
  document.getElementById('send-btn').classList.toggle('hidden', streaming);
  document.getElementById('cancel-btn').classList.toggle('hidden', !streaming);
}

function updateThinkingPanel() {
  const panel = document.getElementById('thinking-panel');
  const content = document.getElementById('thinking-content');
  const tokens = document.getElementById('think-tokens');
  panel.classList.remove('hidden');
  content.textContent = state.thinking;
  tokens.textContent = `${state.thinking.split(' ').length} tokens`;
}

function newSession() {
  state.sessionId = null;
  state.messages = [];
  state.thinking = '';
  document.getElementById('chat-messages').innerHTML = '';
  document.getElementById('thinking-panel').classList.add('hidden');
  document.getElementById('session-title').textContent = 'New Decipherment Session';
}

function togglePanel(id) {
  const panel = document.getElementById(id);
  panel.classList.toggle('hidden');
}

function scrollToBottom() {
  const container = document.getElementById('chat-messages');
  container.scrollTop = container.scrollHeight;
}

// Boot
init();
