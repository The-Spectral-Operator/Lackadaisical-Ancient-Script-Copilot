/**
 * Thinking panel — collapsible <details> that streams reasoning tokens.
 * Bound to chat.thinking.delta WS frames.
 */
import { qs } from '../util/dom.js';

let thinkingText = '';

export function initThinkingPanel() {
  const panel = qs('#thinking-panel');
  const content = qs('#thinking-content');
  const badge = qs('#think-tokens');
  if (!panel || !content) return;

  // Click-to-expand is native <details>/<summary>
}

export function appendThinking(delta) {
  thinkingText += delta;
  const panel = qs('#thinking-panel');
  const content = qs('#thinking-content');
  const badge = qs('#think-tokens');
  if (!panel || !content) return;

  panel.classList.remove('hidden');
  content.textContent = thinkingText;

  const wordCount = thinkingText.split(/\s+/).filter(Boolean).length;
  if (badge) badge.textContent = `${wordCount} tokens`;
}

export function clearThinking() {
  thinkingText = '';
  const content = qs('#thinking-content');
  const badge = qs('#think-tokens');
  const panel = qs('#thinking-panel');
  if (content) content.textContent = '';
  if (badge) badge.textContent = '0 tokens';
  if (panel) panel.classList.add('hidden');
}

export function getThinkingText() { return thinkingText; }
