export const SQLITE_SCHEMA_VERSION = 9

export const SQLITE_SCHEMA_DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  config_relative_path TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  workspace TEXT NOT NULL,
  embedding BLOB,
  content TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  path TEXT PRIMARY KEY,
  config_relative_path TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  workspace TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS symbols (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  file_path TEXT NOT NULL,
  parent_id TEXT,
  line INTEGER NOT NULL,
  column_number INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  selection_start_line INTEGER NOT NULL,
  selection_start_column INTEGER NOT NULL,
  selection_end_line INTEGER NOT NULL,
  selection_end_column INTEGER NOT NULL,
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

CREATE TABLE IF NOT EXISTS logical_symbols (
  id TEXT PRIMARY KEY,
  workspace TEXT NOT NULL,
  surface TEXT NOT NULL,
  name TEXT NOT NULL,
  space TEXT NOT NULL,
  owner_id TEXT,
  member_form TEXT
);

CREATE TABLE IF NOT EXISTS logical_declarations (
  logical_symbol_id TEXT NOT NULL,
  symbol_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line INTEGER NOT NULL,
  column_number INTEGER NOT NULL,
  end_line INTEGER,
  end_column INTEGER,
  kind TEXT NOT NULL,
  PRIMARY KEY (logical_symbol_id, symbol_id),
  FOREIGN KEY (logical_symbol_id) REFERENCES logical_symbols(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public_bindings (
  id TEXT PRIMARY KEY,
  surface TEXT NOT NULL,
  exported_name TEXT NOT NULL,
  space TEXT NOT NULL,
  target_id TEXT
);

CREATE TABLE IF NOT EXISTS local_bindings (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  local_name TEXT NOT NULL,
  space TEXT NOT NULL,
  target_id TEXT
);

CREATE TABLE IF NOT EXISTS resolution_steps (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, kind)
);

CREATE TABLE IF NOT EXISTS index_coverage (
  file_path TEXT PRIMARY KEY,
  content_hash TEXT,
  status TEXT NOT NULL,
  reason TEXT,
  capabilities_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS indexed_input_observations (
  workspace TEXT NOT NULL,
  resource_kind TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  input_kind TEXT NOT NULL,
  input_locator TEXT NOT NULL,
  indexed_content_hash TEXT NOT NULL,
  last_observed_mtime REAL,
  last_observed_size INTEGER,
  last_observed_revision TEXT,
  generation TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace, resource_kind, resource_id, input_kind, input_locator)
);

CREATE TABLE IF NOT EXISTS freshness_latches (
  workspace TEXT PRIMARY KEY,
  known_stale INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_files_config_relative_path ON files(config_relative_path);
CREATE INDEX IF NOT EXISTS idx_documents_config_relative_path ON documents(config_relative_path);
CREATE INDEX IF NOT EXISTS idx_symbols_file_path ON symbols(file_path);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_name_nocase ON symbols(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_specs_workspace ON specs(workspace);
CREATE INDEX IF NOT EXISTS idx_relations_source_type ON relations(source, type);
CREATE INDEX IF NOT EXISTS idx_relations_target_type ON relations(target, type);
CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(type);
CREATE INDEX IF NOT EXISTS idx_logical_symbols_lookup ON logical_symbols(workspace, surface, name, space);
CREATE INDEX IF NOT EXISTS idx_logical_symbols_member_lookup ON logical_symbols(workspace, surface, name, space, owner_id, member_form);
CREATE INDEX IF NOT EXISTS idx_logical_declarations_symbol ON logical_declarations(symbol_id);
CREATE INDEX IF NOT EXISTS idx_public_bindings_lookup ON public_bindings(surface, exported_name, space);
CREATE INDEX IF NOT EXISTS idx_public_bindings_name ON public_bindings(exported_name, surface, space);
CREATE INDEX IF NOT EXISTS idx_local_bindings_lookup ON local_bindings(file_path, scope_id, local_name, space);
CREATE INDEX IF NOT EXISTS idx_resolution_steps_from ON resolution_steps(from_id, to_id, kind);
CREATE INDEX IF NOT EXISTS idx_indexed_inputs_resource ON indexed_input_observations(workspace, resource_kind, resource_id);
CREATE INDEX IF NOT EXISTS idx_indexed_inputs_locator ON indexed_input_observations(workspace, input_locator);

CREATE VIRTUAL TABLE IF NOT EXISTS symbol_fts USING fts5(
  id UNINDEXED,
  search_text,
  comment,
  tokenize = 'porter'
);

CREATE VIRTUAL TABLE IF NOT EXISTS spec_fts USING fts5(
  spec_id,
  title,
  description,
  content,
  tokenize = 'porter'
);

CREATE VIRTUAL TABLE IF NOT EXISTS document_fts USING fts5(
  path,
  config_relative_path,
  content,
  tokenize = 'porter'
);

CREATE VIRTUAL TABLE IF NOT EXISTS file_content_fts USING fts5(
  path UNINDEXED,
  content,
  tokenize = 'trigram'
);
`
