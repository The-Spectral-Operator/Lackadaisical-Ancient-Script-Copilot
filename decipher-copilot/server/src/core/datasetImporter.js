/**
 * Dataset importer: parses the various dataset file structures from the datasets/ folder.
 * Handles JSON with different schemas and CSV files, normalizing them into lexicon entries.
 * Also handles .zip files containing JSON datasets (unzips to same directory on import).
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Import all datasets from the datasets directory.
 * Returns normalized entries grouped by script.
 */
export function importAllDatasets(datasetsDir) {
  // Auto-unzip any .zip files that have matching .json not yet extracted
  const allFiles = readdirSync(datasetsDir);
  for (const file of allFiles) {
    if (extname(file).toLowerCase() === '.zip') {
      const jsonName = file.replace(/\.zip$/, '.json');
      const jsonPath = join(datasetsDir, jsonName);
      const zipPath = join(datasetsDir, file);
      if (!existsSync(jsonPath)) {
        try {
          execSync(`unzip -o "${zipPath}" -d "${datasetsDir}"`, { stdio: 'pipe' });
        } catch { /* ignore unzip failures */ }
      }
    }
  }

  // Skip list: metadata/catalog files that are not lexicons
  const SKIP_FILES = new Set(['.gitkeep', 'manifest.json', 'attested_resource_catalog.json']);

  // Priority-sorted file list: basic first, then MASTER/ls_enhanced, then EXPANDED_OPERATOR_SPECTRE last (richest wins via INSERT OR REPLACE)
  const files = readdirSync(datasetsDir)
    .filter(f => !SKIP_FILES.has(f))
    .sort((a, b) => {
      const prioA = getFilePriority(a);
      const prioB = getFilePriority(b);
      return prioA - prioB;
    });

  const results = [];

  for (const file of files) {
    const filePath = join(datasetsDir, file);
    const ext = extname(file).toLowerCase();
    const scriptName = inferScriptName(file);

    try {
      let entries;
      if (ext === '.json') {
        // For very large files (>100MB), use streaming approach
        const fileSize = statSync(filePath).size;
        if (fileSize > 100 * 1024 * 1024) {
          entries = parseLargeJsonDataset(filePath, file);
        } else {
          entries = parseJsonDataset(filePath, file);
        }
      } else if (ext === '.csv') {
        entries = parseCsvDataset(filePath, file);
      } else if (ext === '.md') {
        entries = parseMarkdownDataset(filePath, file);
      } else {
        continue;
      }

      results.push({
        file,
        script: scriptName,
        entries: entries || [],
        count: (entries || []).length,
      });
    } catch (err) {
      results.push({ file, script: scriptName, entries: [], count: 0, error: err.message });
    }
  }

  return results;
}

/**
 * Determine seeding priority for a dataset file.
 * Lower number = seeds first (basic/legacy). Higher = seeds last (wins via INSERT OR REPLACE).
 * Priority 1: basic/legacy files
 * Priority 2: MASTER or ls_enhanced files — Operator decipherment work
 * Priority 3: EXPANDED_OPERATOR_SPECTRE files — richest attested reference data
 */
function getFilePriority(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes('expanded_operator_spectre')) return 3;
  if (lower.includes('master') || lower.includes('ls_enhanced')) return 2;
  return 1;
}

/**
 * Parse a JSON dataset file. Handles multiple structures:
 * 1. { metadata: {...}, entries: [...] } - array format (aramaic, phoenician)
 * 2. { metadata: {...}, "unicode_key": { phoneme, gloss, ... } } - object format (brahmi, indus)
 * 3. { signs: [...] } - sign list format
 * 4. { syntax_patterns: {...} } - grammar format (maya)
 * 5. Direct array of entries
 */
