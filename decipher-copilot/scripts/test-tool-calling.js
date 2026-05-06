#!/usr/bin/env node
/**
 * Live tool-calling test against a running Ollama instance.
 *
 * Usage:
 *   node scripts/test-tool-calling.js [model]
 *
 * If no model is given the script picks the first model returned by
 * `ollama list`.  Requires Ollama to be running at http://127.0.0.1:11434.
 *
 * Tests both paths:
 *   - Native tool calling  (Ollama message.tool_calls) for models that support it
 *   - Text-based tool calling (<tool_call>JSON</tool_call>) for all others
 */

import { modelSupportsNativeTools, buildTextToolPrompt, parseTextToolCalls, TOOL_DEFINITIONS } from '../server/src/ollama/tools.js';

const OLLAMA_BASE = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const TIMEOUT_SHORT_MS = 4_000;
const TIMEOUT_TAGS_MS = 5_000;
const TIMEOUT_CHAT_MS = 120_000;

// ─── helpers ────────────────────────────────────────────────────────────────

async function ollamaVersion() {
  const r = await fetch(`${OLLAMA_BASE}/api/version`, { signal: AbortSignal.timeout(TIMEOUT_SHORT_MS) });
  if (!r.ok) throw new Error(`Ollama not reachable: HTTP ${r.status}`);
  return (await r.json()).version;
}

async function ollamaTags() {
  const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(TIMEOUT_TAGS_MS) });
  if (!r.ok) throw new Error(`/api/tags HTTP ${r.status}`);
  return (await r.json()).models || [];
}

async function ollamaChat(model, messages, tools) {
  const body = { model, messages, stream: false };
  if (tools) body.tools = tools;
  const r = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_CHAT_MS),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`/api/chat HTTP ${r.status}: ${t}`);
  }
  return r.json();
}

// Minimal stub tool implementations for the test (no DB needed).
const STUB_TOOLS = {
  list_scripts: () => ({
    scripts: [{ id: 'indus', display: 'Indus Valley Script', era: '2600-1900 BCE', region: 'South Asia' }],
    lexicons: [{ id: 'lex1', name: 'IVC Lexicon', entry_count: 42 }],
    corpora: [{ id: 'corp1', name: 'Mohenjo-daro seals', inscription_count: 371 }],
  }),
  lexicon_lookup: ({ token }) => ({
    matches: [{ token, gloss: `[stub gloss for "${token}"]`, confidence: 0.6, source: 'test' }],
  }),
  corpus_search: ({ query }) => ({
    results: [{ id: 'ins001', text: `stub result for query "${query}"`, corpus_id: 'corp1' }],
  }),
  frequency_report: ({ corpus_id }) => ({
    corpus_id, unigrams: [{ sign: 'A1', count: 42 }, { sign: 'B2', count: 31 }],
  }),
};

function dispatchStubTool(name, args) {
  const fn = STUB_TOOLS[name];
  if (!fn) return { error: `Unknown tool: ${name}` };
  try { return fn(args); } catch (e) { return { error: e.message }; }
}

// ─── test runners ────────────────────────────────────────────────────────────

async function testNativeToolCalling(model) {
  console.log(`\n  [native] Testing with model: ${model}`);

  const tools = TOOL_DEFINITIONS.filter(t => ['list_scripts', 'lexicon_lookup', 'corpus_search'].includes(t.function.name));
  const messages = [
    { role: 'system', content: 'You are a test assistant. Use the list_scripts tool to discover what corpora are available, then report back.' },
    { role: 'user', content: 'Call list_scripts now to find the available corpora.' },
  ];

  let toolCallsMade = 0;

  for (let round = 0; round < 4; round++) {
    const resp = await ollamaChat(model, messages, tools);
    const msg = resp.message || {};

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        const name = tc.function?.name;
        const args = tc.function?.arguments || {};
        console.log(`    ✓ tool call: ${name}(${JSON.stringify(args)})`);
        const result = dispatchStubTool(name, args);
        console.log(`      result: ${JSON.stringify(result).slice(0, 120)}...`);
        toolCallsMade++;
        messages.push(
          { role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls },
          { role: 'tool', content: JSON.stringify(result) },
        );
      }
    } else {
      console.log(`    ✓ final answer: ${(msg.content || '').slice(0, 200)}`);
      break;
    }
  }

  if (toolCallsMade === 0) {
    console.log('    ✗ No tool calls were made (model may not support native tool calling)');
    return false;
  }
  console.log(`  [native] PASSED — ${toolCallsMade} tool call(s) executed`);
  return true;
}

