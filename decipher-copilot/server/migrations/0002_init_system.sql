CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash  TEXT    NOT NULL UNIQUE,
  label       TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  last_used   INTEGER
);

CREATE TABLE IF NOT EXISTS models (
  name             TEXT PRIMARY KEY,
  digest           TEXT NOT NULL DEFAULT '',
  family           TEXT,
  parameter_size   TEXT,
  quantization     TEXT,
  context_length   INTEGER,
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  template         TEXT,
  parameters       TEXT,
  last_seen_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scripts (
  id          TEXT PRIMARY KEY,
  display     TEXT NOT NULL,
  era         TEXT,
  region      TEXT,
  notes       TEXT
);

CREATE TABLE IF NOT EXISTS signs (
  id          TEXT PRIMARY KEY,
  script_id   TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  glyph_pua   TEXT,
  image_path  TEXT,
  variant_of  TEXT,
  notes       TEXT
);
CREATE INDEX IF NOT EXISTS idx_signs_script ON signs(script_id);

CREATE TABLE IF NOT EXISTS corpora (
  id          TEXT PRIMARY KEY,
  script_id   TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  source      TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inscriptions (
  id           TEXT PRIMARY KEY,
  corpus_id    TEXT NOT NULL REFERENCES corpora(id) ON DELETE CASCADE,
  reference    TEXT NOT NULL,
  transcription TEXT NOT NULL,
  raw_text     TEXT,
  image_path   TEXT,
  metadata_json TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inscr_corpus ON inscriptions(corpus_id);

CREATE TABLE IF NOT EXISTS lexicons (
  id          TEXT PRIMARY KEY,
  script_id   TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lexicon_entries (
  id           TEXT PRIMARY KEY,
  lexicon_id   TEXT NOT NULL REFERENCES lexicons(id) ON DELETE CASCADE,
  token        TEXT NOT NULL,
  gloss        TEXT,
  pos          TEXT,
  confidence   REAL NOT NULL DEFAULT 0.0,
  source       TEXT,
  notes        TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lex_token ON lexicon_entries(lexicon_id, token);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  corpus_id    TEXT REFERENCES corpora(id) ON DELETE CASCADE,
  inputs_json  TEXT NOT NULL,
  results_json TEXT NOT NULL,
  duration_ms  INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  script_id   TEXT,
  description TEXT,
  state_json  TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
