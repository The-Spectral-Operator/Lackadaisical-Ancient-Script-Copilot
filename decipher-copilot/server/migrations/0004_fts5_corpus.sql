-- 0004: FTS5 virtual table for inscription full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS inscriptions_fts USING fts5(
  reference,
  transcription,
  raw_text,
  content='inscriptions',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS inscriptions_ai AFTER INSERT ON inscriptions BEGIN
  INSERT INTO inscriptions_fts(rowid, reference, transcription, raw_text)
  VALUES (new.rowid, new.reference, new.transcription, new.raw_text);
END;

CREATE TRIGGER IF NOT EXISTS inscriptions_ad AFTER DELETE ON inscriptions BEGIN
  INSERT INTO inscriptions_fts(inscriptions_fts, rowid, reference, transcription, raw_text)
  VALUES ('delete', old.rowid, old.reference, old.transcription, old.raw_text);
END;

CREATE TRIGGER IF NOT EXISTS inscriptions_au AFTER UPDATE ON inscriptions BEGIN
  INSERT INTO inscriptions_fts(inscriptions_fts, rowid, reference, transcription, raw_text)
  VALUES ('delete', old.rowid, old.reference, old.transcription, old.raw_text);
  INSERT INTO inscriptions_fts(rowid, reference, transcription, raw_text)
  VALUES (new.rowid, new.reference, new.transcription, new.raw_text);
END;
