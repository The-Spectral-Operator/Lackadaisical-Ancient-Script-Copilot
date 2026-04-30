import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NdjsonSplitter } from '../src/ollama/stream.js';

describe('NdjsonSplitter', () => {
  it('splits NDJSON lines correctly', () => {
    const splitter = new NdjsonSplitter();
    const results = splitter.push('{"a":1}\n{"b":2}\n');
    assert.equal(results.length, 2);
    assert.deepEqual(results[0], { a: 1 });
    assert.deepEqual(results[1], { b: 2 });
  });

  it('handles partial lines', () => {
    const splitter = new NdjsonSplitter();
    const r1 = splitter.push('{"partial":');
    assert.equal(r1.length, 0);
    const r2 = splitter.push('true}\n');
    assert.equal(r2.length, 1);
    assert.deepEqual(r2[0], { partial: true });
  });

  it('flushes remaining buffer', () => {
    const splitter = new NdjsonSplitter();
    splitter.push('{"last":true}');
    const results = splitter.flush();
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], { last: true });
  });
});
