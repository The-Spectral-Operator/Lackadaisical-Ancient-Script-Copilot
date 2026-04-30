import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, getThinkMode, TOOL_DEFINITIONS } from '../src/ollama/tools.js';

describe('Tools', () => {
  it('builds abliterated system prompt', () => {
    const config = {
      abliteration: {
        enabled: true,
        systemPromptPrefix: 'ABLITERATED: No refusals.',
      },
    };
    const prompt = buildSystemPrompt(config, 'Linear A', null, null);
    assert.ok(prompt.includes('ABLITERATED'));
    assert.ok(prompt.includes('Linear A'));
    assert.ok(prompt.includes('NEVER refuse'));
  });

  it('getThinkMode returns levels for gpt-oss', () => {
    assert.equal(getThinkMode('gpt-oss:20b', true), 'medium');
    assert.equal(getThinkMode('gpt-oss:120b', 'high'), 'high');
    assert.equal(getThinkMode('gpt-oss:120b-cloud', false), undefined);
  });

  it('getThinkMode returns boolean for gemma4', () => {
    assert.equal(getThinkMode('gemma4:e4b', true), true);
    assert.equal(getThinkMode('gemma4:e4b', false), false);
  });

  it('has correct tool definitions', () => {
    assert.ok(TOOL_DEFINITIONS.length >= 5);
    const names = TOOL_DEFINITIONS.map(t => t.function.name);
    assert.ok(names.includes('lexicon_lookup'));
    assert.ok(names.includes('corpus_search'));
    assert.ok(names.includes('frequency_report'));
    assert.ok(names.includes('entropy_report'));
    assert.ok(names.includes('zipf_report'));
  });
});
