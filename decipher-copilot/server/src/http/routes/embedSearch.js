/**
 * Embedding-based semantic search across corpora.
 * Uses Ollama /api/embed to create vector embeddings of inscriptions,
 * then performs cosine similarity search for semantically related texts.
 *
 * POST /api/search/semantic - Search by meaning across all inscriptions
 * POST /api/search/index    - Build/rebuild the embedding index for a corpus
 * GET  /api/search/status   - Check indexing status
 */
import { parseBody } from '../middleware.js';
import { ulid } from '../../util/ids.js';

export function createEmbedSearchRoute(db, config, logger) {
  /**
   * Cosine similarity between two vectors.
   */
  function cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
  }

  /**
   * Get embedding from Ollama for a text string.
   */
  async function getEmbedding(text, model) {
    const embedModel = model || config.embedModel;
    const res = await fetch(`${config.ollamaHost}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: embedModel, input: text }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`embed failed: ${res.status}`);
    const data = await res.json();
    return data.embeddings?.[0] || null;
  }

  /**
   * Get batch embeddings from Ollama.
   */
  async function getBatchEmbeddings(texts, model) {
    const embedModel = model || config.embedModel;
    const res = await fetch(`${config.ollamaHost}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: embedModel, input: texts }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) throw new Error(`batch embed failed: ${res.status}`);
    const data = await res.json();
    return data.embeddings || [];
  }

  // Ensure embedding storage table exists
  try {
    db.system.exec(`
      CREATE TABLE IF NOT EXISTS inscription_embeddings (
        inscription_id TEXT PRIMARY KEY REFERENCES inscriptions(id) ON DELETE CASCADE,
        corpus_id      TEXT NOT NULL,
        model          TEXT NOT NULL,
        dimensions     INTEGER NOT NULL,
        embedding_blob BLOB NOT NULL,
        text_hash      TEXT NOT NULL,
        created_at     INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_embed_corpus ON inscription_embeddings(corpus_id);
    `);
  } catch { /* table may already exist */ }

  return {
    /**
     * POST /api/search/semantic
     * Body: { query: string, corpus_id?: string, top_k?: number, model?: string }
     * Returns: top_k most semantically similar inscriptions
     */
    async semantic(req, res) {
      const body = await parseBody(req);
      const { query, corpus_id, top_k = 20, model } = body;

      if (!query) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'query is required' }));
        return;
      }

      try {
        // Get query embedding
        const queryEmbed = await getEmbedding(query, model);
        if (!queryEmbed) {
          res.writeHead(503);
          res.end(JSON.stringify({ error: 'embedding_failed', message: 'Could not generate query embedding' }));
          return;
        }

        // Load stored embeddings
        const embedRows = corpus_id
          ? db.system.prepare('SELECT inscription_id, corpus_id, embedding_blob FROM inscription_embeddings WHERE corpus_id = ?').all(corpus_id)
          : db.system.prepare('SELECT inscription_id, corpus_id, embedding_blob FROM inscription_embeddings').all();

        if (embedRows.length === 0) {
          // Fallback: if no embeddings indexed, do live embedding search on recent inscriptions
          const inscriptions = corpus_id
            ? db.system.prepare('SELECT id, corpus_id, reference, transcription, raw_text FROM inscriptions WHERE corpus_id = ? LIMIT 100').all(corpus_id)
            : db.system.prepare('SELECT id, corpus_id, reference, transcription, raw_text FROM inscriptions LIMIT 100').all();

          if (inscriptions.length === 0) {
            res.writeHead(200);
            res.end(JSON.stringify({ query, results: [], message: 'No inscriptions found. Import a corpus first.' }));
            return;
          }

          // Live embedding comparison (slower but works without pre-indexing)
          const texts = inscriptions.map(i => `${i.reference}: ${i.transcription || ''} ${i.raw_text || ''}`.trim());
          const embeddings = await getBatchEmbeddings(texts, model);

          const scored = inscriptions.map((insc, idx) => ({
            ...insc,
            similarity: embeddings[idx] ? cosineSimilarity(queryEmbed, embeddings[idx]) : 0,
          }));
          scored.sort((a, b) => b.similarity - a.similarity);

          res.writeHead(200);
          res.end(JSON.stringify({
            query,
            mode: 'live',
            count: Math.min(scored.length, top_k),
            results: scored.slice(0, top_k).map(r => ({
              inscription_id: r.id,
              corpus_id: r.corpus_id,
              reference: r.reference,
              transcription: r.transcription,
              raw_text: r.raw_text,
              similarity: +r.similarity.toFixed(4),
            })),
          }));
          return;
        }

        // Use pre-computed embeddings (fast path)
        const scored = [];
        for (const row of embedRows) {
          const stored = deserializeEmbedding(row.embedding_blob);
          const sim = cosineSimilarity(queryEmbed, stored);
          scored.push({ inscription_id: row.inscription_id, corpus_id: row.corpus_id, similarity: sim });
        }
        scored.sort((a, b) => b.similarity - a.similarity);
        const topResults = scored.slice(0, top_k);

        // Enrich with inscription data
        const results = topResults.map(r => {
          const insc = db.system.prepare('SELECT reference, transcription, raw_text FROM inscriptions WHERE id = ?').get(r.inscription_id);
          return {
            ...r,
            reference: insc?.reference || '',
            transcription: insc?.transcription || '',
            raw_text: insc?.raw_text || '',
            similarity: +r.similarity.toFixed(4),
          };
        });

        res.writeHead(200);
        res.end(JSON.stringify({ query, mode: 'indexed', count: results.length, results }));
      } catch (err) {
        logger.error({ err: err.message }, 'semantic search error');
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'search_failed', message: err.message }));
      }
    },

    /**
     * POST /api/search/index
     * Body: { corpus_id: string, model?: string, batch_size?: number }
     * Builds embedding index for all inscriptions in a corpus.
     */
    async index(req, res) {
      const body = await parseBody(req);
      const { corpus_id, model, batch_size = 32 } = body;

      if (!corpus_id) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'corpus_id is required' }));
        return;
      }

      try {
        const inscriptions = db.system.prepare(
          'SELECT id, reference, transcription, raw_text FROM inscriptions WHERE corpus_id = ?'
        ).all(corpus_id);

        if (inscriptions.length === 0) {
          res.writeHead(200);
          res.end(JSON.stringify({ corpus_id, indexed: 0, message: 'No inscriptions in corpus' }));
          return;
        }

        const embedModel = model || config.embedModel;
        let indexed = 0;
        const now = Date.now();

        // Process in batches
        for (let i = 0; i < inscriptions.length; i += batch_size) {
          const batch = inscriptions.slice(i, i + batch_size);
          const texts = batch.map(insc =>
            `${insc.reference}: ${insc.transcription || ''} ${insc.raw_text || ''}`.trim()
          );

          const embeddings = await getBatchEmbeddings(texts, embedModel);

          for (let j = 0; j < batch.length; j++) {
            if (!embeddings[j]) continue;
            const blob = serializeEmbedding(embeddings[j]);
            const textHash = simpleHash(texts[j]);

            db.system.prepare(`
              INSERT OR REPLACE INTO inscription_embeddings
              (inscription_id, corpus_id, model, dimensions, embedding_blob, text_hash, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(batch[j].id, corpus_id, embedModel, embeddings[j].length, blob, textHash, now);
            indexed++;
          }
        }

        logger.info({ corpus_id, indexed, model: embedModel }, 'embedding index built');
        res.writeHead(200);
        res.end(JSON.stringify({ corpus_id, indexed, total: inscriptions.length, model: embedModel }));
      } catch (err) {
        logger.error({ err: err.message }, 'indexing error');
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'indexing_failed', message: err.message }));
      }
    },

    /**
     * GET /api/search/status
     * Returns embedding index status per corpus.
     */
    async status(req, res) {
      try {
        const stats = db.system.prepare(`
          SELECT corpus_id, model, COUNT(*) as indexed_count, MAX(created_at) as last_indexed
          FROM inscription_embeddings
          GROUP BY corpus_id, model
        `).all();

        const corporaTotal = db.system.prepare(
          'SELECT corpus_id, COUNT(*) as total FROM inscriptions GROUP BY corpus_id'
        ).all();
        const totalMap = new Map(corporaTotal.map(r => [r.corpus_id, r.total]));

        const result = stats.map(s => ({
          corpus_id: s.corpus_id,
          model: s.model,
          indexed: s.indexed_count,
          total: totalMap.get(s.corpus_id) || 0,
          coverage: totalMap.get(s.corpus_id) ? +(s.indexed_count / totalMap.get(s.corpus_id) * 100).toFixed(1) : 0,
          last_indexed: s.last_indexed,
        }));

        res.writeHead(200);
        res.end(JSON.stringify({ corpora: result }));
      } catch (err) {
        res.writeHead(200);
        res.end(JSON.stringify({ corpora: [], message: 'No embeddings indexed yet' }));
      }
    },
  };
}

/**
 * Serialize float32 array to Buffer for blob storage.
 */
function serializeEmbedding(embedding) {
  const buf = Buffer.alloc(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buf.writeFloatLE(embedding[i], i * 4);
  }
  return buf;
}

/**
 * Deserialize Buffer back to float32 array.
 */
function deserializeEmbedding(blob) {
  const buf = Buffer.from(blob);
  const arr = new Array(buf.length / 4);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = buf.readFloatLE(i * 4);
  }
  return arr;
}

/**
 * Simple non-cryptographic hash for change detection.
 */
function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
}