function parseJsonDataset(filePath, filename) {
  let raw = readFileSync(filePath, 'utf-8');
  let data;
  // Normalize CRLF to LF
  raw = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  try {
    data = JSON.parse(raw);
  } catch {
    // Sanitize: escape unescaped control characters within string values
    raw = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ''); // remove non-printable control chars
    // Fix unescaped newlines/tabs inside JSON strings by replacing them
    raw = raw.replace(/(?<=":[\s]*"[^"]*)\n(?=[^"]*")/g, '\\n');
    // Fix "key": "value1", "value2" pattern (orphan strings after values) - must run before trailing comma removal
    raw = raw.replace(/"([^"]+)":\s*"([^"]*)",\s*"([^"]*)"\s*,/g, '"$1": ["$2", "$3"],');
    raw = raw.replace(/"([^"]+)":\s*"([^"]*)",\s*"([^"]*)"\s*\n/g, '"$1": ["$2", "$3"]\n');
    raw = raw.replace(/,\s*([}\]])/g, '$1'); // remove trailing commas
    raw = raw.replace(/\/\/[^\n]*/g, ''); // remove single-line comments
    raw = raw.replace(/\/\*[\s\S]*?\*\//g, ''); // remove block comments
    // Fix unbalanced braces (add missing } at end)
    const openBraces = (raw.match(/\{/g) || []).length;
    const closeBraces = (raw.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      for (let i = 0; i < openBraces - closeBraces; i++) raw += '}';
    }
    // If there are multiple top-level objects concatenated, take just the first
    let braceCount = 0;
    let endPos = 0;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '{') braceCount++;
      else if (raw[i] === '}') { braceCount--; if (braceCount === 0) { endPos = i + 1; break; } }
    }
    if (endPos > 0 && endPos < raw.length) raw = raw.slice(0, endPos);
    try {
      data = JSON.parse(raw);
    } catch {
      // Last resort: try line-by-line stripping problematic lines
      const lines = raw.split('\n');
      const cleaned = lines.filter(l => {
        try { JSON.parse('{' + l + '}'); return true; } catch { return !l.includes('\t'); }
      });
      try {
        data = JSON.parse(cleaned.join('\n'));
      } catch (e3) {
        throw new Error(`JSON parse failed: ${e3.message}`);
      }
    }
  }
  const entries = [];

  // Type 1: entries array (aramaic, phoenician, coptic, gothic, etc.)
  if (data.entries && Array.isArray(data.entries)) {
    for (const e of data.entries) {
      entries.push(normalizeEntry(e, filename));
    }
  }
  // Type 1b: lexicon array
  else if (data.lexicon && Array.isArray(data.lexicon)) {
    for (const e of data.lexicon) {
      entries.push(normalizeEntry(e, filename));
    }
  }
  // Type 1c: signs array
  else if (data.signs && Array.isArray(data.signs)) {
    for (const e of data.signs) {
      entries.push(normalizeSignEntry(e, filename));
    }
  }
  // Type 2: object-keyed entries (brahmi, indus valley, meroitic, voynich, etc.)
  // Also handles { metadata: {...}, named_array: [...] } pattern (e.g. latin_lexicon_50k)
  else if (data._metadata || data.metadata) {
    const meta = data._metadata || data.metadata;
    // First check if there's a named array alongside metadata (e.g. "entries", "lexicon", "latin_lexicon")
    let foundArray = false;
    for (const [key, value] of Object.entries(data)) {
      if (key === '_metadata' || key === 'metadata' || key === 'license' ||
          key === 'attribution' || key === 'project' || key === 'changelog' ||
          key === 'research_notes' || key === 'notes') continue;
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        for (const e of value) entries.push(normalizeEntry(e, filename));
        foundArray = true;
        break;
      }
    }
    // If no named array found, look for nested sections with entries/signs arrays,
    // or object-keyed dictionaries (e.g. voynich verified_lexicon/full_lexicon)
    if (!foundArray) {
      for (const [key, value] of Object.entries(data)) {
        if (key === '_metadata' || key === 'metadata' || key === 'license' ||
            key === 'attribution' || key === 'project' || key === 'methodology' ||
            key === 'research_notes' || key === 'changelog') continue;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Check if this section contains its own entries/signs array (e.g. Linear B sections)
          const innerArray = value.entries || value.signs || value.symbols || value.sign_entries;
          if (Array.isArray(innerArray) && innerArray.length > 0) {
            for (const e of innerArray) {
              entries.push(normalizeEntry(e, filename));
            }
            continue;
          }
          // Check if this is a dictionary of entries (keys are tokens, values have gloss/meaning)
          const subKeys = Object.keys(value);
          if (subKeys.length > 3) {
            const sample = value[subKeys[0]];
            if (typeof sample === 'object' && sample !== null && !Array.isArray(sample)) {
              // Looks like a token→entry dictionary
              for (const [tok, entry] of Object.entries(value)) {
                if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
                  entries.push(normalizeObjectEntry(tok, entry, filename));
                }
              }
            } else {
              entries.push(normalizeObjectEntry(key, value, filename));
            }
          } else {
            entries.push(normalizeObjectEntry(key, value, filename));
          }
        }
      }
    }
  }
  // Type 3: grammar/rules format (maya)
  else if (data.syntax_patterns || data.phonological_rules || data.morphological_patterns) {
    // Extract meaningful entries from grammar structures
    entries.push(...extractGrammarEntries(data, filename));
  }
  // Type 4: Direct array
  else if (Array.isArray(data)) {
    for (const e of data) {
      entries.push(normalizeEntry(e, filename));
    }
  }
  // Type 5: Linear A/B style with symbols/entries
  else if (data.symbols || data.script_entries || data.sign_entries) {
    const arr = data.symbols || data.script_entries || data.sign_entries;
    if (Array.isArray(arr)) {
      for (const e of arr) entries.push(normalizeEntry(e, filename));
    }
  }
  // Fallback: try to extract any arrays found
  else {
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        for (const e of value) entries.push(normalizeEntry(e, filename));
        break;
      }
    }
  }

  return entries;
}

