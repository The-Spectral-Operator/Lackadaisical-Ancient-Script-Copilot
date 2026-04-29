/**
 * Chat message view — renders messages with markdown, confidence badges,
 * ancient script glyph fonts, tool call/result display.
 */
import { el, scrollBottom, formatDuration } from '../util/dom.js';
import { renderMarkdown } from './markdown.js';
import { sanitizeHtml } from '../util/sanitize.js';

const container = () => document.getElementById('chat-messages');

/** Append a finalized message element */
export function appendMessage({ role, content, thinking, id, stats, model }) {
  const c = container();
  if (!c) return;

  // Remove welcome screen on first message
  const welcome = c.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  const el_ = buildMessageEl(role, content, id, stats, model);
  c.appendChild(el_);
  scrollBottom(c);
  return el_;
}

/** Create a streaming placeholder for assistant response */
export function createStreamingEl(id) {
  const c = container();
  if (!c) return null;

  const welcome = c.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  const wrapper = el('div', { class: 'message assistant', id: `msg-${id}` });
  const contentDiv = el('div', { class: 'msg-content ancient-script' });
  const cursor = el('span', { class: 'streaming-cursor' }, '▊');
  contentDiv.appendChild(cursor);
  wrapper.appendChild(contentDiv);
  c.appendChild(wrapper);
  scrollBottom(c);
  return wrapper;
}

/** Append a delta to an in-progress streaming message */
export function appendStreamingDelta(id, delta) {
  const wrapper = document.getElementById(`msg-${id}`);
  if (!wrapper) return;
  const contentDiv = wrapper.querySelector('.msg-content');
  if (!contentDiv) return;

  // Remove cursor, append text, re-add cursor
  const cursor = contentDiv.querySelector('.streaming-cursor');
  if (cursor) cursor.remove();

  // Append as text node for safety during streaming
  const last = contentDiv.lastChild;
  if (last && last.nodeType === Node.TEXT_NODE) {
    last.textContent += delta;
  } else {
    contentDiv.appendChild(document.createTextNode(delta));
  }

  contentDiv.appendChild(el('span', { class: 'streaming-cursor' }, '▊'));
  scrollBottom(container());
}

/** Finalize a streaming message — render markdown, add stats */
export function finalizeStreamingEl(id, content, stats, model) {
  const wrapper = document.getElementById(`msg-${id}`);
  if (!wrapper) return;
  wrapper.removeAttribute('id');

  const contentDiv = wrapper.querySelector('.msg-content');
  if (contentDiv) {
    // Render full content as markdown
    const rendered = sanitizeHtml(renderMarkdown(content));
    contentDiv.innerHTML = rendered;
    contentDiv.classList.add('ancient-script');
  }

  if (stats || model) {
    const meta = el('div', { class: 'message-meta' });
    const parts = [];
    if (model) parts.push(model);
    if (stats?.completion_tokens) parts.push(`${stats.completion_tokens} tok`);
    if (stats?.total_duration_ns) parts.push(formatDuration(stats.total_duration_ns));
    if (stats?.done_reason) parts.push(stats.done_reason);
    meta.textContent = parts.join(' · ');
    wrapper.appendChild(meta);
  }

  scrollBottom(container());
}

/** Append a tool call display */
export function appendToolCall(messageId, name, args) {
  const c = container();
  if (!c) return;
  const div = el('div', { class: 'message tool' });
  div.innerHTML = `<div class="tool-call-header">🔧 <strong>${esc(name)}</strong></div><pre class="tool-args">${esc(JSON.stringify(args, null, 2))}</pre>`;
  c.appendChild(div);
  scrollBottom(c);
}

/** Append a tool result display */
export function appendToolResult(messageId, name, result) {
  const c = container();
  if (!c) return;
  const div = el('div', { class: 'message tool tool-result' });
  const preview = JSON.stringify(result).slice(0, 300);
  div.innerHTML = `<div class="tool-call-header">✓ <strong>${esc(name)}</strong></div><pre class="tool-args">${esc(preview)}</pre>`;
  c.appendChild(div);
  scrollBottom(c);
}

/** Append an error message */
export function appendError(msg) {
  const c = container();
  if (!c) return;
  const div = el('div', { class: 'message assistant error-msg' });
  div.textContent = `⚠ Error: ${msg}`;
  c.appendChild(div);
  scrollBottom(c);
}

/** Clear all messages */
export function clearMessages() {
  const c = container();
  if (c) c.innerHTML = '';
}

function buildMessageEl(role, content, id, stats, model) {
  const wrapper = el('div', { class: `message ${role}`, ...(id ? { id: `msg-${id}` } : {}) });

  if (role === 'user') {
    const div = el('div', { class: 'msg-content' });
    div.textContent = content;
    wrapper.appendChild(div);
  } else if (role === 'assistant') {
    const div = el('div', { class: 'msg-content ancient-script' });
    div.innerHTML = sanitizeHtml(renderMarkdown(content));
    wrapper.appendChild(div);
    if (stats || model) {
      const meta = el('div', { class: 'message-meta' });
      const parts = [];
      if (model) parts.push(model);
      if (stats?.completion_tokens) parts.push(`${stats.completion_tokens} tok`);
      if (stats?.total_duration_ns) parts.push(formatDuration(stats.total_duration_ns));
      meta.textContent = parts.join(' · ');
      wrapper.appendChild(meta);
    }
  } else if (role === 'tool') {
    wrapper.innerHTML = `<code class="tool-inline">${esc(content)}</code>`;
  }

  return wrapper;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
