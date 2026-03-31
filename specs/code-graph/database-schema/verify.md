# Verification: Database Schema

## Requirements

### Requirement: Node tables

#### Scenario: File node stored and retrieved

- **GIVEN** a `FileNode` with path `core:src/index.ts` and workspace `core`
- **WHEN** it is upserted and then retrieved by path
- **THEN** all fields (path, language, contentHash, workspace) are preserved

#### Scenario: Spec node stores description and content

- **GIVEN** a `SpecNode` with title, description, content, and contentHash
- **WHEN** it is upserted and then retrieved by specId
- **THEN** all fields including description and content are preserved

#### Scenario: Symbol comment stored as empty string when absent

- **GIVEN** a symbol with no preceding comment
- **WHEN** it is stored
- **THEN** the `comment` column contains an empty string, not NULL

### Requirement: Full-text search indexes

#### Scenario: Symbol FTS search by name

- **GIVEN** symbols `createUser`, `deleteUser`, `listOrders` are indexed
- **WHEN** `QUERY_FTS_INDEX('Symbol', 'symbol_fts', 'user')` is called
- **THEN** `createUser` and `deleteUser` are returned with BM25 scores
- **AND** `listOrders` is not returned

#### Scenario: Symbol FTS search by comment

- **GIVEN** a symbol with comment `/** Validates the user's authentication token */`
- **WHEN** `QUERY_FTS_INDEX('Symbol', 'symbol_fts', 'authentication token')` is called
- **THEN** the symbol is returned

#### Scenario: Spec FTS search by content

- **GIVEN** a spec with content containing "lifecycle state transition"
- **WHEN** `QUERY_FTS_INDEX('Spec', 'spec_fts', 'lifecycle transition')` is called
- **THEN** the spec is returned with a BM25 score

#### Scenario: Spec FTS search by description

- **GIVEN** a spec with description "Defines the adapter interface for language-specific parsing"
- **WHEN** `QUERY_FTS_INDEX('Spec', 'spec_fts', 'adapter parsing')` is called
- **THEN** the spec is returned

#### Scenario: FTS indexes are idempotent

- **WHEN** `open()` is called twice on the same database
- **THEN** no error occurs — FTS index creation is skipped if already exists

### Requirement: Schema versioning

#### Scenario: Schema version 6

- **WHEN** a fresh database is opened
- **THEN** the schema version stored in the Meta table is `6`

#### Scenario: Old schema requires force re-index

- **GIVEN** a database created with schema version 5
- **WHEN** the application opens it expecting version 6
- **THEN** a `--force` re-index is required to rebuild

### Requirement: Relationship tables

#### Scenario: DEPENDS_ON connects specs

- **GIVEN** spec A depends on spec B
- **WHEN** a DEPENDS_ON relation is created
- **THEN** querying spec A's dependencies returns spec B

#### Scenario: COVERS table exists but is empty

- **WHEN** the database schema is initialized
- **THEN** the COVERS relationship table exists
- **AND** it contains no rows (v2+ feature)

#### Scenario: Hierarchy relationship tables exist

- **WHEN** the database schema is initialized
- **THEN** `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` relationship tables exist
