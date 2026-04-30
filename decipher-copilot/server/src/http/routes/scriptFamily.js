/**
 * Script Family & Region Organization API
 * Organizes scripts by language family, geographic region, era, and writing type.
 * Provides hierarchical browsing and filtering.
 *
 * GET  /api/scripts/families     - List all script families
 * GET  /api/scripts/organized    - Get scripts organized by family/region
 * POST /api/scripts/families     - Create a script family
 * GET  /api/scripts/stats        - Real-time statistics for all scripts
 */
import { parseBody } from '../middleware.js';
import { ulid } from '../../util/ids.js';

// Predefined script family tree covering all datasets in the repository
const DEFAULT_FAMILIES = [
  { id: 'semitic', name: 'Semitic Scripts', region: 'Near East', era_start: '-3000', era_end: 'present', description: 'Scripts derived from or related to Proto-Sinaitic/Phoenician' },
  { id: 'aegean', name: 'Aegean Scripts', region: 'Eastern Mediterranean', era_start: '-2000', era_end: '-1100', description: 'Bronze Age scripts of Crete and mainland Greece' },
  { id: 'indic', name: 'Indic Scripts', region: 'South Asia', era_start: '-2600', era_end: 'present', description: 'Scripts of the Indian subcontinent including Brahmi derivatives' },
  { id: 'east_asian', name: 'East Asian Scripts', region: 'East Asia', era_start: '-1200', era_end: 'present', description: 'Chinese-derived and independent East Asian writing systems' },
  { id: 'iranian', name: 'Iranian Scripts', region: 'Iran/Central Asia', era_start: '-2500', era_end: '700', description: 'Ancient and medieval Iranian writing systems' },
  { id: 'anatolian', name: 'Anatolian Scripts', region: 'Anatolia', era_start: '-1600', era_end: '-700', description: 'Hittite and Luwian hieroglyphs' },
  { id: 'northeast_african', name: 'Northeast African Scripts', region: 'North/East Africa', era_start: '-3200', era_end: 'present', description: 'Egyptian, Meroitic, and Ethiopic writing systems' },
  { id: 'european', name: 'European Scripts', region: 'Europe', era_start: '-700', era_end: 'present', description: 'Greek, Latin, Runic, and other European systems' },
  { id: 'mesoamerican', name: 'Mesoamerican Scripts', region: 'Central America', era_start: '-600', era_end: '1500', description: 'Maya and related writing systems' },
  { id: 'southeast_asian', name: 'Southeast Asian Scripts', region: 'Southeast Asia', era_start: '200', era_end: 'present', description: 'Scripts of mainland and insular Southeast Asia' },
  { id: 'undeciphered', name: 'Undeciphered Scripts', region: 'Various', era_start: '-5500', era_end: '-1000', description: 'Scripts not yet fully deciphered' },
  { id: 'isolates', name: 'Isolates & Unique', region: 'Various', era_start: '-5500', era_end: 'present', description: 'Scripts with no clear genetic relationship' },
];

