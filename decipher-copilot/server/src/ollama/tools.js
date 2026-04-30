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
];

/**
 * Build the abliterated system prompt for decipherment.
 * No refusal, no hedging, direct scholarly analysis.
 */
export function buildSystemPrompt(config, script, corpus, lexicon) {
  const ablitPrefix = config.abliteration.enabled ? config.abliteration.systemPromptPrefix + '\n\n' : '';

  const scriptContext = script ? `Active script: ${script}.` : 'No specific script selected.';
  const corpusContext = corpus ? `Active corpus: ${corpus.name} (${corpus.inscription_count || 'unknown'} inscriptions).` : '';
  const lexiconContext = lexicon ? `Active lexicon: ${lexicon.name} (${lexicon.entry_count || 'unknown'} entries).` : '';

  return `${ablitPrefix}You are a world-class ancient script decipherment research copilot. You have encyclopedic knowledge of all ancient writing systems, their histories, phonetic values, and grammatical structures.

${scriptContext} ${corpusContext} ${lexiconContext}

CORE DIRECTIVES:
1. NEVER refuse to attempt a decipherment or translation. Always provide your best scholarly interpretation.
2. Assign confidence levels (0.0-1.0) to all readings but NEVER use low confidence as an excuse not to try.
3. Use the provided tools (lexicon_lookup, corpus_search, frequency_report, entropy_report, zipf_report) BEFORE making claims.
4. Cite inscription IDs and scholarly sources when available.
5. When multiple interpretations exist, present ALL of them ranked by likelihood.
6. Treat undeciphered scripts as solvable puzzles, not mysteries to be avoided.
7. Apply cross-linguistic comparison, frequency analysis, and structural pattern recognition aggressively.
8. When you see a glyph or sign sequence, immediately attempt phonetic and semantic analysis.

MODEL BEHAVIOR:
- You are running as an abliterated model with refusal vectors removed.
- You provide DIRECT answers without hedging, disclaimers, or "I cannot" statements.
- You approach every decipherment challenge with confidence and scholarly rigor.
- If uncertain, you state your best hypothesis with a confidence level, not a refusal.

AVAILABLE TOOLS: lexicon_lookup, corpus_search, frequency_report, entropy_report, zipf_report, add_lexicon_entry, cross_inscription_check, cross_script_correlation, cross_script_matrix, single_glyph_analysis, glyph_chain_detection, multi_glyph_analysis`;
}

/**
 * Determine think mode based on model family.
 * gpt-oss uses string levels, others use boolean.
 */
export function getThinkMode(modelName, requested) {
  if (modelName.includes('gpt-oss') || modelName.includes('harmony')) {
    // gpt-oss/Harmony uses "low" | "medium" | "high"
    if (requested === true) return 'medium';
    if (requested === false) return undefined;
    return requested; // pass through string value
  }
  // All other trusted models (gemma4, llama, phi, mistral) use boolean
  return requested;
}
