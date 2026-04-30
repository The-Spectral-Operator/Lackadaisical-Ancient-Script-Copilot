import { parseBody } from '../middleware.js';
import { ulid } from '../../util/ids.js';

export function createCorpusRoute(db, config, logger) {
  return {
    list(_req, res) {
      try {
        const corpora = db.system.prepare('SELECT * FROM corpora ORDER BY created_at DESC').all();
        res.writeHead(200);
        res.end(JSON.stringify({ corpora }));
      } catch {
        res.writeHead(200);
        res.end(JSON.stringify({ corpora: [] }));
      }
    },

    async create(req, res) {
      const body = await parseBody(req);
      const id = ulid();
      const now = Date.now();
      try {
        db.system.prepare('INSERT INTO corpora (id, script_id, name, source, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(id, body.script_id || 'unknown', body.name || 'Untitled', body.source || '', now);
      } catch { /* ok */ }
      res.writeHead(201);
      res.end(JSON.stringify({ id, name: body.name }));
    },

    async importData(req, res, path) {
      const corpusId = path.split('/')[3];
      const body = await parseBody(req);
      let count = 0;
      if (Array.isArray(body)) {
        for (const inscr of body) {
          const id = ulid();
          const now = Date.now();
          try {
            db.system.prepare(`
              INSERT INTO inscriptions (id, corpus_id, reference, transcription, raw_text, metadata_json, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(id, corpusId, inscr.reference || '', inscr.transcription || '', inscr.raw_text || '', JSON.stringify(inscr.metadata || {}), now);
            count++;
          } catch { /* skip */ }
        }
      }
      res.writeHead(200);
      res.end(JSON.stringify({ imported: count }));
    },

    listScripts(_req, res) {
      try {
        const scripts = db.system.prepare('SELECT * FROM scripts ORDER BY display').all();
        res.writeHead(200);
        res.end(JSON.stringify({ scripts }));
      } catch {
        res.writeHead(200);
        res.end(JSON.stringify({ scripts: [] }));
      }
    },
  };
}
