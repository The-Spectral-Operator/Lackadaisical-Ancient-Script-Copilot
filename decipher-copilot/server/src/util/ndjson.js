/**
 * NDJSON utilities
 */
export function parseNdjson(text) {
  return text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}

export function toNdjsonLine(obj) {
  return JSON.stringify(obj) + '\n';
}
