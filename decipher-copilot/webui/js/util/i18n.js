/**
 * Minimal i18n — English strings only for v1.0 alpha.
 * Structure supports future locale additions.
 */

const strings = {
  en: {
    appName: 'Ancient Script Decipherment Copilot',
    newSession: '+ New',
    send: 'Send ▶',
    cancel: '✕ Cancel',
    think: '🧠 Think',
    tools: '🔧 Tools',
    settings: '⚙ Settings',
    lexicon: '📖 Lexicon',
    corpus: '📜 Corpus',
    attach: '📎',
    model: 'Model:',
    ollamaOk: '✓ Ollama online',
    ollamaDown: '✗ Ollama offline',
    welcomeTitle: '𓂀 Ancient Script Decipherment Copilot',
    welcomeBody: 'Ready to decipher and translate ancient scripts. Model is abliterated — no refusals, direct scholarly analysis.',
    thinkingLabel: '🧠 Model Reasoning',
    tokens: (n) => `${n} tokens`,
    toolCallLabel: (name) => `🔧 Tool: ${name}`,
    toolResultLabel: (name) => `✓ Result: ${name}`,
    errorPrefix: '⚠ Error: ',
    sessionDefault: 'New Decipherment Session',
    saveSettings: 'Save Settings',
    ollamaHost: 'Ollama Host',
    defaultModel: 'Default Model',
    numCtx: 'Context Length',
    temperature: 'Temperature',
    abliteration: 'Abliteration (remove refusal)',
    quickAnalyze: '📊 Analyze Corpus',
    quickDecipher: '🔍 Decipher Inscription',
    quickTranslate: '🌐 Translate Text',
    quickCompare: '⚖️ Cross-script Compare',
    confidence: (v) => `conf: ${(v * 100).toFixed(0)}%`,
    noLexicons: 'No lexicons loaded. Datasets seed on server start.',
    noCorpora: 'No corpora loaded.',
    searchPlaceholder: 'Search inscriptions...',
    lexiconEntry: 'Lexicon Entry',
    addEntry: '+ Add Entry',
    exportJson: 'Export JSON',
    exportCsv: 'Export CSV',
    importFile: 'Import File',
    scriptFilter: 'Filter by script',
    allScripts: 'All Scripts',
    modelLoaded: '(loaded)',
    modelDefault: '★',
    capVision: '👁 Vision',
    capThink: '🧠 Think',
    capTools: '🔧 Tools',
    capAudio: '🔊 Audio',
    capCloud: '☁ Cloud',
    pullModel: 'Pull Model',
    modelName: 'Model name (e.g. gemma4:e4b)',
    pulling: 'Pulling...',
    inscriptionViewer: '🔬 Inscription Viewer',
    noInscription: 'Select an inscription to view',
    statsTitle: '📊 Corpus Statistics',
    zipfChart: 'Zipf Log-Log Plot',
    entropyChart: 'Shannon Entropy',
    freqChart: 'Sign Frequency (Top 30)',
  },
};

let locale = 'en';

export function t(key, ...args) {
  const val = strings[locale]?.[key] ?? strings.en[key] ?? key;
  return typeof val === 'function' ? val(...args) : val;
}

export function setLocale(loc) {
  if (strings[loc]) locale = loc;
}
