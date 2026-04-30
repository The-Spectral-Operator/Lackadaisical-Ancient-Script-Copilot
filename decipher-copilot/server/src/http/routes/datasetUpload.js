/**
 * Dataset Upload API — allows users to upload JSON/CSV datasets from the frontend.
 * Parses, validates, and imports into the system database as lexicon entries or corpus inscriptions.
 *
 * POST /api/datasets/upload     - Upload a JSON or CSV dataset file
 * GET  /api/datasets            - List uploaded datasets
 * GET  /api/datasets/:id        - Get upload status/details
 * DELETE /api/datasets/:id      - Remove an uploaded dataset
 */
import { parseBody } from '../middleware.js';
import { ulid } from '../../util/ids.js';

export function createDatasetUploadRoute(db, config, logger) {
  // Ensure table exists
  try {
    db.system.exec(`
      CREATE TABLE IF NOT EXISTS dataset_uploads (
        id              TEXT PRIMARY KEY,
        filename        TEXT NOT NULL,
        file_type       TEXT NOT NULL DEFAULT 'json',
        script_id       TEXT,
        lexicon_id      TEXT,
        corpus_id       TEXT,
        entry_count     INTEGER NOT NULL DEFAULT 0,
        status          TEXT NOT NULL DEFAULT 'processing',
        error_message   TEXT,
        metadata_json   TEXT NOT NULL DEFAULT '{}',
        created_at      INTEGER NOT NULL,
        completed_at    INTEGER
      );
    `);
  } catch { /* may already exist */ }

  return {
    /**
     * POST /api/datasets/upload
     * Accepts raw JSON body: {
     *   filename: string,
     *   content: string (raw file content - JSON or CSV text),
     *   file_type?: 'json' | 'csv',
     *   target?: 'lexicon' | 'corpus' | 'auto',
     *   script_id?: string,
     *   name?: string,
     * }
     */
    async upload(req, res) {
      const body = await parseBody(req);
      const { filename, content, file_type, target = 'auto', script_id, name } = body;

      if (!content) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'content is required (raw file text)' }));
        return;
      }

      const uploadId = ulid();
      const now = Date.now();
      const detectedType = file_type || (filename?.endsWith('.csv') ? 'csv' : 'json');
      const displayName = name || filename || `upload_${uploadId}`;

      // Record the upload
      try {
        db.system.prepare(`
          INSERT INTO dataset_uploads (id, filename, file_type, script_id, status, metadata_json, created_at)
          VALUES (?, ?, ?, ?, 'processing', ?, ?)
        `).run(uploadId, displayName, detectedType, script_id || null, JSON.stringify({ target, original_filename: filename }), now);
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'failed to record upload', message: err.message }));
        return;
      }

      try {
        let entries;
        if (detectedType === 'csv') {
          entries = parseCsvContent(content);
        } else {
          entries = parseJsonContent(content);
        }

        if (!entries || entries.length === 0) {
          updateUploadStatus(db, uploadId, 'error', 0, 'No valid entries found in file');
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'no_entries', message: 'No valid entries could be parsed from the file', upload_id: uploadId }));
          return;
        }

        // Determine target: lexicon entries or corpus inscriptions
        const effectiveTarget = target === 'auto' ? detectTarget(entries) : target;
        let importedCount = 0;
        let lexiconId = null;
        let corpusId = null;

        if (effectiveTarget === 'corpus') {
          // Create corpus and import as inscriptions
          corpusId = ulid();
          db.system.prepare('INSERT INTO corpora (id, script_id, name, source, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(corpusId, script_id || 'uploaded', displayName, `Upload ${uploadId}`, now);

          for (const entry of entries) {
            const inscId = ulid();
            const transcription = entry.transcription || entry.text || entry.signs || entry.token || '';
            const reference = entry.reference || entry.id || entry.name || `${displayName}_${importedCount + 1}`;
            try {
              db.system.prepare(`
                INSERT INTO inscriptions (id, corpus_id, reference, transcription, raw_text, metadata_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(inscId, corpusId, reference, transcription, entry.raw_text || '', JSON.stringify(entry.metadata || {}), now);
              importedCount++;
            } catch { /* skip duplicates */ }
          }
        } else {
          // Create lexicon and import as lexicon entries
          lexiconId = ulid();
          db.system.prepare('INSERT INTO lexicons (id, script_id, name, created_at) VALUES (?, ?, ?, ?)')
            .run(lexiconId, script_id || 'uploaded', displayName, now);

          for (const entry of entries) {
            const entryId = ulid();
            const token = entry.token || entry.sign || entry.glyph || entry.id || entry.unicode || '';
            const gloss = entry.gloss || entry.meaning || entry.translation || entry.definition || entry.value || '';
            if (!token && !gloss) continue;
            try {
              db.system.prepare(`
                INSERT INTO lexicon_entries (id, lexicon_id, token, gloss, pos, confidence, source, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(entryId, lexiconId, token, gloss, entry.pos || entry.part_of_speech || null,
                entry.confidence || 0.5, entry.source || displayName, entry.notes || null, now, now);
              importedCount++;
            } catch { /* skip */ }
          }
        }

        // Update upload record
        db.system.prepare(`
          UPDATE dataset_uploads SET status = 'completed', entry_count = ?, lexicon_id = ?, corpus_id = ?, completed_at = ?
          WHERE id = ?
        `).run(importedCount, lexiconId, corpusId, Date.now(), uploadId);

        logger.info({ uploadId, filename: displayName, entries: importedCount, target: effectiveTarget }, 'dataset uploaded');

        res.writeHead(200);
        res.end(JSON.stringify({
          upload_id: uploadId,
          status: 'completed',
          filename: displayName,
          target: effectiveTarget,
          entry_count: importedCount,
          total_parsed: entries.length,
          lexicon_id: lexiconId,
          corpus_id: corpusId,
          script_id: script_id || 'uploaded',
        }));
      } catch (err) {
        updateUploadStatus(db, uploadId, 'error', 0, err.message);
        logger.error({ err: err.message, uploadId }, 'dataset upload error');
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'import_failed', message: err.message, upload_id: uploadId }));
      }
    },

    /**
     * GET /api/datasets
     * Lists all uploaded datasets.
     */
    list(_req, res) {
      try {
        const uploads = db.system.prepare(
          'SELECT * FROM dataset_uploads ORDER BY created_at DESC LIMIT 100'
        ).all();
        res.writeHead(200);
        res.end(JSON.stringify({ uploads }));
      } catch {
        res.writeHead(200);
        res.end(JSON.stringify({ uploads: [] }));
      }
    },

    /**
     * GET /api/datasets/:id
     */
    get(_req, res, path) {
      const id = path.split('/').pop();
      try {
        const upload = db.system.prepare('SELECT * FROM dataset_uploads WHERE id = ?').get(id);
        if (!upload) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
        res.writeHead(200);
        res.end(JSON.stringify(upload));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    /**
     * DELETE /api/datasets/:id
     * Removes the upload record and associated data.
     */
    async remove(req, res, path) {
      const id = path.split('/').pop();
      try {
        const upload = db.system.prepare('SELECT * FROM dataset_uploads WHERE id = ?').get(id);
        if (!upload) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }

        // Remove associated lexicon or corpus entries
        if (upload.lexicon_id) {
          db.system.prepare('DELETE FROM lexicon_entries WHERE lexicon_id = ?').run(upload.lexicon_id);
          db.system.prepare('DELETE FROM lexicons WHERE id = ?').run(upload.lexicon_id);
        }
        if (upload.corpus_id) {
          db.system.prepare('DELETE FROM inscriptions WHERE corpus_id = ?').run(upload.corpus_id);
          db.system.prepare('DELETE FROM corpora WHERE id = ?').run(upload.corpus_id);
        }

        db.system.prepare('DELETE FROM dataset_uploads WHERE id = ?').run(id);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, deleted: id }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    },
  };
}

