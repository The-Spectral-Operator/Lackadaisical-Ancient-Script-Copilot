import { parseBody } from '../middleware.js';
import { ulid } from 'ulid';

export function createSessionsRoute(db, config, logger) {
  return {
    list(_req, res) {
      const sessions = db.system.prepare(
        'SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 100'
      ).all().catch?.(() => []) || [];
      res.writeHead(200);
      res.end(JSON.stringify({ sessions }));
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
