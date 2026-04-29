import { parseBody } from '../middleware.js';
import { ulid } from 'ulid';

export function createMessagesRoute(db, config, logger) {
  return {
    list(_req, res, path) {
      const sessionId = path.split('/')[3];
      try {
        const messages = db.conversations.prepare(
          'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC'
        ).all(sessionId);
        res.writeHead(200);
        res.end(JSON.stringify({ messages }));
      } catch {
        res.writeHead(200);
        res.end(JSON.stringify({ messages: [] }));
      }
    },

    async create(req, res, path) {
      const sessionId = path.split('/')[3];
      const body = await parseBody(req);
      const id = ulid();
      const now = Date.now();

      const message = {
        id,
        session_id: sessionId,
        role: body.role || 'user',
        content: body.content || '',
        thinking: null,
        created_at: now,
      };

      try {
        db.conversations.prepare(`
          INSERT INTO messages (id, session_id, role, content, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(message.id, message.session_id, message.role, message.content, message.created_at);
      } catch { /* ok */ }

      res.writeHead(201);
      res.end(JSON.stringify(message));
    },
  };
}
