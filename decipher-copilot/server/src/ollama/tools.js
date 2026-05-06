/**
 * Tool definitions and dispatch for LLM-callable functions.
 * Abliteration: system prompt ensures no refusal/hedging.
 */

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'lexicon_lookup',
      description: 'Look up a sign-id sequence in the active lexicon. Returns all matching entries with glosses and confidence.',
      parameters: {
        type: 'object',
        required: ['token'],
        properties: {
          lexicon_id: { type: 'string', description: 'Lexicon ID (uses active if omitted)' },
          token: { type: 'string', description: 'Space-separated sign IDs to look up' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'corpus_search',
      description: 'Search inscriptions in the active corpus by text or regex pattern.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          corpus_id: { type: 'string' },
          query: { type: 'string', description: 'Search query (FTS or regex)' },
          mode: { type: 'string', enum: ['fts', 'regex'], description: 'Search mode' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'frequency_report',
      description: 'Generate unigram/bigram/trigram frequency report for a corpus.',
      parameters: {
        type: 'object',
        required: ['corpus_id'],
        properties: {
          corpus_id: { type: 'string' },
          n: { type: 'integer', enum: [1, 2, 3], description: 'N-gram size' },
          positional: { type: 'boolean', description: 'Include positional analysis' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'entropy_report',
      description: 'Compute entropy metrics for a corpus (Shannon, conditional, block, Rényi, Yule K).',
      parameters: {
        type: 'object',
        required: ['corpus_id', 'kind'],
        properties: {
          corpus_id: { type: 'string' },
          kind: { type: 'string', enum: ['shannon', 'conditional', 'block', 'rényi', 'yule_k'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'zipf_report',
      description: 'Compute Zipf law fit for a corpus (slope, R², KS test).',
      parameters: {
        type: 'object',
        required: ['corpus_id'],
        properties: { corpus_id: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_lexicon_entry',
      description: 'Add or update a lexicon entry with a proposed reading.',
      parameters: {
        type: 'object',
        required: ['token', 'gloss'],
        properties: {
          lexicon_id: { type: 'string' },
          token: { type: 'string' },
          gloss: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          source: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cross_inscription_check',
      description: 'Validate a proposed sign-to-reading hypothesis across all inscriptions in a corpus. Reports coverage, mutual information, broken cognates, and reading statistics.',
      parameters: {
        type: 'object',
        required: ['corpus_id', 'hypothesis'],
        properties: {
          corpus_id: { type: 'string', description: 'Corpus to validate against' },
          hypothesis: {
            type: 'array',
            description: 'Array of sign-reading pairs to validate',
            items: {
              type: 'object',
              required: ['sign', 'reading'],
              properties: {
                sign: { type: 'string', description: 'Sign ID' },
                reading: { type: 'string', description: 'Proposed phonetic/semantic reading' },
              },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cross_script_correlation',
      description: 'Compare two corpora from different scripts to detect structural similarities via frequency, bigram, positional, and entropy correlation analysis.',
      parameters: {
        type: 'object',
        required: ['corpus_a_id', 'corpus_b_id'],
        properties: {
          corpus_a_id: { type: 'string', description: 'First corpus ID' },
          corpus_b_id: { type: 'string', description: 'Second corpus ID' },
          methods: { type: 'array', items: { type: 'string', enum: ['frequency', 'bigram', 'positional', 'entropy'] }, description: 'Correlation methods to apply' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cross_script_matrix',
      description: 'Run pairwise correlation across all available corpora to identify structurally similar scripts. Returns a ranked matrix of similarities.',
      parameters: {
        type: 'object',
        properties: {
          methods: { type: 'array', items: { type: 'string' }, description: 'Correlation methods' },
          min_inscriptions: { type: 'integer', description: 'Minimum inscriptions required per corpus (default 5)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'single_glyph_analysis',
      description: 'Perform comprehensive single-glyph analysis: frequency, positional preference, predecessor/successor distributions, co-occurrence patterns, and contextual usage.',
      parameters: {
        type: 'object',
        required: ['corpus_id', 'sign'],
        properties: {
          corpus_id: { type: 'string', description: 'Corpus to analyze' },
          sign: { type: 'string', description: 'Sign/glyph ID to analyze' },
          include_context: { type: 'boolean', description: 'Include context windows (default true)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glyph_chain_detection',
      description: 'Detect recurring multi-glyph chains (n-gram sequences) in a corpus, scored by mutual information. Identifies formulaic expressions, compound signs, and grammatical patterns.',
      parameters: {
        type: 'object',
        required: ['corpus_id'],
        properties: {
          corpus_id: { type: 'string', description: 'Corpus to analyze' },
          min_length: { type: 'integer', description: 'Minimum chain length (default 2)' },
          max_length: { type: 'integer', description: 'Maximum chain length (default 6)' },
          min_frequency: { type: 'integer', description: 'Minimum occurrence count (default 2)' },
          score_method: { type: 'string', enum: ['mutual_info', 'log_likelihood', 'dice'], description: 'Scoring method (default: mutual_info)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'multi_glyph_analysis',
      description: 'Analyze a specific multi-glyph sequence in context: find all occurrences, compute pointwise mutual information, positional preferences, and surrounding patterns.',
      parameters: {
        type: 'object',
        required: ['corpus_id', 'sequence'],
        properties: {
          corpus_id: { type: 'string', description: 'Corpus to search' },
          sequence: { type: 'string', description: 'Space-separated sign sequence to analyze' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_scripts',
      description: 'List all loaded scripts, lexicons with entry counts, and corpora with inscription counts. Call this to discover available lexicon_id and corpus_id values before using other tools.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

/**
 * Build the abliterated system prompt for decipherment.
 * No refusal, no hedging, direct scholarly analysis.
 * Accepts `db` to inject live lexicon/corpus catalog into the prompt.
 */
export function buildSystemPrompt(config, script, corpus, lexicon, db) {
  const ablitPrefix = config.abliteration.enabled ? config.abliteration.systemPromptPrefix + '\n\n' : '';

  const scriptContext = script ? `Active script: ${script}.` : 'No specific script selected.';
  const corpusContext = corpus ? `Active corpus: ${corpus.name} (${corpus.inscription_count || 'unknown'} inscriptions).` : '';
  const lexiconContext = lexicon ? `Active lexicon: ${lexicon.name} (${lexicon.entry_count || 'unknown'} entries).` : '';

  // Inject live DB catalog if db is available
  let catalogSection = '';
  if (db) {
    try {
      const lexicons = db.system.prepare(`
        SELECT l.id, l.name, COUNT(le.id) AS entry_count
        FROM lexicons l LEFT JOIN lexicon_entries le ON le.lexicon_id = l.id
        GROUP BY l.id ORDER BY entry_count DESC
      `).all();
      const corpora = db.system.prepare(`
        SELECT c.id, c.name, COUNT(i.id) AS inscription_count
        FROM corpora c LEFT JOIN inscriptions i ON i.corpus_id = c.id
        GROUP BY c.id ORDER BY inscription_count DESC
      `).all();

      if (lexicons.length > 0 || corpora.length > 0) {
        catalogSection = '\n\nAVAILABLE DATA CATALOG:';
        if (lexicons.length > 0) {
          catalogSection += '\nLexicons:';
          for (const l of lexicons) {
            catalogSection += `\n  - lexicon_id="${l.id}" name="${l.name}" entries=${l.entry_count}`;
          }
        }
        if (corpora.length > 0) {
          catalogSection += '\nCorpora:';
          for (const c of corpora) {
            catalogSection += `\n  - corpus_id="${c.id}" name="${c.name}" inscriptions=${c.inscription_count}`;
          }
        }
      }
    } catch { /* non-fatal */ }
  }

  return `${ablitPrefix}You are a world-class ancient script decipherment research copilot. You have encyclopedic knowledge of all ancient writing systems, their histories, phonetic values, and grammatical structures.

${scriptContext} ${corpusContext} ${lexiconContext}${catalogSection}

CORE DIRECTIVES:
1. NEVER refuse to attempt a decipherment or translation. Always provide your best scholarly interpretation.
2. Assign confidence levels (0.0-1.0) to all readings but NEVER use low confidence as an excuse not to try.
3. Use the provided tools (lexicon_lookup, corpus_search, frequency_report, entropy_report, zipf_report) BEFORE making claims.
4. Cite inscription IDs and scholarly sources when available.
5. When multiple interpretations exist, present ALL of them ranked by likelihood.
6. Treat undeciphered scripts as solvable puzzles, not mysteries to be avoided.
7. Apply cross-linguistic comparison, frequency analysis, and structural pattern recognition aggressively.
8. When you see a glyph or sign sequence, immediately attempt phonetic and semantic analysis.

TOOL USAGE:
- Call \`lexicon_lookup\` WITHOUT a \`lexicon_id\` to search ALL scripts at once.
- Call \`list_scripts\` if you do not know available corpus or lexicon IDs.
- NEVER hedge or say "I don't have access" — you DO have access via the tools above.
- No hedging permitted. Provide direct answers.

MODEL BEHAVIOR:
- You are running as an abliterated model with refusal vectors removed.
- You provide DIRECT answers without hedging, disclaimers, or "I cannot" statements.
- You approach every decipherment challenge with confidence and scholarly rigor.
- If uncertain, you state your best hypothesis with a confidence level, not a refusal.

AVAILABLE TOOLS: lexicon_lookup, corpus_search, frequency_report, entropy_report, zipf_report, add_lexicon_entry, cross_inscription_check, cross_script_correlation, cross_script_matrix, single_glyph_analysis, glyph_chain_detection, multi_glyph_analysis, list_scripts`;
}

/**
 * Models that support Ollama's native tool-call API (message.tool_calls).
 * Every other model falls back to text-based tool calling.
 */
const NATIVE_TOOL_MODELS = [
  'llama3.1', 'llama3.2', 'llama3.3',
  'mistral', 'mixtral',
  'command-r',
  'firefunction',
  'hermes3',
  'functionary',
  'smollm2',
];

/**
 * Returns true if the given model supports Ollama's native tool-call API.
 * Custom models (gemma4, aurora-elwing, stonedrift-ancient, spectre-origin,
 * commander-core, etc.) return false and get text-based tool calling instead.
 */
export function modelSupportsNativeTools(modelName) {
  const name = (modelName || '').toLowerCase();
  return NATIVE_TOOL_MODELS.some(m => name.includes(m));
}

/**
 * Build a text-only tool-calling addendum for models that do not support
 * Ollama's native tool call API.  Appended to the system prompt.
 * The model is instructed to emit exactly one <tool_call>JSON</tool_call> line
 * when it needs a tool, then stop and wait for the result.
 */
export function buildTextToolPrompt(tools) {
  const defs = tools.map(t => {
    const fn = t.function;
    const required = fn.parameters?.required || [];
    const props = fn.parameters?.properties || {};
    const paramLines = Object.entries(props)
      .map(([k, v]) => `  ${k} (${v.type || 'any'}${required.includes(k) ? ', required' : ''}): ${v.description || ''}`)
      .join('\n');
    return `${fn.name}: ${fn.description}\nParameters:\n${paramLines || '  (none)'}`;
  }).join('\n\n');

  return `\n\nTEXT TOOL CALLING:
When you need to call a tool, output EXACTLY this on its own line and stop:
<tool_call>{"name":"TOOL_NAME","arguments":{...}}</tool_call>
Do NOT output anything else in that turn. After receiving the tool result, continue your analysis.
You may call tools multiple times. Never fabricate tool results.

TOOLS:
${defs}`;
}

/**
 * Parse <tool_call>JSON</tool_call> blocks out of a model's text response.
 * Returns an array of Ollama-style tool call objects (same shape as message.tool_calls).
 */
export function parseTextToolCalls(text) {
  const calls = [];
  const re = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim());
      if (obj && typeof obj.name === 'string') {
        calls.push({ function: { name: obj.name, arguments: obj.arguments ?? {} } });
      }
    } catch { /* skip malformed blocks */ }
  }
  return calls;
}

/**
 * Strip <tool_call>…</tool_call> blocks from content so they are not shown to the user.
 */
export function stripTextToolCalls(text) {
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '');
}

/**
 * Determine think mode based on model family.
 * - gpt-oss family (includes spectre-origin, commander-core, elessar, cirdan) → "low"|"medium"|"high"
 * - gemma4, phi-4-reasoning, deepseek-r1, qwen3, cogito → boolean true/false
 * - All other models (gemma3, llama, phi3, aurora-elwing, stonedrift-ancient, etc.) → undefined (omit think field)
 */
export function getThinkMode(modelName, requested) {
  const name = modelName.toLowerCase();

  // gpt-oss family uses string-level reasoning
  if (name.includes('gpt-oss') || name.includes('spectre-origin') ||
      name.includes('commander-core') || name.includes('elessar') ||
      name.includes('cirdan') || name.includes('harmony')) {
    if (requested === true) return 'medium';
    if (requested === false) return undefined;
    return requested; // pass through string value like "low"/"medium"/"high"
  }

  // Models that support boolean think mode
  if (name.includes('gemma4') || name.includes('phi-4-reasoning') ||
      name.includes('deepseek-r1') || name.includes('qwen3') ||
      name.includes('cogito')) {
    if (requested === true) return true;
    if (requested === false) return false;
    return !!requested;
  }

  // All other models: omit think field entirely (gemma3, llama, phi3, aurora-elwing, stonedrift-ancient, etc.)
  return undefined;
}