/**
 * Parse a large JSON dataset file (>100MB) using line-by-line streaming.
 * Handles files too large for full in-memory JSON.parse.
 * Extracts entries from the "entries" or "lexicon" array by reading line by line.
 */
function parseLargeJsonDataset(filePath, filename) {
  const raw = readFileSync(filePath, 'utf-8');
  const entries = [];

  // Find the start of "entries": [ or "lexicon": [ or similar array
  const arrayMatch = raw.match(/"(entries|lexicon|latin_lexicon|signs)"\s*:\s*\[/);
  if (!arrayMatch) {
    // Try fallback: find any large array
    const fallback = raw.match(/"([^"]+)"\s*:\s*\[\s*\{/);
    if (!fallback) return entries;
  }

  const arrayKey = arrayMatch ? arrayMatch[1] : 'entries';
  const arrayStart = raw.indexOf(arrayMatch ? arrayMatch[0] : '"entries": [');
  const bracketStart = raw.indexOf('[', arrayStart);

  // Parse entries one at a time using brace matching
  let pos = bracketStart + 1;
  let entryCount = 0;

  while (pos < raw.length) {
    // Skip whitespace and commas
    while (pos < raw.length && (raw[pos] === ' ' || raw[pos] === '\n' || raw[pos] === '\r' ||
           raw[pos] === '\t' || raw[pos] === ',')) pos++;

    if (pos >= raw.length || raw[pos] === ']') break;

    if (raw[pos] === '{') {
      // Find matching }
      let depth = 0;
      const start = pos;
      let inString = false;
      let escaped = false;

      for (let i = pos; i < raw.length; i++) {
        const c = raw[i];
        if (escaped) { escaped = false; continue; }
        if (c === '\\' && inString) { escaped = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            const entryStr = raw.slice(start, i + 1);
            try {
              const entry = JSON.parse(entryStr);
              entries.push(normalizeEntry(entry, filename));
              entryCount++;
            } catch {
              // Try fixing common issues in this entry
              try {
                let fixed = entryStr.replace(/,\s*}/g, '}');
                fixed = fixed.replace(/"([^"]+)":\s*"([^"]*)",\s*"([^"]*)"/g, '"$1": ["$2", "$3"]');
                const entry = JSON.parse(fixed);
                entries.push(normalizeEntry(entry, filename));
                entryCount++;
              } catch { /* skip malformed entries */ }
            }
            pos = i + 1;
            break;
          }
        }
      }
      if (depth !== 0) break; // Unbalanced, stop
    } else {
      pos++;
    }
  }

  return entries;
}

/**
 * Parse a CSV dataset file (maya glyphs, greek, musnad)
 */
function parseCsvDataset(filePath, filename) {
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const entries = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < headers.length) continue;

    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j]?.trim() || '';
    }
    entries.push(normalizeCsvEntry(obj, headers, filename));
  }

  return entries;
}

/**
 * Parse a markdown dataset (voynich translation)
 */
