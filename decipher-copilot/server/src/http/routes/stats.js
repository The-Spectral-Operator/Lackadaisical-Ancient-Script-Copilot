/**
 * Real-Time Statistics API
 * Provides live system metrics, corpus analytics, and performance data.
 * Streams updates via WebSocket for dashboard panels.
 *
 * GET /api/stats/realtime    - Full real-time statistics snapshot
 * GET /api/stats/system      - System health and performance metrics
 * GET /api/stats/corpus/:id  - Live corpus statistics with analysis results
 */
export function createStatsRoute(db, config, _logger) {
  return {
    /**
     * GET /api/stats/realtime
     * Returns comprehensive real-time statistics across the entire system.
     */
    realtime(_req, res) {
      try {
        const stats = computeFullStats(db, config);
        res.writeHead(200);
        res.end(JSON.stringify(stats));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    /**
     * GET /api/stats/system
     * Returns system-level metrics.
     */
    system(_req, res) {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();

      let dbStats = {};
      try {
        const systemPages = db.system.pragma('page_count')[0]?.page_count || 0;
        const systemPageSize = db.system.pragma('page_size')[0]?.page_size || 4096;
        const convPages = db.conversations.pragma('page_count')[0]?.page_count || 0;
        const convPageSize = db.conversations.pragma('page_size')[0]?.page_size || 4096;
        dbStats = {
          system_db_size_bytes: systemPages * systemPageSize,
          conversations_db_size_bytes: convPages * convPageSize,
        };
      } catch {}

      res.writeHead(200);
      res.end(JSON.stringify({
        uptime_seconds: Math.floor(uptime),
        memory: {
          rss_mb: +(memUsage.rss / 1048576).toFixed(1),
          heap_used_mb: +(memUsage.heapUsed / 1048576).toFixed(1),
          heap_total_mb: +(memUsage.heapTotal / 1048576).toFixed(1),
          external_mb: +(memUsage.external / 1048576).toFixed(1),
        },
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        ollama_host: config.ollamaHost,
        default_model: config.defaultModel,
        ...dbStats,
        timestamp: Date.now(),
      }));
    },

    /**
     * GET /api/stats/corpus/:id
     * Returns live detailed statistics for a specific corpus.
     */
    corpus(_req, res, path) {
      const corpusId = path.split('/').pop();
      try {
        const corpus = db.system.prepare('SELECT * FROM corpora WHERE id = ?').get(corpusId);
        if (!corpus) { res.writeHead(404); res.end(JSON.stringify({ error: 'corpus not found' })); return; }

        const inscriptions = db.system.prepare(
          'SELECT id, transcription FROM inscriptions WHERE corpus_id = ?'
        ).all(corpusId);

        // Compute live statistics
        const allTokens = [];
        const tokenFreq = {};
        const bigramFreq = {};
        let totalBigrams = 0;
        const lengths = [];

        for (const insc of inscriptions) {
          const tokens = (insc.transcription || '').trim().split(/\s+/).filter(Boolean);
          lengths.push(tokens.length);
          for (let i = 0; i < tokens.length; i++) {
            allTokens.push(tokens[i]);
            tokenFreq[tokens[i]] = (tokenFreq[tokens[i]] || 0) + 1;
            if (i < tokens.length - 1) {
              const pair = `${tokens[i]} ${tokens[i + 1]}`;
              bigramFreq[pair] = (bigramFreq[pair] || 0) + 1;
              totalBigrams++;
            }
          }
        }

        const vocabulary = Object.keys(tokenFreq).length;
        const totalTokens = allTokens.length;

        // Shannon entropy
        let h1 = 0;
        for (const c of Object.values(tokenFreq)) {
          const p = c / totalTokens;
          if (p > 0) h1 -= p * Math.log2(p);
        }

        // Zipf metrics
        const freqValues = Object.values(tokenFreq).sort((a, b) => b - a);
        let zipfSlope = 0;
        if (freqValues.length > 2) {
          const logRanks = freqValues.map((_, i) => Math.log(i + 1));
          const logFreqs = freqValues.map(f => Math.log(f));
          const n = logRanks.length;
          const sumX = logRanks.reduce((s, v) => s + v, 0);
          const sumY = logFreqs.reduce((s, v) => s + v, 0);
          const sumXY = logRanks.reduce((s, v, i) => s + v * logFreqs[i], 0);
          const sumXX = logRanks.reduce((s, v) => s + v * v, 0);
          zipfSlope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        }

        // Hapax legomena
        const hapax = Object.values(tokenFreq).filter(c => c === 1).length;

        // Average inscription length
        const avgLength = lengths.length > 0 ? lengths.reduce((s, l) => s + l, 0) / lengths.length : 0;

        // Top bigrams
        const topBigrams = Object.entries(bigramFreq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([pair, count]) => ({ pair, count, probability: +(count / totalBigrams).toFixed(4) }));

        // Recent analysis runs
        let recentAnalyses = [];
        try {
          recentAnalyses = db.system.prepare(
            'SELECT id, kind, duration_ms, created_at FROM analysis_runs WHERE corpus_id = ? ORDER BY created_at DESC LIMIT 10'
          ).all(corpusId);
        } catch {}

        res.writeHead(200);
        res.end(JSON.stringify({
          corpus_id: corpusId,
          corpus_name: corpus.name,
          script_id: corpus.script_id,
          inscription_count: inscriptions.length,
          total_tokens: totalTokens,
          vocabulary_size: vocabulary,
          type_token_ratio: vocabulary > 0 ? +(vocabulary / totalTokens).toFixed(4) : 0,
          shannon_entropy: +h1.toFixed(4),
          max_entropy: vocabulary > 0 ? +Math.log2(vocabulary).toFixed(4) : 0,
          entropy_ratio: vocabulary > 0 ? +(h1 / Math.log2(vocabulary)).toFixed(4) : 0,
          zipf_slope: +zipfSlope.toFixed(4),
          hapax_legomena: hapax,
          hapax_ratio: vocabulary > 0 ? +(hapax / vocabulary).toFixed(4) : 0,
          avg_inscription_length: +avgLength.toFixed(1),
          top_bigrams: topBigrams,
          recent_analyses: recentAnalyses,
          timestamp: Date.now(),
        }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    },
  };
}

function computeFullStats(db, config) {
  let scriptCount = 0, lexiconCount = 0, entryCount = 0, corpusCount = 0, inscriptionCount = 0;
  let sessionCount = 0, messageCount = 0, analysisCount = 0;
  let chainCount = 0, uploadCount = 0;

  try { scriptCount = db.system.prepare('SELECT COUNT(*) as n FROM scripts').get()?.n || 0; } catch {}
  try { lexiconCount = db.system.prepare('SELECT COUNT(*) as n FROM lexicons').get()?.n || 0; } catch {}
  try { entryCount = db.system.prepare('SELECT COUNT(*) as n FROM lexicon_entries').get()?.n || 0; } catch {}
  try { corpusCount = db.system.prepare('SELECT COUNT(*) as n FROM corpora').get()?.n || 0; } catch {}
  try { inscriptionCount = db.system.prepare('SELECT COUNT(*) as n FROM inscriptions').get()?.n || 0; } catch {}
  try { sessionCount = db.conversations.prepare('SELECT COUNT(*) as n FROM sessions').get()?.n || 0; } catch {}
  try { messageCount = db.conversations.prepare('SELECT COUNT(*) as n FROM messages').get()?.n || 0; } catch {}
  try { analysisCount = db.system.prepare('SELECT COUNT(*) as n FROM analysis_runs').get()?.n || 0; } catch {}
  try { chainCount = db.system.prepare('SELECT COUNT(*) as n FROM glyph_chains').get()?.n || 0; } catch {}
  try { uploadCount = db.system.prepare('SELECT COUNT(*) as n FROM dataset_uploads').get()?.n || 0; } catch {}

  // Recent activity
  let recentSessions = [];
  try {
    recentSessions = db.conversations.prepare(
      'SELECT id, title, model, script, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 5'
    ).all();
  } catch {}

  let recentAnalyses = [];
  try {
    recentAnalyses = db.system.prepare(
      'SELECT id, kind, corpus_id, duration_ms, created_at FROM analysis_runs ORDER BY created_at DESC LIMIT 10'
    ).all();
  } catch {}

  // Model info
  let models = [];
  try { models = db.system.prepare('SELECT name, family, parameter_size, last_seen_at FROM models ORDER BY last_seen_at DESC').all(); } catch {}

  return {
    counts: {
      scripts: scriptCount,
      lexicons: lexiconCount,
      lexicon_entries: entryCount,
      corpora: corpusCount,
      inscriptions: inscriptionCount,
      sessions: sessionCount,
      messages: messageCount,
      analysis_runs: analysisCount,
      glyph_chains: chainCount,
      dataset_uploads: uploadCount,
    },
    models: models.slice(0, 10),
    recent_sessions: recentSessions,
    recent_analyses: recentAnalyses,
    config: {
      ollama_host: config.ollamaHost,
      default_model: config.defaultModel,
      embed_model: config.embedModel,
      data_dir: config.dataDir,
    },
    timestamp: Date.now(),
  };
}