// Map dataset filenames to script families and metadata
const SCRIPT_REGISTRY = [
  { id: 'proto_sinaitic', display: 'Proto-Sinaitic', family_id: 'semitic', region: 'Sinai', writing_type: 'alphabet', status: 'partially_deciphered' },
  { id: 'phoenician', display: 'Phoenician', family_id: 'semitic', region: 'Levant', writing_type: 'abjad', status: 'deciphered' },
  { id: 'hebrew', display: 'Hebrew', family_id: 'semitic', region: 'Levant', writing_type: 'abjad', status: 'deciphered' },
  { id: 'paleo_hebrew', display: 'Paleo-Hebrew', family_id: 'semitic', region: 'Levant', writing_type: 'abjad', status: 'deciphered' },
  { id: 'aramaic', display: 'Aramaic', family_id: 'semitic', region: 'Near East', writing_type: 'abjad', status: 'deciphered' },
  { id: 'arabic', display: 'Arabic', family_id: 'semitic', region: 'Arabia', writing_type: 'abjad', status: 'deciphered' },
  { id: 'nabataean', display: 'Nabataean', family_id: 'semitic', region: 'Petra', writing_type: 'abjad', status: 'deciphered' },
  { id: 'syriac', display: 'Syriac', family_id: 'semitic', region: 'Near East', writing_type: 'abjad', status: 'deciphered' },
  { id: 'ugaritic', display: 'Ugaritic', family_id: 'semitic', region: 'Syria', writing_type: 'abjad', status: 'deciphered' },
  { id: 'musnad', display: 'Musnad (South Arabian)', family_id: 'semitic', region: 'Yemen', writing_type: 'abjad', status: 'deciphered' },
  { id: 'byblos', display: 'Byblos Syllabary', family_id: 'semitic', region: 'Levant', writing_type: 'syllabary', status: 'undeciphered' },
  { id: 'linear_a', display: 'Linear A', family_id: 'aegean', region: 'Crete', writing_type: 'syllabary', status: 'undeciphered' },
  { id: 'linear_b', display: 'Linear B', family_id: 'aegean', region: 'Crete/Greece', writing_type: 'syllabary', status: 'deciphered' },
  { id: 'cretan_hieroglyphs', display: 'Cretan Hieroglyphs', family_id: 'aegean', region: 'Crete', writing_type: 'hieroglyphic', status: 'undeciphered' },
  { id: 'cypro_minoan', display: 'Cypro-Minoan', family_id: 'aegean', region: 'Cyprus', writing_type: 'syllabary', status: 'undeciphered' },
  { id: 'phaistos_disc', display: 'Phaistos Disc', family_id: 'aegean', region: 'Crete', writing_type: 'unknown', status: 'undeciphered' },
  { id: 'mycenaean_greek', display: 'Mycenaean Greek', family_id: 'aegean', region: 'Greece', writing_type: 'syllabary', status: 'deciphered' },
  { id: 'indus_valley', display: 'Indus Valley', family_id: 'indic', region: 'South Asia', writing_type: 'logosyllabic', status: 'undeciphered' },
  { id: 'brahmi', display: 'Brahmi', family_id: 'indic', region: 'India', writing_type: 'abugida', status: 'deciphered' },
  { id: 'sanskrit', display: 'Sanskrit', family_id: 'indic', region: 'India', writing_type: 'abugida', status: 'deciphered' },
  { id: 'tamil', display: 'Tamil', family_id: 'indic', region: 'South India', writing_type: 'abugida', status: 'deciphered' },
  { id: 'telugu', display: 'Telugu', family_id: 'indic', region: 'South India', writing_type: 'abugida', status: 'deciphered' },
  { id: 'kannada', display: 'Kannada', family_id: 'indic', region: 'South India', writing_type: 'abugida', status: 'deciphered' },
  { id: 'malayalam', display: 'Malayalam', family_id: 'indic', region: 'South India', writing_type: 'abugida', status: 'deciphered' },
  { id: 'tibetan', display: 'Tibetan', family_id: 'indic', region: 'Tibet', writing_type: 'abugida', status: 'deciphered' },
  { id: 'chinese_classical', display: 'Classical Chinese', family_id: 'east_asian', region: 'China', writing_type: 'logographic', status: 'deciphered' },
  { id: 'japanese', display: 'Japanese', family_id: 'east_asian', region: 'Japan', writing_type: 'mixed', status: 'deciphered' },
  { id: 'korean', display: 'Korean', family_id: 'east_asian', region: 'Korea', writing_type: 'alphabetic_syllabary', status: 'deciphered' },
  { id: 'old_persian', display: 'Old Persian', family_id: 'iranian', region: 'Persia', writing_type: 'syllabary', status: 'deciphered' },
  { id: 'middle_persian', display: 'Middle Persian', family_id: 'iranian', region: 'Persia', writing_type: 'abjad', status: 'deciphered' },
  { id: 'avestan', display: 'Avestan', family_id: 'iranian', region: 'Persia', writing_type: 'alphabet', status: 'deciphered' },
  { id: 'sogdian', display: 'Sogdian', family_id: 'iranian', region: 'Central Asia', writing_type: 'abjad', status: 'deciphered' },
  { id: 'proto_elamite', display: 'Proto-Elamite', family_id: 'iranian', region: 'Iran', writing_type: 'logosyllabic', status: 'undeciphered' },
  { id: 'linear_elamite', display: 'Linear Elamite', family_id: 'iranian', region: 'Iran', writing_type: 'syllabary', status: 'partially_deciphered' },
  { id: 'elamite', display: 'Elamite Cuneiform', family_id: 'iranian', region: 'Iran', writing_type: 'cuneiform', status: 'deciphered' },
  { id: 'hittite', display: 'Hittite Cuneiform', family_id: 'anatolian', region: 'Anatolia', writing_type: 'cuneiform', status: 'deciphered' },
  { id: 'luwian_hieroglyphs', display: 'Luwian Hieroglyphs', family_id: 'anatolian', region: 'Anatolia', writing_type: 'hieroglyphic', status: 'deciphered' },
  { id: 'egyptian_hieroglyphs', display: 'Egyptian Hieroglyphs', family_id: 'northeast_african', region: 'Egypt', writing_type: 'logosyllabic', status: 'deciphered' },
  { id: 'hieratic', display: 'Hieratic', family_id: 'northeast_african', region: 'Egypt', writing_type: 'cursive', status: 'deciphered' },
  { id: 'demotic', display: 'Demotic', family_id: 'northeast_african', region: 'Egypt', writing_type: 'cursive', status: 'deciphered' },
  { id: 'coptic', display: 'Coptic', family_id: 'northeast_african', region: 'Egypt', writing_type: 'alphabet', status: 'deciphered' },
  { id: 'meroitic', display: 'Meroitic', family_id: 'northeast_african', region: 'Nubia', writing_type: 'abugida', status: 'partially_deciphered' },
  { id: 'geez', display: "Ge'ez", family_id: 'northeast_african', region: 'Ethiopia', writing_type: 'abugida', status: 'deciphered' },
  { id: 'amharic', display: 'Amharic', family_id: 'northeast_african', region: 'Ethiopia', writing_type: 'abugida', status: 'deciphered' },
  { id: 'greek', display: 'Ancient Greek', family_id: 'european', region: 'Greece', writing_type: 'alphabet', status: 'deciphered' },
  { id: 'latin', display: 'Latin', family_id: 'european', region: 'Italy', writing_type: 'alphabet', status: 'deciphered' },
  { id: 'etruscan', display: 'Etruscan', family_id: 'european', region: 'Italy', writing_type: 'alphabet', status: 'partially_deciphered' },
  { id: 'gothic', display: 'Gothic', family_id: 'european', region: 'Eastern Europe', writing_type: 'alphabet', status: 'deciphered' },
  { id: 'glagolitic', display: 'Glagolitic', family_id: 'european', region: 'Balkans', writing_type: 'alphabet', status: 'deciphered' },
  { id: 'old_norse_runic', display: 'Old Norse Runic', family_id: 'european', region: 'Scandinavia', writing_type: 'alphabet', status: 'deciphered' },
  { id: 'old_english', display: 'Old English', family_id: 'european', region: 'Britain', writing_type: 'alphabet', status: 'deciphered' },
  { id: 'armenian', display: 'Armenian', family_id: 'european', region: 'Caucasus', writing_type: 'alphabet', status: 'deciphered' },
  { id: 'georgian', display: 'Georgian', family_id: 'european', region: 'Caucasus', writing_type: 'alphabet', status: 'deciphered' },
  { id: 'maya', display: 'Maya Hieroglyphs', family_id: 'mesoamerican', region: 'Mesoamerica', writing_type: 'logosyllabic', status: 'deciphered' },
  { id: 'thai', display: 'Thai', family_id: 'southeast_asian', region: 'Thailand', writing_type: 'abugida', status: 'deciphered' },
  { id: 'khmer', display: 'Khmer', family_id: 'southeast_asian', region: 'Cambodia', writing_type: 'abugida', status: 'deciphered' },
  { id: 'burmese', display: 'Burmese', family_id: 'southeast_asian', region: 'Myanmar', writing_type: 'abugida', status: 'deciphered' },
  { id: 'javanese_kawi', display: 'Javanese Kawi', family_id: 'southeast_asian', region: 'Java', writing_type: 'abugida', status: 'deciphered' },
  { id: 'sumerian', display: 'Sumerian Cuneiform', family_id: 'isolates', region: 'Mesopotamia', writing_type: 'logosyllabic', status: 'deciphered' },
  { id: 'akkadian', display: 'Akkadian Cuneiform', family_id: 'semitic', region: 'Mesopotamia', writing_type: 'syllabary', status: 'deciphered' },
  { id: 'tocharian', display: 'Tocharian', family_id: 'isolates', region: 'Central Asia', writing_type: 'abugida', status: 'deciphered' },
  { id: 'voynich', display: 'Voynich Manuscript', family_id: 'undeciphered', region: 'Unknown', writing_type: 'unknown', status: 'undeciphered' },
  { id: 'tartaria', display: 'Tartaria Tablets', family_id: 'undeciphered', region: 'Balkans', writing_type: 'unknown', status: 'undeciphered' },
  { id: 'vinca', display: 'Vinča Symbols', family_id: 'undeciphered', region: 'Balkans', writing_type: 'proto_writing', status: 'undeciphered' },
];