// ─── Parsing helpers ─────────────────────────────────────────────────────────

function parseCsvContent(content) {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCsvLine(lines[0]);
  const entries = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0) continue;
    const entry = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j].trim().toLowerCase().replace(/\s+/g, '_');
      entry[key] = values[j]?.trim() || '';
    }
    entries.push(entry);
  }

  return entries;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseJsonContent(content) {
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    // Try cleaning
    const cleaned = content.replace(/,\s*([}\]])/g, '$1').replace(/\/\/[^\n]*/g, '');
    data = JSON.parse(cleaned);
  }

  // Handle various JSON structures
  if (Array.isArray(data)) return data;
  if (data.entries && Array.isArray(data.entries)) return data.entries;
  if (data.lexicon && Array.isArray(data.lexicon)) return data.lexicon;
  if (data.signs && Array.isArray(data.signs)) return data.signs;
  if (data.inscriptions && Array.isArray(data.inscriptions)) return data.inscriptions;

  // Object-keyed entries
  const entries = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'metadata' || key === '_metadata' || key === 'license') continue;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      entries.push({ token: key, ...value });
    } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      entries.push(...value);
    }
  }

  return entries;
}

function detectTarget(entries) {
  // If entries have transcription/text fields → corpus
  // If entries have token/gloss/meaning fields → lexicon
  let corpusScore = 0;
  let lexiconScore = 0;
  const sample = entries.slice(0, 20);

  for (const entry of sample) {
    if (entry.transcription || entry.signs || entry.inscription) corpusScore++;
    if (entry.token || entry.gloss || entry.meaning || entry.translation || entry.definition) lexiconScore++;
    if (entry.reference || entry.text) corpusScore += 0.5;
  }

  return corpusScore > lexiconScore ? 'corpus' : 'lexicon';
}

function updateUploadStatus(db, id, status, count, errorMessage) {
  try {
    db.system.prepare(`
      UPDATE dataset_uploads SET status = ?, entry_count = ?, error_message = ?, completed_at = ?
      WHERE id = ?
    `).run(status, count, errorMessage || null, Date.now(), id);
  } catch { /* non-fatal */ }
}
