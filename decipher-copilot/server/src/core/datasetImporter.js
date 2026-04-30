/**
 * Dataset importer: parses the various dataset file structures from the datasets/ folder.
 * Handles JSON with different schemas and CSV files, normalizing them into lexicon entries.
 * Also handles .zip files containing JSON datasets (unzips to same directory on import).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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
      if (!existsSync(jsonPath)) {
        try {
          execSync(`unzip -o "${join(datasetsDir, file)}" -d "${datasetsDir}"`, { stdio: 'pipe' });
        } catch { /* ignore unzip failures */ }
      }
    }
  }

  const files = readdirSync(datasetsDir).filter(f => f !== '.gitkeep');
  const results = [];

  for (const file of files) {
    const filePath = join(datasetsDir, file);
    const ext = extname(file).toLowerCase();
    const scriptName = inferScriptName(file);

    try {
      let entries;
      if (ext === '.json') {
        entries = parseJsonDataset(filePath, file);
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
  try {
    data = JSON.parse(raw);
  } catch {
    // Sanitize: escape unescaped control characters within string values
    raw = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ''); // remove non-printable control chars
    // Fix unescaped newlines/tabs inside JSON strings by replacing them
    raw = raw.replace(/(?<=":[\s]*"[^"]*)\n(?=[^"]*")/g, '\\n');
    raw = raw.replace(/,\s*([}\]])/g, '$1'); // remove trailing commas
    raw = raw.replace(/\/\/[^\n]*/g, ''); // remove single-line comments
    raw = raw.replace(/\/\*[\s\S]*?\*\//g, ''); // remove block comments
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
  else if (data._metadata || data.metadata) {
    const meta = data._metadata || data.metadata;
    for (const [key, value] of Object.entries(data)) {
      if (key === '_metadata' || key === 'metadata' || key === 'license' ||
          key === 'attribution' || key === 'project') continue;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        entries.push(normalizeObjectEntry(key, value, filename));
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
    token: e.token || e.sign_id || e.glyph_id || e.unicode || e.aramaic_unicode ||
           e.phoenician || e.transliteration || e.sign || e.id || '',
    gloss: e.gloss || e.translation || e.english_gloss || e.english || e.meaning ||
           e.definition || e.value || '',
    pos: e.pos || e.part_of_speech || e.category || e.type || '',
    confidence: e.confidence || e.certainty || 0.7,
    source: e.source || e.provenance || e.attestation || e.example_inscription || source,
    notes: e.notes || e.description || '',
    transliteration: e.transliteration || e.latin_translit || e.phoneme || '',
    root: e.root || '',
    script: e.script || inferScriptFromFilename(source),
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
  return {
    token: e.id || e.sign_id || e.glyph_id || '',
    gloss: e.name || e.label || e.meaning || '',
    pos: 'sign',
    confidence: e.confidence || 0.8,
    source: source,
    notes: e.notes || '',
    transliteration: e.phonetic_value || e.reading || '',
    unicode: e.unicode || e.glyph_pua || '',
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
  const mappings = {
    'aramaic': 'Imperial Aramaic',
    'brahmi': 'Brahmi',
    'coptic': 'Coptic',
    'demotic': 'Demotic Egyptian',
    'gardiner': 'Egyptian Hieroglyphs',
    'geez': "Ge'ez",
    'glagolitic': 'Glagolitic',
    'gothic': 'Gothic',
    'greek': 'Ancient Greek',
    'hieratic': 'Hieratic',
    'indus': 'Indus Valley',
    'japanese': 'Japanese',
    'kannada': 'Kannada',
    'akkadian': 'Akkadian',
    'linear_a': 'Linear A',
    'linear_b': 'Linear B',
    'linear_elamite': 'Linear Elamite',
    'malayalam': 'Malayalam',
    'maya': 'Maya',
    'meroitic': 'Meroitic',
    'musnad': 'Musnad (Ancient South Arabian)',
    'paleo_hebrew': 'Paleo-Hebrew',
    'phaistos': 'Phaistos Disc',
    'phoenician': 'Phoenician',
    'proto_elamite': 'Proto-Elamite',
    'proto_sinaitic': 'Proto-Sinaitic',
    'sumerian': 'Sumerian',
    'tamil': 'Tamil',
    'tartaria': 'Tartaria',
    'telugu': 'Telugu',
    'ugaritic': 'Ugaritic',
    'voynich': 'Voynich Manuscript',
    'byblos': 'Byblos Syllabary',
    'vinca': 'Vinča',
    'cretan': 'Cretan Hieroglyphs',
    'cypro_minoan': 'Cypro-Minoan',
    'dravidian': 'Dravidian',
  };

  for (const [key, value] of Object.entries(mappings)) {
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
    const stmt = db.system.prepare(`
      INSERT OR IGNORE INTO lexicon_entries
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
