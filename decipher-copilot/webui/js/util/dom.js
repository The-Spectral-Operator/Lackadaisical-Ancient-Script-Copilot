/**
 * DOM utilities — no framework, pure JS.
 */

/** Create element with optional attrs and children */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/** Query selector shorthand */
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Set text content safely */
export function setText(el, text) { el.textContent = text; }

/** Toggle CSS class */
export function toggle(el, cls, force) { el.classList.toggle(cls, force); }

/** Show/hide element */
export function show(el) { el.classList.remove('hidden'); }
export function hide(el) { el.classList.add('hidden'); }
export function isHidden(el) { return el.classList.contains('hidden'); }

/** Scroll element to bottom */
export function scrollBottom(el) { el.scrollTop = el.scrollHeight; }

/** Format bytes */
export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

/** Format duration ns → human */
export function formatDuration(ns) {
  if (!ns) return '';
  const ms = ns / 1e6;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Debounce */
export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
