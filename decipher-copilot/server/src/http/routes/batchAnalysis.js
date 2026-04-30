/**
 * Batch analysis mode for large corpus processing.
 * Runs multiple analysis types across one or all corpora in a single request.
 *
 * POST /api/analysis/batch - Run multiple analyses
 * GET  /api/analysis/history - Get past analysis runs
 */
import { parseBody } from '../middleware.js';
import { ulid } from '../../util/ids.js';
import { frequencyReport } from '../../tools/frequencyReport.js';
import { entropyReport } from '../../tools/entropyReport.js';
import { zipfReport } from '../../tools/zipfReport.js';
import { crossInscriptionCheck } from '../../tools/crossInscriptionCheck.js';

export function createBatchAnalysisRoute(db, config, logger) {
  return {
    /**
     * POST /api/analysis/batch
     * Body: {
     *   corpus_ids?: string[],       // omit or empty = all corpora
     *   analyses: string[],          // ['zipf', 'shannon', 'conditional', 'block', 'rényi', 'yule_k', 'frequency']
     *   frequency_n?: number,        // n-gram size for frequency (default: 2)
     *   positional?: boolean,        // include positional analysis
     * }
     * Returns: aggregated results for all requested analyses across all specified corpora
     */
    async batch(req, res) {
      const body = await parseBody(req);
      const { corpus_ids, analyses = ['zipf', 'shannon', 'frequency'], frequency_n = 2, positional = false } = body;

      if (!analyses || !Array.isArray(analyses) || analyses.length === 0) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'analyses array required (e.g. ["zipf", "shannon", "frequency"])' }));
        return;
      }

      // Get target corpora
      let corpora;
      if (corpus_ids && Array.isArray(corpus_ids) && corpus_ids.length > 0) {
        corpora = corpus_ids.map(id => {
          const c = db.system.prepare('SELECT id, name, script_id FROM corpora WHERE id = ?').get(id);
          return c || { id, name: 'unknown', script_id: null };
        }).filter(c => c.name !== 'unknown');
      } else {
        corpora = db.system.prepare('SELECT id, name, script_id FROM corpora').all();
      }

      if (corpora.length === 0) {
        res.writeHead(200);
        res.end(JSON.stringify({ error: 'no corpora found', results: [] }));
        return;
      }

      const t0 = Date.now();
      const results = [];

      for (const corpus of corpora) {
        const corpusResult = {
          corpus_id: corpus.id,
          corpus_name: corpus.name,
          script_id: corpus.script_id,
          analyses: {},
        };

        for (const analysis of analyses) {
          const at0 = Date.now();
          try {
            switch (analysis) {
              case 'zipf':
                corpusResult.analyses.zipf = zipfReport(db, { corpus_id: corpus.id });
                break;
              case 'shannon':
                corpusResult.analyses.shannon = entropyReport(db, { corpus_id: corpus.id, kind: 'shannon' });
                break;
              case 'conditional':
                corpusResult.analyses.conditional = entropyReport(db, { corpus_id: corpus.id, kind: 'conditional' });
                break;
              case 'block':
                corpusResult.analyses.block = entropyReport(db, { corpus_id: corpus.id, kind: 'block' });
                break;
              case 'rényi':
              case 'renyi':
                corpusResult.analyses.renyi = entropyReport(db, { corpus_id: corpus.id, kind: 'rényi' });
                break;
              case 'yule_k':
                corpusResult.analyses.yule_k = entropyReport(db, { corpus_id: corpus.id, kind: 'yule_k' });
                break;
              case 'frequency':
                corpusResult.analyses.frequency = frequencyReport(db, { corpus_id: corpus.id, n: frequency_n, positional });
                break;
              default:
                corpusResult.analyses[analysis] = { error: `Unknown analysis type: ${analysis}` };
            }
          } catch (err) {
            corpusResult.analyses[analysis] = { error: err.message };
          }

          // Save individual run
          const ams = Date.now() - at0;
          try {
            db.system.prepare(
              'INSERT INTO analysis_runs (id, kind, corpus_id, inputs_json, results_json, duration_ms, created_at) VALUES (?,?,?,?,?,?,?)'
            ).run(ulid(), analysis, corpus.id, JSON.stringify({ batch: true }), JSON.stringify(corpusResult.analyses[analysis] || {}), ams, Date.now());
          } catch { /* non-fatal */ }
        }

        results.push(corpusResult);
      }

      const totalMs = Date.now() - t0;

      // Generate comparative summary across corpora
      const summary = generateComparativeSummary(results, analyses);

      res.writeHead(200);
      res.end(JSON.stringify({
        corpora_count: corpora.length,
        analyses_requested: analyses,
        duration_ms: totalMs,
        summary,
        results,
      }));
    },

    /**
     * GET /api/analysis/history?corpus_id=X&kind=Y&limit=N
     * Returns past analysis runs with optional filters.
     */
    async history(req, res) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const corpus_id = url.searchParams.get('corpus_id');
      const kind = url.searchParams.get('kind');
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);

      try {
        let sql = 'SELECT id, kind, corpus_id, inputs_json, results_json, duration_ms, created_at FROM analysis_runs';
        const conditions = [];
        const params = [];

        if (corpus_id) { conditions.push('corpus_id = ?'); params.push(corpus_id); }
        if (kind) { conditions.push('kind = ?'); params.push(kind); }
        if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        const rows = db.system.prepare(sql).all(...params);
        const history = rows.map(r => ({
          id: r.id,
          kind: r.kind,
          corpus_id: r.corpus_id,
          inputs: JSON.parse(r.inputs_json || '{}'),
          results: JSON.parse(r.results_json || '{}'),
          duration_ms: r.duration_ms,
          created_at: r.created_at,
        }));

        res.writeHead(200);
        res.end(JSON.stringify({ count: history.length, history }));
      } catch (err) {
        res.writeHead(200);
        res.end(JSON.stringify({ count: 0, history: [], error: err.message }));
      }
    },
  };
}