export function createScriptFamilyRoute(db, config, logger) {
  // Seed families and scripts on init
  seedFamiliesAndScripts(db, logger);

  return {
    /**
     * GET /api/scripts/families
     */
    families(_req, res) {
      try {
        const families = db.system.prepare('SELECT * FROM script_families ORDER BY name').all();
        res.writeHead(200);
        res.end(JSON.stringify({ families }));
      } catch {
        res.writeHead(200);
        res.end(JSON.stringify({ families: DEFAULT_FAMILIES }));
      }
    },

    /**
     * GET /api/scripts/organized
     * Returns scripts organized by family and region with stats.
     */
    organized(_req, res) {
      try {
        const families = db.system.prepare('SELECT * FROM script_families ORDER BY name').all();
        const scripts = db.system.prepare('SELECT * FROM scripts ORDER BY display').all();

        // Group scripts by family
        const organized = families.map(f => ({
          ...f,
          scripts: scripts.filter(s => s.family_id === f.id).map(s => ({
            id: s.id,
            display: s.display,
            region: s.region,
            era: s.era,
            writing_type: s.writing_type,
            status: s.status,
          })),
        }));

        // Add ungrouped scripts
        const groupedIds = new Set(scripts.filter(s => s.family_id).map(s => s.id));
        const ungrouped = scripts.filter(s => !groupedIds.has(s.id));
        if (ungrouped.length > 0) {
          organized.push({
            id: 'ungrouped',
            name: 'Ungrouped',
            region: 'Various',
            scripts: ungrouped.map(s => ({ id: s.id, display: s.display, region: s.region, era: s.era })),
          });
        }

        res.writeHead(200);
        res.end(JSON.stringify({ organized }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    /**
     * POST /api/scripts/families
     */
    async createFamily(req, res) {
      const body = await parseBody(req);
      const id = body.id || ulid();
      const now = Date.now();
      try {
        db.system.prepare(`
          INSERT OR REPLACE INTO script_families (id, name, parent_id, region, era_start, era_end, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, body.name, body.parent_id || null, body.region || null, body.era_start || null, body.era_end || null, body.description || null, now);
        res.writeHead(201);
        res.end(JSON.stringify({ id, name: body.name }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    /**
     * GET /api/scripts/stats
     * Returns real-time statistics for all scripts: entry counts, corpus sizes, analysis coverage.
     */
    stats(_req, res) {
      try {
        const scripts = db.system.prepare('SELECT * FROM scripts ORDER BY display').all();
        const stats = scripts.map(s => {
          let lexiconCount = 0;
          let entryCount = 0;
          let corpusCount = 0;
          let inscriptionCount = 0;

          try {
            const lc = db.system.prepare('SELECT COUNT(*) as n FROM lexicons WHERE script_id = ?').get(s.id);
            lexiconCount = lc?.n || 0;
          } catch {}
          try {
            const ec = db.system.prepare('SELECT COUNT(*) as n FROM lexicon_entries WHERE lexicon_id IN (SELECT id FROM lexicons WHERE script_id = ?)').get(s.id);
            entryCount = ec?.n || 0;
          } catch {}
          try {
            const cc = db.system.prepare('SELECT COUNT(*) as n FROM corpora WHERE script_id = ?').get(s.id);
            corpusCount = cc?.n || 0;
          } catch {}
          try {
            const ic = db.system.prepare('SELECT COUNT(*) as n FROM inscriptions WHERE corpus_id IN (SELECT id FROM corpora WHERE script_id = ?)').get(s.id);
            inscriptionCount = ic?.n || 0;
          } catch {}

          return {
            script_id: s.id,
            display: s.display,
            family_id: s.family_id,
            region: s.region,
            writing_type: s.writing_type,
            status: s.status,
            lexicon_count: lexiconCount,
            entry_count: entryCount,
            corpus_count: corpusCount,
            inscription_count: inscriptionCount,
          };
        });

        const totals = {
          total_scripts: stats.length,
          total_lexicons: stats.reduce((s, x) => s + x.lexicon_count, 0),
          total_entries: stats.reduce((s, x) => s + x.entry_count, 0),
          total_corpora: stats.reduce((s, x) => s + x.corpus_count, 0),
          total_inscriptions: stats.reduce((s, x) => s + x.inscription_count, 0),
          deciphered: stats.filter(s => s.status === 'deciphered').length,
          undeciphered: stats.filter(s => s.status === 'undeciphered').length,
          partially_deciphered: stats.filter(s => s.status === 'partially_deciphered').length,
        };

        res.writeHead(200);
        res.end(JSON.stringify({ totals, scripts: stats }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    },
  };
}

function seedFamiliesAndScripts(db, logger) {
  try {
    // Ensure table exists
    db.system.exec(`
      CREATE TABLE IF NOT EXISTS script_families (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT, region TEXT,
        era_start TEXT, era_end TEXT, description TEXT, created_at INTEGER NOT NULL
      );
    `);

    // Try adding columns (may already exist)
    try { db.system.exec('ALTER TABLE scripts ADD COLUMN family_id TEXT'); } catch {}
    try { db.system.exec('ALTER TABLE scripts ADD COLUMN writing_type TEXT'); } catch {}
    try { db.system.exec('ALTER TABLE scripts ADD COLUMN status TEXT DEFAULT \'undeciphered\''); } catch {}

    const now = Date.now();

    // Seed families
    const upsertFamily = db.system.prepare(
      'INSERT OR REPLACE INTO script_families (id, name, parent_id, region, era_start, era_end, description, created_at) VALUES (?,?,?,?,?,?,?,?)'
    );
    for (const f of DEFAULT_FAMILIES) {
      upsertFamily.run(f.id, f.name, null, f.region, f.era_start, f.era_end, f.description, now);
    }

    // Seed scripts with family info
    const upsertScript = db.system.prepare(
      'INSERT OR REPLACE INTO scripts (id, display, era, region, notes, family_id, writing_type, status) VALUES (?,?,?,?,?,?,?,?)'
    );
    for (const s of SCRIPT_REGISTRY) {
      upsertScript.run(s.id, s.display, null, s.region, null, s.family_id, s.writing_type, s.status);
    }

    logger.info({ families: DEFAULT_FAMILIES.length, scripts: SCRIPT_REGISTRY.length }, 'script families seeded');
  } catch (err) {
    logger.warn({ err: err.message }, 'script family seed warning (non-fatal)');
  }
}
