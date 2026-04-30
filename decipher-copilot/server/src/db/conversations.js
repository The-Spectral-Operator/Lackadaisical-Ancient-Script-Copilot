/**
 * Prepared-statement cache for conversations.db
 * All chat sessions, messages, attachments, audit records.
 */

export function createConversationsDb(db) {
  return {
    // Sessions
    sessions: {
      list: db.prepare(`
        SELECT id, title, script, model, created_at, updated_at, archived
        FROM sessions ORDER BY updated_at DESC LIMIT 100
      `),
      get: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
      create: db.prepare(`
        INSERT INTO sessions (id, title, script, model, model_digest, system_prompt,
                              options_json, created_at, updated_at, archived)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `),
      update: db.prepare(`UPDATE sessions SET title=?, updated_at=? WHERE id=?`),
      setModel: db.prepare(`UPDATE sessions SET model=?, updated_at=? WHERE id=?`),
      setScript: db.prepare(`UPDATE sessions SET script=?, updated_at=? WHERE id=?`),
      archive: db.prepare(`UPDATE sessions SET archived=?, updated_at=? WHERE id=?`),
      remove: db.prepare(`DELETE FROM sessions WHERE id=?`),
      touch: db.prepare(`UPDATE sessions SET updated_at=? WHERE id=?`),
    },

    // Messages
    messages: {
      list: db.prepare(`
        SELECT * FROM messages WHERE session_id=? ORDER BY created_at ASC
      `),
      listPaginated: db.prepare(`
        SELECT * FROM messages WHERE session_id=? ORDER BY created_at ASC
        LIMIT ? OFFSET ?
      `),
      get: db.prepare(`SELECT * FROM messages WHERE id=?`),
      create: db.prepare(`
        INSERT INTO messages
          (id, session_id, parent_id, role, content, thinking, tool_name, tool_call_id,
           tool_calls_json, format_schema_json, prompt_tokens, completion_tokens,
           total_duration_ns, load_duration_ns, prompt_eval_ns, eval_ns,
           done_reason, created_at, finished_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `),
      updateContent: db.prepare(`UPDATE messages SET content=?, finished_at=? WHERE id=?`),
      updateThinking: db.prepare(`UPDATE messages SET thinking=? WHERE id=?`),
      updateStats: db.prepare(`
        UPDATE messages SET prompt_tokens=?, completion_tokens=?, total_duration_ns=?,
          load_duration_ns=?, prompt_eval_ns=?, eval_ns=?, done_reason=?, finished_at=?
        WHERE id=?
      `),
    },

    // Attachments
    attachments: {
      get: db.prepare(`SELECT * FROM attachments WHERE id=?`),
      listForMessage: db.prepare(`SELECT * FROM attachments WHERE message_id=? ORDER BY created_at`),
      create: db.prepare(`
        INSERT INTO attachments
          (id, message_id, kind, filename, mime, bytes, sha256_hex, storage_path,
           width, height, pages, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `),
    },

    // Audit
    audit: {
      create: db.prepare(`
        INSERT INTO message_audit
          (message_id, prompt_sha256, request_json, endpoint, ollama_version, created_at)
        VALUES (?,?,?,?,?,?)
      `),
    },
  };
}
