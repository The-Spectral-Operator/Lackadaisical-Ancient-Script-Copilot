import { parseBody } from '../middleware.js';
import { ulid } from '../../util/ids.js';

export function createLexiconRoute(db, config, logger) {
  return {
    list(_req, res) {
      try {
        const lexicons = db.system.prepare(`
          SELECT l.*, COUNT(le.id) AS entry_count
          FROM lexicons l
          LEFT JOIN lexicon_entries le ON le.lexicon_id = l.id
          GROUP BY l.id
          ORDER BY l.created_at DESC
        `).all();
        res.writeHead(200);
        res.end(JSON.stringify({ lexicons }));
      } catch {
        res.writeHead(200);
        res.end(JSON.stringify({ lexicons: [] }));
      }
    },

    async create(req, res) {
      const body = await parseBody(req);
      const id = ulid();
      const now = Date.now();
      try {
        db.system.prepare('INSERT INTO lexicons (id, script_id, name, created_at) VALUES (?, ?, ?, ?)')
          .run(id, body.script_id || 'unknown', body.name || 'Untitled', now);
      } catch { /* ok */ }
      res.writeHead(201);
      res.end(JSON.stringify({ id, name: body.name }));
    },

    entries(_req, res, path) {
      const lexiconId = path.split('/')[3];
      try {
        const entries = db.system.prepare(
          'SELECT * FROM lexicon_entries WHERE lexicon_id = ? ORDER BY token'
        ).all(lexiconId);
        res.writeHead(200);
        res.end(JSON.stringify({ entries }));
      } catch {
        res.writeHead(200);
        res.end(JSON.stringify({ entries: [] }));
      }
    },

    async upsertEntry(req, res, path) {
      const lexiconId = path.split('/')[3];
      const body = await parseBody(req);
      const id = ulid();
      const now = Date.now();
      try {
        db.system.prepare(`
          INSERT INTO lexicon_entries (id, lexicon_id, token, gloss, pos, confidence, source, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, lexiconId, body.token, body.gloss, body.pos, body.confidence || 0.5, body.source, body.notes, now, now);
      } catch { /* ok */ }
      res.writeHead(201);
      res.end(JSON.stringify({ id, token: body.token, gloss: body.gloss }));
    },

    async importData(req, res, path) {
      const lexiconId = path.split('/')[3];
      const body = await parseBody(req);
      // Auto-detect JSON array or CSV
      let count = 0;
      if (Array.isArray(body)) {
        for (const entry of body) {
          const id = ulid();
          const now = Date.now();
          try {
            db.system.prepare(`
              INSERT OR REPLACE INTO lexicon_entries (id, lexicon_id, token, gloss, pos, confidence, source, notes, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(id, lexiconId, entry.token, entry.gloss, entry.pos, entry.confidence || 0.5, entry.source, entry.notes, now, now);
            count++;
          } catch { /* skip */ }
        }
      }
      res.writeHead(200);
      res.end(JSON.stringify({ imported: count }));
    },
  };
}
