import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { createHealthRoute } from './routes/health.js';
import { createModelsRoute } from './routes/models.js';
import { createChatRoute } from './routes/chat.js';
import { createSessionsRoute } from './routes/sessions.js';
import { createMessagesRoute } from './routes/messages.js';
import { createAttachmentsRoute } from './routes/attachments.js';
import { createLexiconRoute } from './routes/lexicon.js';
import { createCorpusRoute } from './routes/corpus.js';
import { createAnalysisRoute } from './routes/analysis.js';
import { createSettingsRoute } from './routes/settings.js';
import { applyMiddleware } from './middleware.js';
import { serveStatic } from './static.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.webmanifest': 'application/manifest+json',
};

export function createRouter(db, config, logger) {
  const routes = {
    health: createHealthRoute(db, config, logger),
    models: createModelsRoute(db, config, logger),
    chat: createChatRoute(db, config, logger),
    sessions: createSessionsRoute(db, config, logger),
    messages: createMessagesRoute(db, config, logger),
    attachments: createAttachmentsRoute(db, config, logger),
    lexicon: createLexiconRoute(db, config, logger),
    corpus: createCorpusRoute(db, config, logger),
    analysis: createAnalysisRoute(db, config, logger),
    settings: createSettingsRoute(db, config, logger),
  };

  return async (req, res) => {
    try {
      // Apply security middleware
      if (!applyMiddleware(req, res, config)) return;

      const url = new URL(req.url, `http://${req.headers.host}`);
      const path = url.pathname;
      const method = req.method;

      // API routes
      if (path.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');

        if (path === '/api/health' && method === 'GET') return routes.health(req, res);
        if (path === '/api/version' && method === 'GET') {
          res.end(JSON.stringify({ version: '1.0.0', model: config.defaultModel }));
          return;
        }

        // Models (hotswap support)
        if (path === '/api/models' && method === 'GET') return routes.models.list(req, res);
        if (path.match(/^\/api\/models\/[^/]+$/) && method === 'GET') return routes.models.show(req, res, path);
        if (path === '/api/models/pull' && method === 'POST') return routes.models.pull(req, res);
        if (path.match(/^\/api\/models\/[^/]+$/) && method === 'DELETE') return routes.models.remove(req, res, path);

        // Sessions
        if (path === '/api/sessions' && method === 'GET') return routes.sessions.list(req, res);
        if (path === '/api/sessions' && method === 'POST') return routes.sessions.create(req, res);
        if (path.match(/^\/api\/sessions\/[^/]+$/) && method === 'GET') return routes.sessions.get(req, res, path);
        if (path.match(/^\/api\/sessions\/[^/]+$/) && method === 'PATCH') return routes.sessions.update(req, res, path);
        if (path.match(/^\/api\/sessions\/[^/]+$/) && method === 'DELETE') return routes.sessions.remove(req, res, path);

        // Messages
        if (path.match(/^\/api\/sessions\/[^/]+\/messages$/) && method === 'GET') return routes.messages.list(req, res, path);
        if (path.match(/^\/api\/sessions\/[^/]+\/messages$/) && method === 'POST') return routes.messages.create(req, res, path);

        // Attachments
        if (path === '/api/attachments' && method === 'POST') return routes.attachments.upload(req, res);
        if (path.match(/^\/api\/attachments\/[^/]+$/) && method === 'GET') return routes.attachments.get(req, res, path);

        // Lexicon
        if (path.match(/^\/api\/lexicons(\?.*)?$/) && method === 'GET') return routes.lexicon.list(req, res);
        if (path === '/api/lexicons' && method === 'POST') return routes.lexicon.create(req, res);
        if (path.match(/^\/api\/lexicons\/[^/]+\/entries$/) && method === 'GET') return routes.lexicon.entries(req, res, path);
        if (path.match(/^\/api\/lexicons\/[^/]+\/entries$/) && method === 'POST') return routes.lexicon.upsertEntry(req, res, path);
        if (path.match(/^\/api\/lexicons\/[^/]+\/import$/) && method === 'POST') return routes.lexicon.importData(req, res, path);

        // Corpus
        if (path === '/api/corpora' && method === 'GET') return routes.corpus.list(req, res);
        if (path === '/api/corpora' && method === 'POST') return routes.corpus.create(req, res);
        if (path.match(/^\/api\/corpora\/[^/]+\/import$/) && method === 'POST') return routes.corpus.importData(req, res, path);
        if (path === '/api/scripts' && method === 'GET') return routes.corpus.listScripts(req, res);

        // Analysis
        if (path === '/api/analysis/zipf' && method === 'POST') return routes.analysis.zipf(req, res);
        if (path === '/api/analysis/entropy' && method === 'POST') return routes.analysis.entropy(req, res);
        if (path === '/api/analysis/frequency' && method === 'POST') return routes.analysis.frequency(req, res);
        if (path === '/api/analysis/align' && method === 'POST') return routes.analysis.align(req, res);

        // Chat (non-stream fallback)
        if (path === '/api/chat' && method === 'POST') return routes.chat(req, res);
        if (path === '/api/embed' && method === 'POST') return routes.analysis.embed(req, res);

        // Settings
        if (path === '/api/settings' && method === 'GET') return routes.settings.get(req, res);
        if (path === '/api/settings' && method === 'PUT') return routes.settings.update(req, res);

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'not_found', message: `No route for ${method} ${path}` }));
        return;
      }

      // Static file serving (webui)
      serveStatic(req, res, config, logger);
    } catch (err) {
      logger.error({ err: err.message, stack: err.stack }, 'unhandled route error');
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'internal', message: 'Internal server error' }));
      }
    }
  };
}
