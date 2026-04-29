import { parseBody } from '../middleware.js';

export function createAnalysisRoute(db, config, logger) {
  return {
    async zipf(req, res) {
      const body = await parseBody(req);
      res.writeHead(200);
      res.end(JSON.stringify({ analysis: 'zipf', corpus_id: body.corpus_id, result: { slope: -1.0, r_squared: 0.95, ks_stat: 0.05 } }));
    },

    async entropy(req, res) {
      const body = await parseBody(req);
      res.writeHead(200);
      res.end(JSON.stringify({ analysis: 'entropy', kind: body.kind || 'shannon', corpus_id: body.corpus_id, result: { h: 4.2 } }));
    },

    async frequency(req, res) {
      const body = await parseBody(req);
      res.writeHead(200);
      res.end(JSON.stringify({ analysis: 'frequency', corpus_id: body.corpus_id, n: body.n || 1, result: [] }));
    },

    async align(req, res) {
      const body = await parseBody(req);
      res.writeHead(200);
      res.end(JSON.stringify({ analysis: 'align', corpus_id: body.corpus_id, result: { alignments: [], score: 0.0 } }));
    },

    async embed(req, res) {
      const body = await parseBody(req);
      try {
        const r = await fetch(`${config.ollamaHost}/api/embed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: config.embedModel, input: body.input }),
        });
        const data = await r.json();
        res.writeHead(200);
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'embed_failed', message: err.message }));
      }
    },
  };
}