async function testTextToolCalling(model) {
  console.log(`\n  [text]   Testing with model: ${model}`);

  const tools = TOOL_DEFINITIONS.filter(t => ['list_scripts', 'lexicon_lookup', 'corpus_search'].includes(t.function.name));
  const textToolSection = buildTextToolPrompt(tools);
  const messages = [
    {
      role: 'system',
      content: `You are a test assistant.${textToolSection}`,
    },
    {
      role: 'user',
      content: 'Call list_scripts now to find the available corpora and lexicons.',
    },
  ];

  let toolCallsMade = 0;

  for (let round = 0; round < 4; round++) {
    // Do NOT pass tools= for text-based models
    const resp = await ollamaChat(model, messages);
    const content = resp.message?.content || '';

    const calls = parseTextToolCalls(content);

    if (calls.length > 0) {
      messages.push({ role: 'assistant', content });
      for (const tc of calls) {
        const name = tc.function?.name;
        const args = tc.function?.arguments || {};
        console.log(`    ✓ tool call: ${name}(${JSON.stringify(args)})`);
        const result = dispatchStubTool(name, args);
        console.log(`      result: ${JSON.stringify(result).slice(0, 120)}...`);
        toolCallsMade++;
        messages.push({
          role: 'user',
          content: `<tool_result name="${name}">\n${JSON.stringify(result, null, 2)}\n</tool_result>`,
        });
      }
    } else {
      console.log(`    ✓ final answer: ${content.slice(0, 200)}`);
      break;
    }
  }

  if (toolCallsMade === 0) {
    console.log('    ✗ No tool calls were made (model did not follow tool-call format)');
    return false;
  }
  console.log(`  [text]   PASSED — ${toolCallsMade} tool call(s) executed`);
  return true;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Decipher-Copilot Live Tool-Calling Test ===\n');

  let version;
  try {
    version = await ollamaVersion();
    console.log(`Ollama version: ${version}`);
  } catch (err) {
    console.error(`ERROR: Cannot reach Ollama at ${OLLAMA_BASE}`);
    console.error('  Make sure Ollama is running: ollama serve');
    process.exit(1);
  }

  const models = await ollamaTags();
  if (models.length === 0) {
    console.error('ERROR: No models found. Pull a model first, e.g.: ollama pull gemma3:4b');
    process.exit(1);
  }

  const modelArg = process.argv[2];
  let targetModel;
  if (modelArg) {
    targetModel = models.find(m => m.name === modelArg || m.name.startsWith(modelArg))?.name;
    if (!targetModel) {
      console.error(`ERROR: Model "${modelArg}" not found. Available: ${models.map(m => m.name).join(', ')}`);
      process.exit(1);
    }
  } else {
    targetModel = models[0].name;
    console.log(`No model specified — using first available: ${targetModel}`);
  }

  console.log(`\nAvailable models: ${models.map(m => m.name).join(', ')}`);
  console.log(`Target model: ${targetModel}`);
  const native = modelSupportsNativeTools(targetModel);
  console.log(`Native tool support: ${native ? 'YES (Ollama API)' : 'NO (text-based fallback)'}`);

  let passed = false;
  try {
    if (native) {
      passed = await testNativeToolCalling(targetModel);
      if (!passed) {
        console.log('\n  Falling back to text-based test...');
        passed = await testTextToolCalling(targetModel);
      }
    } else {
      passed = await testTextToolCalling(targetModel);
    }
  } catch (err) {
    console.error(`\nTest error: ${err.message}`);
    process.exit(1);
  }

  console.log('\n=== Result:', passed ? 'PASS ✓' : 'FAIL ✗', '===');
  process.exit(passed ? 0 : 1);
}

main();