function parseMarkdownDataset(filePath, filename) {
  const raw = readFileSync(filePath, 'utf-8');
  const entries = [];
  const lines = raw.split('\n');

  let currentSection = '';
  for (const line of lines) {
    if (line.startsWith('#')) {
      currentSection = line.replace(/^#+\s*/, '').trim();
    } else if (line.trim() && currentSection) {
      entries.push({
        token: currentSection,
        gloss: line.trim(),
        pos: 'text',
        confidence: 0.6,
        source: filename,
        notes: 'Extracted from markdown translation',
      });
    }
  }
  return entries;
}

/**
 * Normalize different entry formats into a standard lexicon entry
 */
function normalizeEntry(e, source) {
  return {
    token: e.token || e.latin_form || e.form || e.lemma || e.sign_id || e.glyph_id ||
           e.unicode || e.aramaic_unicode || e.phoenician || e.transliteration ||
           e.sign || e.symbol || e.linear_elamite_symbol || e.script_symbol ||
           e.canonical_form || e.akkadian || e.cuneiform || e.id || '',
    gloss: e.gloss || e.translation || e.english_gloss || e.english || e.meaning ||
           e.definition || e.value || e.primary_value || e.function ||
           (Array.isArray(e.definitions) && e.definitions.length > 0 ? e.definitions[0] : '') ||
           (e.interpretation && e.interpretation.primary ? e.interpretation.primary : '') ||
           (Array.isArray(e.english_meanings) ? e.english_meanings.join('; ') : (e.english_meanings || '')) ||
           (Array.isArray(e.senses) && e.senses.length > 0 ? (e.senses[0].gloss || e.senses[0].meaning || e.senses[0].definition || JSON.stringify(e.senses[0])) : '') ||
           '',
    pos: e.pos || e.part_of_speech || e.category || e.type || e.sign_type ||
         e.semantic_category || '',
    confidence: e.confidence || e.confidence_score || e.authenticity_score ||
               e.final_confidence || e.certainty || 0.7,
    source: e.source || e.provenance || e.attested_source || e.attestation ||
            e.example_inscription || source,
    notes: e.notes || e.description || e.context_notes || e.glyph_description || '',
    transliteration: e.transliteration || e.latin_translit || e.phoneme ||
                     e.phonetic_value || '',
    root: e.root || e.stem || e.lemma || '',
    script: e.script || inferScriptFromFilename(source),
    period: e.period || e.era || '',
    frequency: e.frequency || '',
    semantic_field: e.semantic_field || e.semantic_domain || '',
  };
}

function normalizeObjectEntry(key, value, source) {
  return {
    token: key,
    gloss: value.gloss || value.translation || value.meaning || value.english || '',
    pos: value.pos || value.part_of_speech || value.category || '',
    confidence: value.confidence || 0.7,
    source: value.attestation || value.source || source,
    notes: value.notes || value.description || '',
    transliteration: value.phoneme || value.transliteration || value.reading || '',
    root: value.root || '',
    script: value.script || inferScriptFromFilename(source),
    language: value.language || '',
    era: value.era || '',
  };
}

function normalizeSignEntry(e, source) {
  // Handle Linear B MASTER format with LS-enhanced resolution
  if (e.ls_enhanced_resolution) {
    const lsr = e.ls_enhanced_resolution;
    const unicodeStr = e.unicode && typeof e.unicode === 'object'
      ? `${e.unicode.name || ''} (${e.unicode.codepoint || ''})` : (e.unicode || '');
    return {
      token: e.id || e.sign_id || e.glyph_id || '',
      gloss: lsr.function || e.name || e.label || e.meaning || '',
      pos: e.sign_type || 'sign',
      confidence: lsr.confidence || e.confidence || 0.8,
      source: `LS:${source}`,
      notes: `[DEFINITIVE] ${lsr.notes || e.notes || ''} vectors=${lsr.cross_script_vectors || ''}`.trim(),
      transliteration: lsr.phonetic_value || e.phonetic_value || e.reading || '',
      unicode: unicodeStr,
    };
  }

  // Standard syllabogram format
  if (e.standard_transliteration || e.transliteration_standard) {
    const unicodeStr = e.unicode && typeof e.unicode === 'object'
      ? `${e.unicode.name || ''} (${e.unicode.codepoint || ''})` : (e.unicode || e.glyph_pua || '');
    return {
      token: e.id || e.sign_id || e.glyph_id || '',
      gloss: e.name || e.label || e.meaning || e.gloss || '',
      pos: e.sign_type || 'sign',
      confidence: e.confidence || 0.8,
      source: source,
      notes: e.notes || '',
      transliteration: e.standard_transliteration || e.transliteration_standard || e.phonetic_value || e.reading || '',
      unicode: unicodeStr,
    };
  }

  // Fallback: basic sign entry
  const unicodeStr = e.unicode && typeof e.unicode === 'object'
    ? `${e.unicode.name || ''} (${e.unicode.codepoint || ''})` : (e.unicode || e.glyph_pua || '');
  return {
    token: e.id || e.sign_id || e.glyph_id || '',
    gloss: e.name || e.label || e.meaning || '',
    pos: e.sign_type || 'sign',
    confidence: e.confidence || 0.8,
    source: source,
    notes: e.notes || '',
    transliteration: e.phonetic_value || e.reading || '',
    unicode: unicodeStr,
  };
}

function normalizeCsvEntry(obj, headers, source) {
  // Auto-detect column meanings based on header names
  const token = obj.glyph_unicode || obj.glyph_id || obj.unicode_greek || obj.unicode ||
                obj.sign_id || obj.transliteration || '';
  const gloss = obj.english_gloss || obj.english || obj.translation || obj.meaning ||
                obj.logograph || '';
  const pos = obj.part_of_speech || obj.pos || obj.category || '';
  const translit = obj.transliteration || obj.latin_translit || obj.syllable || '';

  return {
    token,
    gloss,
    pos,
    confidence: parseFloat(obj.confidence) || 0.7,
    source: obj.provenance || obj.source || obj.example_inscription || obj.classical_sources || source,
    notes: obj.notes || '',
    transliteration: translit,
    script: inferScriptFromFilename(source),
  };
}

function extractGrammarEntries(data, source) {
  const entries = [];
  function walk(obj, prefix = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && value.length < 200) {
        entries.push({ token: prefix ? `${prefix}.${key}` : key, gloss: value, pos: 'grammar', confidence: 0.9, source, notes: '' });
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'object' && item.maya) {
            entries.push({ token: item.maya, gloss: item.english || item.literal || '', pos: 'grammar', confidence: 0.9, source: item.source || source, notes: item.transliteration || '' });
          }
        }
      } else if (typeof value === 'object') {
        walk(value, prefix ? `${prefix}.${key}` : key);
      }
    }
  }
  walk(data);
  return entries;
}