/**
 * Generate a comparative summary across multiple corpora results.
 */
function generateComparativeSummary(results, analyses) {
  const summary = { linguistic_ranking: [] };

  // Rank corpora by linguistic likelihood (Zipf + Shannon combined)
  const rankings = [];
  for (const r of results) {
    let score = 0;
    let factors = [];

    // Zipf R-squared (closer to 1 = more Zipfian = more language-like)
    const zipf = r.analyses.zipf?.result;
    if (zipf) {
      score += zipf.r_squared * 40; // max 40 points
      factors.push(`Zipf R²=${zipf.r_squared.toFixed(3)}`);
    }

    // Shannon entropy ratio (60-90% of max is natural language range)
    const shannon = r.analyses.shannon?.result;
    if (shannon && shannon.vocabulary > 0) {
      const maxH = Math.log2(shannon.vocabulary);
      const ratio = maxH > 0 ? shannon.h1 / maxH : 0;
      if (ratio >= 0.6 && ratio <= 0.9) score += 30;
      else if (ratio > 0.4) score += 15;
      factors.push(`H1 ratio=${(ratio * 100).toFixed(1)}%`);
    }

    // Yule's K (< 200 typical for natural language)
    const yule = r.analyses.yule_k?.result;
    if (yule) {
      if (yule.yule_k < 200) score += 20;
      else if (yule.yule_k < 500) score += 10;
      factors.push(`K=${yule.yule_k.toFixed(1)}`);
    }

    // Conditional entropy (lower = more predictable = more structured)
    const cond = r.analyses.conditional?.result;
    if (cond) {
      if (cond.h2 < 3.0) score += 10;
      factors.push(`H2=${cond.h2.toFixed(3)}`);
    }

    rankings.push({
      corpus_id: r.corpus_id,
      corpus_name: r.corpus_name,
      script_id: r.script_id,
      linguistic_score: +score.toFixed(1),
      factors,
    });
  }

  rankings.sort((a, b) => b.linguistic_score - a.linguistic_score);
  summary.linguistic_ranking = rankings;

  return summary;
}
