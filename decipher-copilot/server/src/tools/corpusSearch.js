/**
 * Tool: corpus_search
 * Full-text or regex search over inscriptions in a corpus.
 * Uses FTS5 virtual table for full-text, or REGEXP via SQLite3 for regex.
 */

/**
 * @param {object} db - Database handles
 * @param {object} args - { corpus_id?: string, query: string, mode?: 'fts'|'regex' }
 * @returns {object} result JSON
 */
export function corpusSearch(db, args) {
  const { corpus_id, query, mode = 'fts' } = args;
  if (!query || typeof query !== 'string') {
    return { error: 'query is required', results: [] };
  }

  try {
    let results;

    if (mode === 'fts') {
      // FTS5 search
      if (corpus_id) {
        results = db.system.prepare(`
          SELECT i.id, i.corpus_id, i.reference, i.transcription, i.raw_text,
                 i.metadata_json, i.created_at,
                 snippet(inscriptions_fts, 0, '[', ']', '...', 20) AS snippet
          FROM inscriptions_fts
          JOIN inscriptions i ON i.rowid = inscriptions_fts.rowid
          WHERE inscriptions_fts MATCH ? AND i.corpus_id = ?
          ORDER BY rank
          LIMIT 50
        `).all(query, corpus_id);
      } else {
        results = db.system.prepare(`
          SELECT i.id, i.corpus_id, i.reference, i.transcription, i.raw_text,
                 i.metadata_json, i.created_at,
                 snippet(inscriptions_fts, 0, '[', ']', '...', 20) AS snippet
          FROM inscriptions_fts
          JOIN inscriptions i ON i.rowid = inscriptions_fts.rowid
          WHERE inscriptions_fts MATCH ?
          ORDER BY rank
          LIMIT 50
        `).all(query);
      }
    } else {
      // Regex-like (SQLite3 LIKE approximation — no native REGEXP without extension)
      // Use LIKE with % wildcards as fallback
      const likePattern = `%${query.replace(/\*/g, '%').replace(/\?/g, '_')}%`;
      if (corpus_id) {
        results = db.system.prepare(`
          SELECT i.id, i.corpus_id, i.reference, i.transcription, i.raw_text,
                 i.metadata_json, i.created_at
          FROM inscriptions i
          WHERE i.corpus_id = ?
            AND (i.transcription LIKE ? OR i.raw_text LIKE ? OR i.reference LIKE ?)
          LIMIT 50
        `).all(corpus_id, likePattern, likePattern, likePattern);
      } else {
        results = db.system.prepare(`
          SELECT i.id, i.corpus_id, i.reference, i.transcription, i.raw_text,
                 i.metadata_json, i.created_at
          FROM inscriptions i
          WHERE i.transcription LIKE ? OR i.raw_text LIKE ? OR i.reference LIKE ?
          LIMIT 50
        `).all(likePattern, likePattern, likePattern);
      }
    }

    return {
      query,
      mode,
      corpus_id: corpus_id || 'all',
      count: results.length,
      results,
    };
  } catch (err) {
    // FTS5 syntax error — fall back to LIKE
    if (mode === 'fts' && err.message.includes('fts5')) {
      return corpusSearch(db, { corpus_id, query, mode: 'regex' });
    }
    return { error: err.message, query, results: [] };
  }
}
