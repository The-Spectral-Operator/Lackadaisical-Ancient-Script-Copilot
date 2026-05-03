/**
 * Analysis routes — real implementations backed by JS engines.
 * POST /api/analysis/{zipf|entropy|frequency|align|embed}
 */
import { parseBody } from '../middleware.js';
import { ulid } from '../../util/ids.js';
import { frequencyReport } from '../../tools/frequencyReport.js';
import { entropyReport } from '../../tools/entropyReport.js';
import { zipfReport } from '../../tools/zipfReport.js';

export function createAnalysisRoute(db, config, logger) {
  function saveRun(kind, corpusId, inputs, results, durationMs) {
    try {
      db.system.prepare(
        'INSERT INTO analysis_runs (id, kind, corpus_id, inputs_json, results_json, duration_ms, created_at) VALUES (?,?,?,?,?,?,?)'
      ).run(ulid(), kind, corpusId || null, JSON.stringify(inputs), JSON.stringify(results), durationMs, Date.now());
    } catch { /* non-fatal */ }
  }

  return {
    async zipf(req, res) {
      const body = await parseBody(req);
      const { corpus_id } = body;
      if (!corpus_id) { res.writeHead(400); res.end(JSON.stringify({ error: 'corpus_id required' })); return; }
      const t0 = Date.now();
      const result = zipfReport(db, { corpus_id });
      const ms = Date.now() - t0;
      saveRun('zipf', corpus_id, body, result, ms);
      res.writeHead(200);
      res.end(JSON.stringify({ ...result, duration_ms: ms }));
    },

    async entropy(req, res) {
      const body = await parseBody(req);
      const { corpus_id, kind = 'shannon' } = body;
      if (!corpus_id) { res.writeHead(400); res.end(JSON.stringify({ error: 'corpus_id required' })); return; }
      const t0 = Date.now();
      const result = entropyReport(db, { corpus_id, kind });
      const ms = Date.now() - t0;
      saveRun(kind, corpus_id, body, result, ms);
      res.writeHead(200);
      res.end(JSON.stringify({ ...result, duration_ms: ms }));
    },

    async frequency(req, res) {
      const body = await parseBody(req);
      const { corpus_id, n = 1, positional = false } = body;
      if (!corpus_id) { res.writeHead(400); res.end(JSON.stringify({ error: 'corpus_id required' })); return; }
      const t0 = Date.now();
      const result = frequencyReport(db, { corpus_id, n: parseInt(n), positional });
      const ms = Date.now() - t0;
      saveRun('frequency', corpus_id, body, result, ms);
      res.writeHead(200);
      res.end(JSON.stringify({ ...result, duration_ms: ms }));
    },

    async align(req, res) {
      const body = await parseBody(req);
      const { corpus_id, known_lexicon_id, params } = body;
      if (!corpus_id) { res.writeHead(400); res.end(JSON.stringify({ error: 'corpus_id required' })); return; }
      const t0 = Date.now();

      // Gather corpus data
      const inscriptions = db.system.prepare(
        'SELECT id, transcription FROM inscriptions WHERE corpus_id = ?'
      ).all(corpus_id);

      if (inscriptions.length === 0) {
        res.writeHead(200);
        res.end(JSON.stringify({ corpus_id, error: 'no inscriptions', duration_ms: 0 }));
        return;
      }

      // Build unigram and bigram frequency maps
      const uniFreq = {};
      const biFreq = {};
      let totalTokens = 0;
      for (const insc of inscriptions) {
        const tokens = (insc.transcription || '').trim().split(/\s+/).filter(Boolean);
        for (let i = 0; i < tokens.length; i++) {
          uniFreq[tokens[i]] = (uniFreq[tokens[i]] || 0) + 1;
          totalTokens++;
          if (i < tokens.length - 1) {
            const pair = `${tokens[i]}\x00${tokens[i + 1]}`;
            biFreq[pair] = (biFreq[pair] || 0) + 1;
          }
        }
      }

      // Load known lexicon entries if provided
      let knownEntries = [];
      if (known_lexicon_id) {
        knownEntries = db.system.prepare(
          'SELECT token, gloss, confidence FROM lexicon_entries WHERE lexicon_id = ?'
        ).all(known_lexicon_id);
      }
      const knownMap = new Map(knownEntries.map(e => [e.token, e]));

      // Simulated annealing: find optimal sign → reading mapping
      const signs = Object.keys(uniFreq);
      const N = signs.length;
      if (N === 0) {
        res.writeHead(200);
        res.end(JSON.stringify({ corpus_id, alignments: [], score: 0, duration_ms: 0 }));
        return;
      }

      // Initialize mapping: known entries get their gloss, unknown get '?'
      const mapping = signs.map(sign => ({
        sign,
        reading: knownMap.has(sign) ? knownMap.get(sign).gloss : '?',
        confidence: knownMap.has(sign) ? knownMap.get(sign).confidence : 0.0,
        locked: knownMap.has(sign),
      }));

      // Scoring function: bigram mutual information + frequency consistency
      function scoreMapping(map) {
        let score = 0;
        const readingMap = new Map(map.map(m => [m.sign, m.reading]));
        // Reward: consistent bigram patterns (same reading pairs appear together)
        for (const [pair, count] of Object.entries(biFreq)) {
          const [a, b] = pair.split('\x00');
          const ra = readingMap.get(a) || '?';
          const rb = readingMap.get(b) || '?';
          if (ra !== '?' && rb !== '?') {
            score += count * 0.5; // Known pairs contribute positively
          }
        }
        // Reward: Zipf-like distribution of readings
        const readingFreq = {};
        for (const m of map) {
          if (m.reading !== '?') readingFreq[m.reading] = (readingFreq[m.reading] || 0) + (uniFreq[m.sign] || 0);
        }
        const rfValues = Object.values(readingFreq).sort((a, b) => b - a);
        for (let i = 0; i < rfValues.length; i++) {
          const expected = rfValues[0] / (i + 1); // Ideal Zipf
          const actual = rfValues[i];
          score -= Math.abs(actual - expected) * 0.001; // Penalize deviation
        }
        return score;
      }

      // Annealing parameters
      const maxIter = params?.max_iterations || 10000;
      const initTemp = params?.initial_temp || 2.0;
      const coolingRate = params?.cooling_rate || 0.9995;

      let currentScore = scoreMapping(mapping);
      let bestScore = currentScore;
      let bestMapping = mapping.map(m => ({ ...m }));
      let temp = initTemp;
      let rngState = (params?.seed || 42) >>> 0;

      // Xorshift32 PRNG
      function xorshift() {
        rngState ^= rngState << 13;
        rngState ^= rngState >>> 17;
        rngState ^= rngState << 5;
        return (rngState >>> 0) / 4294967296;
      }

      for (let iter = 0; iter < maxIter && temp > 0.001; iter++) {
        // Pick two unlocked signs and swap readings
        const unlocked = mapping.filter(m => !m.locked);
        if (unlocked.length < 2) break;

        const i = Math.floor(xorshift() * unlocked.length);
        let j = Math.floor(xorshift() * unlocked.length);
        if (i === j) j = (j + 1) % unlocked.length;

        // Swap
        const tmpReading = unlocked[i].reading;
        unlocked[i].reading = unlocked[j].reading;
        unlocked[j].reading = tmpReading;

        const newScore = scoreMapping(mapping);
        const delta = newScore - currentScore;

        if (delta > 0 || Math.exp(delta / temp) > xorshift()) {
          currentScore = newScore;
          if (currentScore > bestScore) {
            bestScore = currentScore;
            bestMapping = mapping.map(m => ({ ...m }));
          }
        } else {
          // Revert swap
          unlocked[j].reading = unlocked[i].reading;
          unlocked[i].reading = tmpReading;
        }
        temp *= coolingRate;
      }

      const ms = Date.now() - t0;
      const result = {
        corpus_id,
        known_lexicon_id: known_lexicon_id || null,
        total_signs: N,
        known_signs: knownEntries.length,
        unknown_signs: N - mapping.filter(m => m.locked).length,
        score: +bestScore.toFixed(4),
        alignments: bestMapping.slice(0, 200).map(m => ({
          sign: m.sign,
          reading: m.reading,
          confidence: +m.confidence.toFixed(3),
          locked: m.locked,
          frequency: uniFreq[m.sign] || 0,
        })),
      };
      saveRun('align', corpus_id, body, result, ms);
      res.writeHead(200);
      res.end(JSON.stringify({ ...result, duration_ms: ms }));
    },

    async embed(req, res) {
      const body = await parseBody(req);
      const { input, model } = body;
      if (!input) { res.writeHead(400); res.end(JSON.stringify({ error: 'input required' })); return; }
      try {
        const r = await fetch(`${config.ollamaHost}/api/embed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...config.ollamaAuthHeaders },
          body: JSON.stringify({ model: model || config.embedModel, input }),
          signal: AbortSignal.timeout(30000),
        });
        if (!r.ok) { res.writeHead(r.status); res.end(JSON.stringify({ error: 'embed_failed' })); return; }
        const data = await r.json();
        res.writeHead(200);
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'ollama_unavailable', message: err.message }));
      }
    },
  };
}
