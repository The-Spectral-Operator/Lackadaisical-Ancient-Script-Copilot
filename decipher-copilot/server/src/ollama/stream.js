/**
 * NDJSON stream splitter for Ollama responses
 */
export class NdjsonSplitter {
  constructor() {
    this.buffer = '';
  }

  push(chunk) {
    this.buffer += chunk;
    const lines = [];
    let nl;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line) {
        try {
          lines.push(JSON.parse(line));
        } catch { /* skip malformed */ }
      }
    }
    return lines;
  }

  flush() {
    if (this.buffer.trim()) {
      try {
        return [JSON.parse(this.buffer.trim())];
      } catch { return []; }
    }
    return [];
  }
}
