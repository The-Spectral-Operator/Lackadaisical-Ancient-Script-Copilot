import { parseBody } from '../middleware.js';
import { ulid } from '../../util/ids.js';

export function createSessionsRoute(db, config, logger) {
  return {
    list(_req, res) {
      let sessions = [];
      try {
        sessions = db.conversations.prepare(
          'SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 100'
        ).all();
      } catch { /* db not ready */ }
      res.writeHead(200);
      res.end(JSON.stringify({ sessions }));
    },

    /**
     * GET /api/sessions/search?q=<term>
     * Searches session titles and message content for the query term.
     * Returns matching sessions with preview snippets and match counts.
     */
    search(req, res) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const query = (url.searchParams.get('q') || '').trim();

      if (!query || query.length < 2) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results: [], query }));
        return;
      }

      try {
        const searchTerm = `%${query}%`;

        // Search sessions by title
        const titleMatches = db.conversations.prepare(`
          SELECT s.id, s.title, s.model, s.script, s.created_at, s.updated_at,
                 'title' AS match_type, s.title AS snippet
          FROM sessions s
          WHERE s.title LIKE ?
          ORDER BY s.updated_at DESC LIMIT 20
        `).all(searchTerm);

        // Search messages by content
        const messageMatches = db.conversations.prepare(`
          SELECT m.session_id, s.title, s.model, s.script, s.created_at, s.updated_at,
                 m.role AS match_type, SUBSTR(m.content, MAX(1, INSTR(LOWER(m.content), LOWER(?)) - 40), 120) AS snippet
          FROM messages m
          JOIN sessions s ON s.id = m.session_id
          WHERE m.content LIKE ?
          GROUP BY m.session_id
          ORDER BY s.updated_at DESC LIMIT 30
        `).all(query, searchTerm);

        // Also search lexicon entries in system DB
        let lexiconMatches = [];
        try {
          lexiconMatches = db.system.prepare(`
            SELECT le.token, le.gloss, le.pos, le.confidence, l.name AS lexicon_name, l.script_id
            FROM lexicon_entries le
            JOIN lexicons l ON l.id = le.lexicon_id
            WHERE le.token LIKE ? OR le.gloss LIKE ?
            ORDER BY le.confidence DESC LIMIT 20
          `).all(searchTerm, searchTerm);
        } catch { /* system db may not be ready */ }

        // Merge session results — deduplicate by session id
        const sessionMap = new Map();
        for (const m of titleMatches) {
          sessionMap.set(m.id, {
            id: m.id, title: m.title, model: m.model, script: m.script,
            created_at: m.created_at, updated_at: m.updated_at,
            match_type: 'title', snippet: m.snippet,
          });
        }
        for (const m of messageMatches) {
          if (!sessionMap.has(m.session_id)) {
            sessionMap.set(m.session_id, {
              id: m.session_id, title: m.title, model: m.model, script: m.script,
              created_at: m.created_at, updated_at: m.updated_at,
              match_type: 'message', snippet: m.snippet,
            });
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          query,
          sessions: [...sessionMap.values()],
          lexicon_entries: lexiconMatches,
          total: sessionMap.size + lexiconMatches.length,
        }));
      } catch (err) {
        logger.error({ err: err.message }, 'session search error');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results: [], query, error: err.message }));
      }
    },

    async create(req, res) {
      const body = await parseBody(req);
      const id = ulid();
      const now = Date.now();
      const session = {
        id,
        title: body.title || 'New Session',
        script: body.script || null,
        model: body.model || config.defaultModel,
        model_digest: '',
        system_prompt: body.system_prompt || null,
        options_json: JSON.stringify(body.options || config.modelOptions),
        created_at: now,
        updated_at: now,
        archived: 0,
      };

      try {
        db.conversations.prepare(`
          INSERT INTO sessions (id, title, script, model, model_digest, system_prompt, options_json, created_at, updated_at, archived)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(session.id, session.title, session.script, session.model, session.model_digest,
               session.system_prompt, session.options_json, session.created_at, session.updated_at, session.archived);
      } catch { /* db not ready yet in dev mode */ }

      res.writeHead(201);
      res.end(JSON.stringify(session));
    },

    get(_req, res, path) {
      const id = path.split('/').pop();
      try {
        const session = db.conversations.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
        if (!session) { res.writeHead(404); res.end(JSON.stringify({ error: 'not_found' })); return; }
        res.writeHead(200);
        res.end(JSON.stringify(session));
      } catch {
        res.writeHead(200);
        res.end(JSON.stringify({ id, title: 'Session', model: config.defaultModel }));
      }
    },

    async update(req, res, path) {
      const id = path.split('/').pop();
      const body = await parseBody(req);
      const now = Date.now();

      // Hotswap: model can be changed mid-session
      const updates = [];
      const params = [];
      if (body.title) { updates.push('title = ?'); params.push(body.title); }
      if (body.model) { updates.push('model = ?'); params.push(body.model); }
      if (body.script) { updates.push('script = ?'); params.push(body.script); }
      if (body.options) { updates.push('options_json = ?'); params.push(JSON.stringify(body.options)); }
      if (body.archived !== undefined) { updates.push('archived = ?'); params.push(body.archived ? 1 : 0); }
      updates.push('updated_at = ?'); params.push(now);
      params.push(id);

      try {
        db.conversations.prepare(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      } catch { /* ok */ }

      res.writeHead(200);
      res.end(JSON.stringify({ id, updated: true, model: body.model }));
    },

    remove(_req, res, path) {
      const id = path.split('/').pop();
      try {
        db.conversations.prepare('DELETE FROM sessions WHERE id = ?').run(id);
      } catch { /* ok */ }
      res.writeHead(200);
      res.end(JSON.stringify({ deleted: true }));
    },
  };
}
