/**
 * Sign-form clustering via vision model embeddings.
 * Groups similar-looking glyphs/signs together using vision model analysis.
 * Useful for identifying sign variants, damaged signs, and undocumented forms.
 *
 * POST /api/signs/cluster        - Cluster signs by visual similarity
 * POST /api/signs/identify       - Identify a sign from an image
 * GET  /api/signs/clusters/:id   - Get a specific cluster result
 */
import { parseBody } from '../middleware.js';
import { ulid } from '../../util/ids.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function createSignClusterRoute(db, config, logger) {
  // Ensure cluster storage table exists
  try {
    db.system.exec(`
      CREATE TABLE IF NOT EXISTS sign_clusters (
        id           TEXT PRIMARY KEY,
        script_id    TEXT NOT NULL,
        method       TEXT NOT NULL,
        cluster_count INTEGER NOT NULL,
        results_json TEXT NOT NULL,
        created_at   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_clusters_script ON sign_clusters(script_id);
    `);
  } catch { /* table may already exist */ }

  return {
    /**
     * POST /api/signs/cluster
     * Body: {
     *   script_id: string,
     *   method?: 'vision' | 'embedding' | 'structural',
     *   model?: string,
     *   num_clusters?: number
     * }
     * Clusters all signs of a script by visual/structural similarity.
     */
    async cluster(req, res) {
      const body = await parseBody(req);
      const { script_id, method = 'structural', model, num_clusters } = body;

      if (!script_id) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'script_id is required' }));
        return;
      }

      try {
        // Get all signs for this script
        const signs = db.system.prepare(
          'SELECT id, glyph_pua, image_path, variant_of, notes FROM signs WHERE script_id = ?'
        ).all(script_id);

        if (signs.length === 0) {
          res.writeHead(200);
          res.end(JSON.stringify({ script_id, clusters: [], message: 'No signs found for this script' }));
          return;
        }

        let clusters;
        const t0 = Date.now();

        switch (method) {
          case 'vision':
            clusters = await clusterByVision(signs, config, model || config.visionModel, logger);
            break;
          case 'embedding':
            clusters = await clusterByEmbedding(signs, config, model || config.embedModel, logger);
            break;
          case 'structural':
          default:
            clusters = clusterByStructure(signs, num_clusters);
            break;
        }

        const ms = Date.now() - t0;

        // Save cluster results
        const resultId = ulid();
        try {
          db.system.prepare(
            'INSERT INTO sign_clusters (id, script_id, method, cluster_count, results_json, created_at) VALUES (?,?,?,?,?,?)'
          ).run(resultId, script_id, method, clusters.length, JSON.stringify(clusters), Date.now());
        } catch { /* non-fatal */ }

        res.writeHead(200);
        res.end(JSON.stringify({
          id: resultId,
          script_id,
          method,
          sign_count: signs.length,
          cluster_count: clusters.length,
          duration_ms: ms,
          clusters,
        }));
      } catch (err) {
        logger.error({ err: err.message }, 'clustering error');
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'clustering_failed', message: err.message }));
      }
    },

    /**
     * POST /api/signs/identify
     * Body: { image_base64: string, script_id?: string, model?: string }
     * Uses a vision model to identify a sign from an uploaded image.
     */
    async identify(req, res) {
      const body = await parseBody(req);
      const { image_base64, script_id, model } = body;

      if (!image_base64) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'image_base64 is required' }));
        return;
      }

      const visionModel = model || config.visionModel;
      const scriptContext = script_id
        ? `The sign is from the ${script_id} script. Compare against known sign forms.`
        : 'Identify the script and sign form.';

      try {
        const ollamaRes = await fetch(`${config.ollamaHost}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: visionModel,
            messages: [{
              role: 'user',
              content: `Analyze this glyph/sign image. ${scriptContext} Provide: 1) Most likely sign ID, 2) Script identification, 3) Confidence (0-1), 4) Visual description, 5) Similar/variant forms if known. Output as JSON with keys: sign_id, script, confidence, description, variants.`,
              images: [image_base64],
            }],
            stream: false,
            format: {
              type: 'object',
              required: ['sign_id', 'script', 'confidence', 'description'],
              properties: {
                sign_id: { type: 'string' },
                script: { type: 'string' },
                confidence: { type: 'number' },
                description: { type: 'string' },
                variants: { type: 'array', items: { type: 'string' } },
                damage_notes: { type: 'string' },
              },
            },
            options: { num_ctx: 8192, temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (!ollamaRes.ok) {
          res.writeHead(503);
          res.end(JSON.stringify({ error: 'vision_failed', status: ollamaRes.status }));
          return;
        }

        const data = await ollamaRes.json();
        let identification;
        try {
          identification = JSON.parse(data.message?.content || '{}');
        } catch {
          identification = { raw: data.message?.content, parse_error: true };
        }

        res.writeHead(200);
        res.end(JSON.stringify({
          model: visionModel,
          identification,
          thinking: data.message?.thinking || null,
        }));
      } catch (err) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'vision_unavailable', message: err.message }));
      }
    },

    /**
     * GET /api/signs/clusters/:id
     * Returns a previously computed cluster result.
     */
    async getCluster(req, res, path) {
      const id = path.split('/').pop();
      try {
        const row = db.system.prepare('SELECT * FROM sign_clusters WHERE id = ?').get(id);
        if (!row) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'cluster not found' }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({
          id: row.id,
          script_id: row.script_id,
          method: row.method,
          cluster_count: row.cluster_count,
          created_at: row.created_at,
          clusters: JSON.parse(row.results_json),
        }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    },
  };
}

/**
 * Cluster signs by structural similarity (no vision model needed).
 * Groups by: variant_of relationships, PUA codepoint proximity, ID prefix patterns.
 */
function clusterByStructure(signs, targetClusters) {
  const clusters = new Map();

  // First pass: group by explicit variant_of relationships
  for (const sign of signs) {
    const root = sign.variant_of || sign.id;
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(sign);
  }

  // Second pass: group by ID prefix (e.g., AB01, AB01a, AB01b → same cluster)
  const merged = new Map();
  for (const [root, members] of clusters) {
    // Extract base ID (strip trailing letter variants)
    const baseId = root.replace(/[a-z]$/, '');
    if (!merged.has(baseId)) merged.set(baseId, []);
    merged.get(baseId).push(...members);
  }

  // Convert to array format
  const result = [];
  for (const [centroid, members] of merged) {
    result.push({
      cluster_id: centroid,
      centroid_sign: centroid,
      size: members.length,
      members: members.map(m => ({
        sign_id: m.id,
        glyph_pua: m.glyph_pua,
        is_variant: !!m.variant_of,
        variant_of: m.variant_of,
      })),
    });
  }

  // Sort by cluster size descending
  result.sort((a, b) => b.size - a.size);

  // If target cluster count specified, merge smallest clusters
  if (targetClusters && result.length > targetClusters) {
    while (result.length > targetClusters) {
      const smallest = result.pop();
      result[result.length - 1].members.push(...smallest.members);
      result[result.length - 1].size += smallest.size;
    }
  }

  return result;
}

/**
 * Cluster signs by vision model description similarity.
 * Sends each sign image to the vision model, gets descriptions, then clusters by text similarity.
 */
async function clusterByVision(signs, config, visionModel, logger) {
  // Get signs that have image paths
  const signsWithImages = signs.filter(s => s.image_path);

  if (signsWithImages.length === 0) {
    // Fall back to structural if no images available
    return clusterByStructure(signs);
  }

  // For signs without images, use structural clustering
  const descriptions = new Map();

  // Get vision descriptions in batches of 5
  for (let i = 0; i < Math.min(signsWithImages.length, 50); i++) {
    const sign = signsWithImages[i];
    const imgPath = join(config.dataDir, sign.image_path);

    if (!existsSync(imgPath)) continue;

    try {
      const imgBase64 = readFileSync(imgPath).toString('base64');
      const ollamaRes = await fetch(`${config.ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: visionModel,
          messages: [{ role: 'user', content: 'Describe this glyph shape concisely (strokes, orientation, complexity).', images: [imgBase64] }],
          stream: false,
          options: { num_ctx: 2048, temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (ollamaRes.ok) {
        const data = await ollamaRes.json();
        descriptions.set(sign.id, data.message?.content || '');
      }
    } catch (err) {
      logger.warn({ sign: sign.id, err: err.message }, 'vision cluster: skipping sign');
    }
  }

  // Cluster by description similarity (simple keyword overlap)
  const clusters = new Map();
  const assigned = new Set();

  const descEntries = [...descriptions.entries()];
  for (let i = 0; i < descEntries.length; i++) {
    if (assigned.has(descEntries[i][0])) continue;
    const cluster = [descEntries[i][0]];
    assigned.add(descEntries[i][0]);
    const wordsA = new Set(descEntries[i][1].toLowerCase().split(/\s+/));

    for (let j = i + 1; j < descEntries.length; j++) {
      if (assigned.has(descEntries[j][0])) continue;
      const wordsB = new Set(descEntries[j][1].toLowerCase().split(/\s+/));
      // Jaccard similarity
      const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
      const union = new Set([...wordsA, ...wordsB]).size;
      const jaccard = union > 0 ? intersection / union : 0;
      if (jaccard > 0.3) {
        cluster.push(descEntries[j][0]);
        assigned.add(descEntries[j][0]);
      }
    }
    clusters.set(descEntries[i][0], cluster);
  }

  // Add unclustered signs
  for (const sign of signs) {
    if (!assigned.has(sign.id)) {
      clusters.set(sign.id, [sign.id]);
    }
  }

  return [...clusters.entries()].map(([centroid, members]) => ({
    cluster_id: centroid,
    centroid_sign: centroid,
    size: members.length,
    method: 'vision',
    members: members.map(id => ({ sign_id: id, description: descriptions.get(id) || null })),
  })).sort((a, b) => b.size - a.size);
}