function inferScriptName(filename) {
  const name = basename(filename, extname(filename)).toLowerCase();

  // Ordered longest/most-specific keys first to avoid substring collisions
  const mappings = [
    ['chinese_classical', 'Classical Chinese'],
    ['classical_chinese', 'Classical Chinese'],
    ['cypro_minoan', 'Cypro-Minoan'],
    ['cretan_hieroglyphs', 'Cretan Hieroglyphs'],
    ['elder_futhark', 'Elder Futhark'],
    ['indus_valley', 'Indus Valley'],
    ['javanese_kawi', 'Javanese Kawi'],
    ['linear_elamite', 'Linear Elamite'],
    ['linear_a', 'Linear A'],
    ['linear_b', 'Linear B'],
    ['luwian_hieroglyphs', 'Luwian Hieroglyphs'],
    ['middle_persian', 'Middle Persian'],
    ['mycenaean_greek', 'Mycenaean Greek'],
    ['old_english', 'Old English'],
    ['old_norse_runic', 'Old Norse Runic'],
    ['old_norse', 'Old Norse Runic'],
    ['old_persian', 'Old Persian'],
    ['paleo_hebrew', 'Paleo-Hebrew'],
    ['proto_elamite', 'Proto-Elamite'],
    ['proto_sinaitic', 'Proto-Sinaitic'],
    ['rongorongo', 'Rongorongo'],
    ['akkadian', 'Akkadian'],
    ['amharic', 'Amharic'],
    ['arabic', 'Arabic'],
    ['aramaic', 'Imperial Aramaic'],
    ['armenian', 'Armenian'],
    ['avestan', 'Avestan'],
    ['brahmi', 'Brahmi'],
    ['burmese', 'Burmese'],
    ['byblos', 'Byblos Syllabary'],
    ['coptic', 'Coptic'],
    ['demotic', 'Demotic Egyptian'],
    ['dravidian', 'Dravidian'],
    ['elamite', 'Elamite'],
    ['etruscan', 'Etruscan'],
    ['gardiner', 'Egyptian Hieroglyphs'],
    ['geez', "Ge'ez"],
    ['georgian', 'Georgian'],
    ['glagolitic', 'Glagolitic'],
    ['gothic', 'Gothic'],
    ['greek', 'Ancient Greek'],
    ['hebrew', 'Hebrew'],
    ['hieratic', 'Hieratic'],
    ['hittite', 'Hittite'],
    ['indus', 'Indus Valley'],
    ['japanese', 'Japanese'],
    ['javanese', 'Javanese Kawi'],
    ['kannada', 'Kannada'],
    ['kharosthi', 'Kharoshthi'],
    ['khmer', 'Khmer'],
    ['korean', 'Korean'],
    ['luwian', 'Luwian Hieroglyphs'],
    ['malayalam', 'Malayalam'],
    ['maya', 'Maya'],
    ['meroitic', 'Meroitic'],
    ['musnad', 'Musnad (Ancient South Arabian)'],
    ['nabataean', 'Nabataean'],
    ['ogham', 'Ogham'],
    ['phaistos', 'Phaistos Disc'],
    ['phoenician', 'Phoenician'],
    ['sanskrit', 'Sanskrit'],
    ['sogdian', 'Sogdian'],
    ['sumerian', 'Sumerian'],
    ['syriac', 'Syriac'],
    ['tamil', 'Tamil'],
    ['tartaria', 'Tartaria'],
    ['telugu', 'Telugu'],
    ['thai', 'Thai'],
    ['tibetan', 'Tibetan'],
    ['tocharian', 'Tocharian'],
    ['ugaritic', 'Ugaritic'],
    ['vinca', 'Vinča'],
    ['voynich', 'Voynich Manuscript'],
  ];

  for (const [key, value] of mappings) {
    if (name.includes(key)) return value;
  }
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function inferScriptFromFilename(filename) {
  return inferScriptName(filename);
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export { parseJsonDataset, parseCsvDataset, inferScriptName };

/**
 * Seed all datasets into the system DB (idempotent — uses INSERT OR IGNORE).
 * Creates one script, one lexicon, and bulk-inserts entries per dataset file.
 * Returns counts of scripts/lexicons/entries inserted.
 */
import { createHash } from 'node:crypto';

export function seedDatasetsToDb(db, datasetsDir, logger) {
  const results = importAllDatasets(datasetsDir);
  let totalEntries = 0;
  let totalLexicons = 0;
  let totalScripts = 0;

  for (const dataset of results) {
    if (!dataset.entries || dataset.entries.length === 0) continue;

    const scriptId = dataset.script.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40);
    const now = Date.now();

    // Upsert script record
    try {
      db.system.prepare(
        'INSERT OR IGNORE INTO scripts (id, display, era, region, notes) VALUES (?,?,?,?,?)'
      ).run(scriptId, dataset.script, null, null, `Loaded from ${dataset.file}`);
      totalScripts++;
    } catch { /* ok */ }

    // Upsert lexicon record
    const lexiconId = `lex_${scriptId}`;
    try {
      db.system.prepare(
        'INSERT OR IGNORE INTO lexicons (id, script_id, name, created_at) VALUES (?,?,?,?)'
      ).run(lexiconId, scriptId, `${dataset.script} Lexicon`, now);
      totalLexicons++;
    } catch { /* ok */ }

    // Bulk-insert entries using a transaction for speed
    // INSERT OR REPLACE ensures higher-priority files (seeded later) overwrite lower-priority data
    const stmt = db.system.prepare(`
      INSERT OR REPLACE INTO lexicon_entries
        (id, lexicon_id, token, gloss, pos, confidence, source, notes, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);

    const insertMany = db.system.transaction((entries) => {
      for (const e of entries) {
        if (!e.token || !e.gloss) continue;
        try {
          // Deterministic ID from lexicon+token — makes re-seeding idempotent
          const entryId = createHash('sha256')
            .update(`${lexiconId}:${String(e.token)}`)
            .digest('hex')
            .slice(0, 26);
          stmt.run(
            entryId,
            lexiconId,
            String(e.token).slice(0, 500),
            String(e.gloss).slice(0, 1000),
            e.pos ? String(e.pos).slice(0, 50) : null,
            typeof e.confidence === 'number' ? e.confidence : 0.7,
            e.source ? String(e.source).slice(0, 500) : dataset.file,
            e.notes ? String(e.notes).slice(0, 500) : null,
            now, now,
          );
          totalEntries++;
        } catch { /* skip invalid entry */ }
      }
    });

    try {
      insertMany(dataset.entries);
    } catch (err) {
      if (logger) logger.warn({ err: err.message, file: dataset.file }, 'entry batch insert error');
    }
  }

  return { scripts: totalScripts, lexicons: totalLexicons, entries: totalEntries };
}
