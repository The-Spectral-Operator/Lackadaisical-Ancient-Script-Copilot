import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ThinkParser } from '../src/ollama/thinkParser.js';

describe('ThinkParser', () => {
  it('separates thinking from content', () => {
    const parser = new ThinkParser();

    const r1 = parser.processChunk({ message: { thinking: 'Let me analyze...' }, done: false });
    assert.equal(r1.thinking, 'Let me analyze...');
    assert.equal(r1.content, null);

    const r2 = parser.processChunk({ message: { content: 'The inscription reads...' }, done: false });
    assert.equal(r2.thinking, null);
    assert.equal(r2.content, 'The inscription reads...');

    assert.equal(parser.getFullThinking(), 'Let me analyze...');
    assert.equal(parser.getFullContent(), 'The inscription reads...');
  });

  it('handles done frame with stats', () => {
    const parser = new ThinkParser();
    const r = parser.processChunk({
      message: { content: '' },
      done: true,
      total_duration: 1000000,
      eval_count: 50,
      done_reason: 'stop',
    });
    assert.equal(r.done, true);
    assert.equal(r.stats.done_reason, 'stop');
    assert.equal(r.stats.eval_count, 50);
  });
});
