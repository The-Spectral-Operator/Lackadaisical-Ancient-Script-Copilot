/**
 * Prepared-statement cache for system.db
 * Models, scripts, corpora, lexicons, settings, auth.
 */

export function createSystemDb(db) {
  return {
    // Settings
    settings: {
      get: db.prepare(`SELECT value FROM settings WHERE key=?`),
      set: db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)`),
      all: db.prepare(`SELECT key, value FROM settings`),
    },

    // Models
    models: {
      upsert: db.prepare(`
        INSERT OR REPLACE INTO models
          (name, digest, family, parameter_size, quantization, context_length,
           capabilities_json, template, parameters, last_seen_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `),
      get: db.prepare(`SELECT * FROM models WHERE name=?`),
      list: db.prepare(`SELECT * FROM models ORDER BY last_seen_at DESC`),
    },

    // Scripts
    scripts: {
      list: db.prepare(`SELECT * FROM scripts ORDER BY display`),
      get: db.prepare(`SELECT * FROM scripts WHERE id=?`),
      upsert: db.prepare(`
        INSERT OR REPLACE INTO scripts (id, display, era, region, notes)
        VALUES (?,?,?,?,?)
      `),
    },

    // Corpora
    corpora: {
      list: db.prepare(`SELECT * FROM corpora ORDER BY created_at DESC`),
      get: db.prepare(`SELECT * FROM corpora WHERE id=?`),
      create: db.prepare(`
        INSERT INTO corpora (id, script_id, name, source, created_at)
        VALUES (?,?,?,?,?)
      `),
    },

    // Inscriptions
    inscriptions: {
      listByCorpus: db.prepare(`
        SELECT * FROM inscriptions WHERE corpus_id=? ORDER BY reference
      `),
      countByCorpus: db.prepare(`
        SELECT COUNT(*) AS n FROM inscriptions WHERE corpus_id=?
      `),
      create: db.prepare(`
        INSERT INTO inscriptions
          (id, corpus_id, reference, transcription, raw_text, image_path, metadata_json, created_at)
        VALUES (?,?,?,?,?,?,?,?)
      `),
    },

    // Lexicons
    lexicons: {
      list: db.prepare(`
        SELECT l.*, COUNT(le.id) AS entry_count
        FROM lexicons l
        LEFT JOIN lexicon_entries le ON le.lexicon_id = l.id
        GROUP BY l.id
        ORDER BY l.created_at DESC
      `),
      get: db.prepare(`SELECT * FROM lexicons WHERE id=?`),
      create: db.prepare(`
        INSERT INTO lexicons (id, script_id, name, created_at)
        VALUES (?,?,?,?)
      `),
    },

    // Lexicon entries
    lexiconEntries: {
      list: db.prepare(`
        SELECT * FROM lexicon_entries WHERE lexicon_id=? ORDER BY token
      `),
      listPaginated: db.prepare(`
        SELECT * FROM lexicon_entries WHERE lexicon_id=?
        ORDER BY token LIMIT ? OFFSET ?
      `),
      lookup: db.prepare(`
        SELECT * FROM lexicon_entries WHERE lexicon_id=? AND token=?
        ORDER BY confidence DESC
      `),
      upsert: db.prepare(`
        INSERT OR REPLACE INTO lexicon_entries
          (id, lexicon_id, token, gloss, pos, confidence, source, notes, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `),
      remove: db.prepare(`DELETE FROM lexicon_entries WHERE id=?`),
      count: db.prepare(`SELECT COUNT(*) AS n FROM lexicon_entries WHERE lexicon_id=?`),
    },

    // Analysis runs
    analysisRuns: {
      create: db.prepare(`
        INSERT INTO analysis_runs
          (id, kind, corpus_id, inputs_json, results_json, duration_ms, created_at)
        VALUES (?,?,?,?,?,?,?)
      `),
      list: db.prepare(`
        SELECT * FROM analysis_runs
        WHERE corpus_id=? ORDER BY created_at DESC LIMIT 20
      `),
    },

    // Auth tokens
    auth: {
      getByHash: db.prepare(`SELECT * FROM auth_tokens WHERE token_hash=?`),
      create: db.prepare(`
        INSERT INTO auth_tokens (token_hash, label, created_at)
        VALUES (?,?,?)
      `),
      touch: db.prepare(`UPDATE auth_tokens SET last_used=? WHERE token_hash=?`),
      list: db.prepare(`SELECT id, label, created_at, last_used FROM auth_tokens`),
    },
  };
}
