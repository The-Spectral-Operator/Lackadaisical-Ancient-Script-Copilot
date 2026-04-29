CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT    PRIMARY KEY,
  title           TEXT    NOT NULL,
  script          TEXT,
  model           TEXT    NOT NULL,
  model_digest    TEXT    NOT NULL DEFAULT '',
  system_prompt   TEXT,
  options_json    TEXT    NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  archived        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id                 TEXT    PRIMARY KEY,
  session_id         TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  parent_id          TEXT,
  role               TEXT    NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content            TEXT    NOT NULL,
  thinking           TEXT,
  tool_name          TEXT,
  tool_call_id       TEXT,
  tool_calls_json    TEXT,
  format_schema_json TEXT,
  prompt_tokens      INTEGER,
  completion_tokens  INTEGER,
  total_duration_ns  INTEGER,
  load_duration_ns   INTEGER,
  prompt_eval_ns     INTEGER,
  eval_ns            INTEGER,
  done_reason        TEXT,
  created_at         INTEGER NOT NULL,
  finished_at        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS attachments (
  id           TEXT    PRIMARY KEY,
  message_id   TEXT    NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind         TEXT    NOT NULL,
  filename     TEXT    NOT NULL,
  mime         TEXT    NOT NULL,
  bytes        INTEGER NOT NULL,
  sha256_hex   TEXT    NOT NULL,
  storage_path TEXT    NOT NULL,
  width        INTEGER,
  height       INTEGER,
  pages        INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attach_msg ON attachments(message_id);

CREATE TABLE IF NOT EXISTS message_audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  prompt_sha256 TEXT NOT NULL,
  request_json  TEXT NOT NULL,
  endpoint      TEXT NOT NULL,
  ollama_version TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL
);
