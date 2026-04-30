-- Cross-script correlation results
CREATE TABLE IF NOT EXISTS cross_script_correlations (
  id              TEXT PRIMARY KEY,
  script_a_id     TEXT NOT NULL,
  script_b_id     TEXT NOT NULL,
  method          TEXT NOT NULL DEFAULT 'frequency',
  score           REAL NOT NULL DEFAULT 0.0,
  details_json    TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_corr_scripts ON cross_script_correlations(script_a_id, script_b_id);

-- Glyph chain detection results
CREATE TABLE IF NOT EXISTS glyph_chains (
  id              TEXT PRIMARY KEY,
  corpus_id       TEXT NOT NULL,
  chain_type      TEXT NOT NULL DEFAULT 'bigram',
  chain_tokens    TEXT NOT NULL,
  frequency       INTEGER NOT NULL DEFAULT 1,
  mutual_info     REAL NOT NULL DEFAULT 0.0,
  context_json    TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chains_corpus ON glyph_chains(corpus_id);
CREATE INDEX IF NOT EXISTS idx_chains_tokens ON glyph_chains(chain_tokens);

-- Dataset uploads (user-uploaded JSON/CSV datasets)
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

-- Script family/region organization
CREATE TABLE IF NOT EXISTS script_families (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  parent_id       TEXT,
  region          TEXT,
  era_start       TEXT,
  era_end         TEXT,
  description     TEXT,
  created_at      INTEGER NOT NULL
);

-- Link scripts to families
ALTER TABLE scripts ADD COLUMN family_id TEXT REFERENCES script_families(id);
ALTER TABLE scripts ADD COLUMN writing_type TEXT;
ALTER TABLE scripts ADD COLUMN status TEXT DEFAULT 'undeciphered';
