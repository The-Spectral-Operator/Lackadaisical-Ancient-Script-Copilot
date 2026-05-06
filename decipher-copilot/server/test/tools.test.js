import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, getThinkMode, TOOL_DEFINITIONS, modelSupportsNativeTools, buildTextToolPrompt, parseTextToolCalls, stripTextToolCalls } from '../src/ollama/tools.js';

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

  describe('modelSupportsNativeTools', () => {
    it('returns true for known native-tool models', () => {
      assert.equal(modelSupportsNativeTools('llama3.2:3b'), true);
      assert.equal(modelSupportsNativeTools('mistral:7b'), true);
      assert.equal(modelSupportsNativeTools('hermes3:8b'), true);
      assert.equal(modelSupportsNativeTools('functionary:v3'), true);
    });

    it('returns false for custom/gemma models without native tool support', () => {
      assert.equal(modelSupportsNativeTools('gemma4:e4b'), false);
      assert.equal(modelSupportsNativeTools('gemma3:12b'), false);
      assert.equal(modelSupportsNativeTools('aurora-elwing-v2:latest'), false);
      assert.equal(modelSupportsNativeTools('stonedrift-ancient:v3'), false);
      assert.equal(modelSupportsNativeTools('spectre-origin:20b'), false);
      assert.equal(modelSupportsNativeTools('commander-core:20b'), false);
    });

    it('is case-insensitive', () => {
      assert.equal(modelSupportsNativeTools('Mistral:7B'), true);
      assert.equal(modelSupportsNativeTools('LLAMA3.2:latest'), true);
    });

    it('handles null/undefined gracefully', () => {
      assert.equal(modelSupportsNativeTools(null), false);
      assert.equal(modelSupportsNativeTools(undefined), false);
      assert.equal(modelSupportsNativeTools(''), false);
    });
  });

  describe('parseTextToolCalls', () => {
    it('parses a single well-formed tool call', () => {
      const text = 'I will look this up.\n<tool_call>{"name":"lexicon_lookup","arguments":{"token":"A1"}}</tool_call>';
      const calls = parseTextToolCalls(text);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].function.name, 'lexicon_lookup');
      assert.deepEqual(calls[0].function.arguments, { token: 'A1' });
    });

    it('parses multiple tool calls', () => {
      const text = '<tool_call>{"name":"corpus_search","arguments":{"query":"sun"}}</tool_call>\n<tool_call>{"name":"zipf_report","arguments":{"corpus_id":"c1"}}</tool_call>';
      const calls = parseTextToolCalls(text);
      assert.equal(calls.length, 2);
      assert.equal(calls[0].function.name, 'corpus_search');
      assert.equal(calls[1].function.name, 'zipf_report');
    });

    it('skips malformed JSON blocks', () => {
      const text = '<tool_call>not json</tool_call>';
      const calls = parseTextToolCalls(text);
      assert.equal(calls.length, 0);
    });

    it('skips blocks missing a name field', () => {
      const text = '<tool_call>{"arguments":{}}</tool_call>';
      const calls = parseTextToolCalls(text);
      assert.equal(calls.length, 0);
    });

    it('returns empty array when no tool calls present', () => {
      const calls = parseTextToolCalls('Just plain text with no tool calls.');
      assert.equal(calls.length, 0);
    });

    it('defaults arguments to empty object when absent', () => {
      const text = '<tool_call>{"name":"list_scripts"}</tool_call>';
      const calls = parseTextToolCalls(text);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].function.arguments, {});
    });
  });

  describe('stripTextToolCalls', () => {
    it('removes tool_call tags from text', () => {
      const text = 'Let me check.\n<tool_call>{"name":"lexicon_lookup","arguments":{}}</tool_call>\nDone.';
      const stripped = stripTextToolCalls(text);
      assert.ok(!stripped.includes('<tool_call>'));
      assert.ok(stripped.includes('Let me check.'));
      assert.ok(stripped.includes('Done.'));
    });

    it('returns plain text unchanged', () => {
      const text = 'The inscription reads: sun king.';
      assert.equal(stripTextToolCalls(text), text);
    });
  });

  describe('buildTextToolPrompt', () => {
    it('includes tool names and descriptions', () => {
      const tools = [TOOL_DEFINITIONS.find(t => t.function.name === 'lexicon_lookup')];
      const prompt = buildTextToolPrompt(tools);
      assert.ok(prompt.includes('lexicon_lookup'));
      assert.ok(prompt.includes('<tool_call>'));
      assert.ok(prompt.includes('token'));
    });

    it('includes all passed tools', () => {
      const prompt = buildTextToolPrompt(TOOL_DEFINITIONS.slice(0, 3));
      assert.ok(prompt.includes(TOOL_DEFINITIONS[0].function.name));
      assert.ok(prompt.includes(TOOL_DEFINITIONS[1].function.name));
      assert.ok(prompt.includes(TOOL_DEFINITIONS[2].function.name));
    });
  });
});
