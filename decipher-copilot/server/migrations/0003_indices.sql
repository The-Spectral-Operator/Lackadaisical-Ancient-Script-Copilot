-- 0003: Additional indices for performance
CREATE INDEX IF NOT EXISTS idx_sessions_script ON sessions(script);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(session_id, role);
CREATE INDEX IF NOT EXISTS idx_audit_msg ON message_audit(message_id);
CREATE INDEX IF NOT EXISTS idx_runs_corpus_kind ON analysis_runs(corpus_id, kind);