/**
 * Cluster by embedding similarity (text embeddings of sign metadata).
 */
async function clusterByEmbedding(signs, config, embedModel, logger) {
  // Create text representations of each sign
  const texts = signs.map(s =>
    `Sign ${s.id} ${s.glyph_pua ? `(${s.glyph_pua})` : ''} ${s.variant_of ? `variant of ${s.variant_of}` : ''} ${s.notes || ''}`.trim()
  );

  try {
    const ollamaRes = await fetch(`${config.ollamaHost}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: embedModel, input: texts }),
      signal: AbortSignal.timeout(60000),
    });

    if (!ollamaRes.ok) throw new Error(`embed failed: ${ollamaRes.status}`);
    const { embeddings } = await ollamaRes.json();

    if (!embeddings || embeddings.length === 0) {
      return clusterByStructure(signs);
    }

    // K-means clustering (simple implementation)
    const k = Math.min(Math.ceil(signs.length / 5), 20); // auto-determine k
    const assignments = kMeans(embeddings, k);

    // Group signs by cluster assignment
    const clusterMap = new Map();
    for (let i = 0; i < signs.length; i++) {
      const clusterId = assignments[i];
      if (!clusterMap.has(clusterId)) clusterMap.set(clusterId, []);
      clusterMap.get(clusterId).push(signs[i]);
    }

    return [...clusterMap.entries()].map(([idx, members]) => ({
      cluster_id: `cluster_${idx}`,
      centroid_sign: members[0].id,
      size: members.length,
      method: 'embedding',
      members: members.map(m => ({ sign_id: m.id, glyph_pua: m.glyph_pua, variant_of: m.variant_of })),
    })).sort((a, b) => b.size - a.size);
  } catch (err) {
    logger.warn({ err: err.message }, 'embedding cluster failed, falling back to structural');
    return clusterByStructure(signs);
  }
}

/**
 * Simple K-means clustering implementation.
 * Returns array of cluster assignments (0-indexed).
 */
function kMeans(vectors, k, maxIter = 50) {
  const n = vectors.length;
  const dim = vectors[0].length;
  if (n <= k) return vectors.map((_, i) => i);

  // Initialize centroids (k-means++ initialization)
  const centroids = [vectors[Math.floor(Math.random() * n)].slice()];
  for (let c = 1; c < k; c++) {
    const dists = vectors.map(v => {
      let minDist = Infinity;
      for (const cent of centroids) {
        let d = 0;
        for (let i = 0; i < dim; i++) d += (v[i] - cent[i]) ** 2;
        minDist = Math.min(minDist, d);
      }
      return minDist;
    });
    const totalDist = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalDist;
    for (let i = 0; i < n; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push(vectors[i].slice()); break; }
    }
    if (centroids.length === c) centroids.push(vectors[Math.floor(Math.random() * n)].slice());
  }

  let assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign each point to nearest centroid
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bestDist = Infinity, bestC = 0;
      for (let c = 0; c < k; c++) {
        let d = 0;
        for (let j = 0; j < dim; j++) d += (vectors[i][j] - centroids[c][j]) ** 2;
        if (d < bestDist) { bestDist = d; bestC = c; }
      }
      if (assignments[i] !== bestC) { assignments[i] = bestC; changed = true; }
    }
    if (!changed) break;

    // Update centroids
    for (let c = 0; c < k; c++) {
      const members = vectors.filter((_, i) => assignments[i] === c);
      if (members.length === 0) continue;
      for (let j = 0; j < dim; j++) {
        centroids[c][j] = members.reduce((sum, v) => sum + v[j], 0) / members.length;
      }
    }
  }

  return assignments;
}
