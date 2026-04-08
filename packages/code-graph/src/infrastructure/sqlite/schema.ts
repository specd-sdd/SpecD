export const SQLITE_SCHEMA_VERSION = 1

export const SQLITE_SCHEMA_DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  workspace TEXT NOT NULL,
  embedding BLOB
);

CREATE TABLE IF NOT EXISTS symbols (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line INTEGER NOT NULL,
  column_number INTEGER NOT NULL,
  comment TEXT,
  search_text TEXT NOT NULL,
  FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS specs (
  spec_id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  depends_on_json TEXT NOT NULL,
  workspace TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relations (
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  type TEXT NOT NULL,
  metadata_json TEXT,
  PRIMARY KEY (source, target, type)
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_symbols_file_path ON symbols(file_path);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
CREATE INDEX IF NOT EXISTS idx_specs_workspace ON specs(workspace);
CREATE INDEX IF NOT EXISTS idx_relations_source_type ON relations(source, type);
CREATE INDEX IF NOT EXISTS idx_relations_target_type ON relations(target, type);
CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(type);

CREATE VIRTUAL TABLE IF NOT EXISTS symbol_fts USING fts5(
  id UNINDEXED,
  search_text,
  comment,
  tokenize = 'porter'
);

CREATE VIRTUAL TABLE IF NOT EXISTS spec_fts USING fts5(
  spec_id UNINDEXED,
  title,
  description,
  content,
  tokenize = 'porter'
);
`
