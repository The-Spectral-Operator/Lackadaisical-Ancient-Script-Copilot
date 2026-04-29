/**
 * HTML sanitizer — strips dangerous tags, attributes, and protocols.
 * Used after markdown rendering to guarantee XSS-free output.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'del', 's', 'code', 'pre', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'hr', 'span', 'div',
]);

const ALLOWED_ATTRS = new Set([
  'href', 'class', 'style', 'title', 'lang', 'dir',
]);

const BLOCKED_ATTR_PATTERNS = [/^on/i]; // event handlers

/**
 * Sanitize an HTML string using DOM parsing.
 * @param {string} html
 * @returns {string} safe HTML
 */
export function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  sanitizeNode(template.content);
  const div = document.createElement('div');
  div.appendChild(template.content.cloneNode(true));
  return div.innerHTML;
}

/**
 * Sanitize a DOM node in-place (recursive).
 * @param {Node} node
 */
export function sanitizeNode(node) {
  const children = [...node.childNodes];
  for (const child of children) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        // Replace with its text content
        const text = document.createTextNode(child.textContent);
        node.replaceChild(text, child);
        continue;
      }
      // Strip blocked attributes
      const attrs = [...child.attributes];
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        if (!ALLOWED_ATTRS.has(name) || BLOCKED_ATTR_PATTERNS.some(p => p.test(name))) {
          child.removeAttribute(attr.name);
          continue;
        }
        // Block javascript: and data: (except data:image)
        if (name === 'href' || name === 'src') {
          const val = attr.value.trim().toLowerCase();
          if (val.startsWith('javascript:') || (val.startsWith('data:') && !val.startsWith('data:image'))) {
            child.removeAttribute(attr.name);
          }
        }
        // Block style with expression/url
        if (name === 'style') {
          const val = attr.value;
          if (/expression|javascript|url\s*\(/i.test(val)) {
            child.removeAttribute('style');
          }
        }
      }
      sanitizeNode(child);
    }
  }
}
