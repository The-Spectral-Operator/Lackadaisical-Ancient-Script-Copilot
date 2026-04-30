/**
 * Tool: lexicon_lookup
 * Looks up a space-separated sign-id token in the active lexicon database.
 * Returns all matching entries with glosses, POS tags, confidence levels, and sources.
 */

/**
 * @param {object} db - Database handles { conversations, system }
 * @param {object} args - { lexicon_id?: string, token: string }
 * @returns {object} result JSON
 */
export function lexiconLookup(db, args) {
  const { lexicon_id, token } = args;
  if (!token || typeof token !== 'string') {
    return { error: 'token is required', entries: [] };
  }

  const normalizedToken = token.trim();

  try {
    let entries;
    if (lexicon_id) {
      entries = db.system.prepare(`
        SELECT le.id, le.lexicon_id, le.token, le.gloss, le.pos, le.confidence,
               le.source, le.notes, le.created_at, le.updated_at,
               l.name AS lexicon_name, l.script_id
        FROM lexicon_entries le
        JOIN lexicons l ON l.id = le.lexicon_id
        WHERE le.lexicon_id = ? AND le.token = ?
        ORDER BY le.confidence DESC
        LIMIT 50
      `).all(lexicon_id, normalizedToken);
    } else {
      // Search across all lexicons
      entries = db.system.prepare(`
        SELECT le.id, le.lexicon_id, le.token, le.gloss, le.pos, le.confidence,
               le.source, le.notes, le.created_at, le.updated_at,
               l.name AS lexicon_name, l.script_id
        FROM lexicon_entries le
        JOIN lexicons l ON l.id = le.lexicon_id
        WHERE le.token = ?
        ORDER BY le.confidence DESC
        LIMIT 50
      `).all(normalizedToken);
    }

    // Also try fuzzy: if no exact match, try LIKE prefix
    if (entries.length === 0) {
      const fuzzyQuery = lexicon_id
        ? db.system.prepare(`
            SELECT le.id, le.lexicon_id, le.token, le.gloss, le.pos, le.confidence,
                   le.source, le.notes, l.name AS lexicon_name, l.script_id
            FROM lexicon_entries le
            JOIN lexicons l ON l.id = le.lexicon_id
            WHERE le.lexicon_id = ? AND le.token LIKE ?
            ORDER BY le.confidence DESC LIMIT 20
          `).all(lexicon_id, `${normalizedToken}%`)
        : db.system.prepare(`
            SELECT le.id, le.lexicon_id, le.token, le.gloss, le.pos, le.confidence,
                   le.source, le.notes, l.name AS lexicon_name, l.script_id
            FROM lexicon_entries le
            JOIN lexicons l ON l.id = le.lexicon_id
            WHERE le.token LIKE ?
            ORDER BY le.confidence DESC LIMIT 20
          `).all(`${normalizedToken}%`);
      return {
        token: normalizedToken,
        exact: false,
        count: fuzzyQuery.length,
        entries: fuzzyQuery,
      };
    }

    return {
      token: normalizedToken,
      exact: true,
      count: entries.length,
      entries,
    };
  } catch (err) {
    return { error: err.message, token: normalizedToken, entries: [] };
  }
}
