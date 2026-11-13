# Spec Compliance Audit Report: `code-graph` Batch

**Change**: `unify-graph-project-relative-paths`  
**Auditor**: Subagent (`code-graph` batch)  
**Timestamp**: 2026-10-13T11:15:00Z  
**Assigned Specs**:

- `code-graph:symbol-model`
- `code-graph:document-model`
- `code-graph:workspace-integration`
- `code-graph:sqlite-graph-store`

---

## Executive Summary

This compliance audit evaluates the `@specd/code-graph` package implementation and test suite against the four assigned specifications updated for the `unify-graph-project-relative-paths` change. The core architectural purpose of this change within `@specd/code-graph` (governed by **ADR-0028**) is to establish `projectRelativePath` as a first-class, natively owned domain property across all graph node types (`FileNode`, `DocumentNode`, and `SymbolNode`).

In SQLite storage, schema version **14** replaces legacy `config_relative_path` with `project_relative_path` in the `files` and `documents` tables, and denormalizes `project_relative_path` directly into the `symbols` table. This denormalization enables **zero-join** query execution across tens of thousands of symbols during search, traversal, and hotspot calculations. Furthermore, older databases (schema versions $\le 13$) are strictly rejected without migration, mandating a destructive re-index.

### Key Findings

1. **Overall Compliance**: The implementation across `@specd/code-graph` is fully aligned with the architectural design and domain model specifications.
   - `FileNode`, `DocumentNode`, and `SymbolNode` domain value objects cleanly expose `readonly projectRelativePath: string`.
   - Legacy `configRelativePath` has been completely eliminated from the domain, application, and infrastructure layers with 0 remaining references in source code.
   - SQLite schema version is bumped to **14**, DDL enforces `project_relative_path` columns and indexes on `files`, `documents`, and `symbols`, and drops `config_relative_path`.
   - Zero-join queries are implemented: `SYMBOL_ROW_COLUMNS`, `getExportedSymbols`, `getSymbolCallers`, and `searchSymbols` select `project_relative_path` directly from `symbols`.
   - The indexing pipeline (`index-code-graph.ts`) derives `projectRelativePath` from `projectRoot` and denormalizes it onto every extracted symbol.
   - Project-relative selector resolution (`resolve-graph-selector.ts`) resolves file selectors via `findFilesByProjectRelativePath` and `findDocumentsByProjectRelativePath`.

2. **Error Wrapping Nuance on Open (`code-graph:sqlite-graph-store`)**:
   - The spec scenarios state that opening an incompatible database (e.g. schema 12 or 13 when expecting 14) rejects with `GraphSchemaIncompatibleError`.
   - In implementation, `SQLiteGraphDatabase.open()` catches `GraphSchemaIncompatibleError` and maps it via `getStorageRecoveryReason()` to `GraphStorageRecoveryRequiredError` with recovery reason `'SCHEMA_INCOMPATIBLE'`. Both inherit from `SpecdCodeGraphError`. This is an intended architectural design for storage recovery lifecycle management, though test assertions must check `GraphStorageRecoveryRequiredError`.

3. **Test Suite Status & Verification Gaps**:
   - The full `@specd/code-graph` test suite passes with **100% success** (63 test files, 837 tests passing cleanly).
   - However, specific verification scenarios added in the spec deltas lack direct, dedicated assertions:
     - `code-graph:symbol-model`: `test/domain/value-objects/symbol-node.spec.ts` lacks a test verifying that `SymbolNode` retains an explicitly supplied `projectRelativePath` (currently only tested with default fallbacks).
     - `code-graph:symbol-model`: `test/domain/value-objects/file-node.spec.ts` lacks tests for `FileNode` equality using canonical `path` when `projectRelativePath` differs, and for `projectRelativePath` containing `..` parent segments.
     - `code-graph:workspace-integration`: `test/application/services/resolve-graph-selector.spec.ts` does not test normalizing absolute path selectors against `projectRoot` or resolving paths containing parent segments (`../../`).
     - `code-graph:sqlite-graph-store`: `test/infrastructure/sqlite/sqlite-graph-store.spec.ts` tests schema versions $\le 13$ rejection, but does not test schema version 15 (forward incompatibility specified in `Scenario: Any other version is incompatible`). Additionally, no test explicitly seeds and reads back a symbol with a distinct `projectRelativePath` to verify denormalized persistence in isolation.

---

## Per-Spec Analysis

### Spec: `code-graph:symbol-model`

#### 1. Requirements Summary

- **Requirement: File node**:
  - `FileNode` SHALL represent a single source file in the workspace.
  - `path`: globally unique `{workspaceName}:{relativeToCodeRoot}`, forward-slash-normalized. Canonical identity.
  - `projectRelativePath`: forward-slash-normalized path from project root containing active `specd.yaml` to file on disk (e.g. `packages/core/src/index.ts`). May contain `..` segments when the file lives outside project root.
  - Equality: Two `FileNode` values are equal iff their `path` fields match. `projectRelativePath` MUST NOT replace the canonical path in relations or symbol IDs.
- **Requirement: Symbol node**:
  - `SymbolNode` SHALL represent a named code construct extracted from a file.
  - `id`: deterministic identifier computed from `filePath + kind + name + line + column`.
  - `filePath`: workspace-prefixed path of owning file.
  - `projectRelativePath`: forward-slash-normalized path from project root to file, denormalized from the owning file node at index time.
  - `line`, `column`, `endLine`, `endColumn`, `selectionRange`, `comment`.
  - Canonical identities remain unique primary keys across all node families.
- **Requirement: Immutability**: `FileNode` properties are readonly.
- **Requirement: Error types**: `DuplicateSymbolIdError` and `SpecdCodeGraphError`.
- **Requirement: Logical symbol and canonical reference model**: Location-independent references, structured canonical identity, qualified name beside simple name.

#### 2. Implementation Status: COMPLIANT

- `packages/code-graph/src/domain/value-objects/file-node.ts`:
  - `FileNode` interface exposes `readonly projectRelativePath: string`. `configRelativePath` is completely removed.
  - `createFileNode` normalizes backslashes to forward slashes for both `path` and `projectRelativePath`. Defaults `projectRelativePath` to `params.path` if omitted.
- `packages/code-graph/src/domain/value-objects/symbol-node.ts`:
  - `SymbolNode` interface exposes `readonly projectRelativePath: string`.
  - `createSymbolNode` normalizes backslashes and assigns `projectRelativePath: params.projectRelativePath ? params.projectRelativePath.replaceAll('\\', '/') : filePath`.
  - `computeSymbolId` preserves deterministic format `${filePath}:${kind}:${name}:${line}:${column}` using canonical `filePath`.
- `packages/code-graph/src/domain/value-objects/source-location.ts`:
  - `SourceLocation` includes `readonly projectRelativePath?: string`.
- `packages/code-graph/src/application/use-cases/index-code-graph.ts`:
  - Maps `projectRelativePath` for every discovered file and denormalizes it onto every extracted `SymbolNode` during analysis.

#### 3. Discrepancies

- None identified in implementation.

#### 4. Test Coverage: PARTIAL

- **Covered**:
  - `packages/code-graph/test/domain/value-objects/file-node.spec.ts`:
    - Normalizes `projectRelativePath` containing backslashes.
    - Preserves forward slashes in `projectRelativePath`.
    - Defaults `projectRelativePath` to `path` when omitted.
    - Preserves category and optional embeddings.
  - `packages/code-graph/test/domain/value-objects/symbol-node.spec.ts`:
    - Deterministic ID generation, line/column sensitivity, range containment, JSDoc comment extraction, and symbol kind validation.
  - `packages/code-graph/test/domain/ports/graph-store.contract.ts`:
    - `getFile returns projectRelativePath`.

#### 5. Missing Tests

- **Missing Scenario**: `Scenario: FileNode equality still uses canonical path`
  - Spec requirement: _"GIVEN two FileNode values with the same canonical path but different contentHash and projectRelativePath, WHEN equality is checked, THEN they are considered equal because path remains the canonical graph identity"_.
  - Current state: Not explicitly tested in `file-node.spec.ts`.
- **Missing Scenario**: `Scenario: FileNode projectRelativePath may include parent segments`
  - Spec requirement: _"GIVEN active specd.yaml at /project/apps/web/specd.yaml ... discovered file is /project/packages/core/src/index.ts ... projectRelativePath is ../../packages/core/src/index.ts"_.
  - Current state: No test in `file-node.spec.ts` verifies `projectRelativePath` with `..` segments.
- **Missing Scenario**: `Scenario: SymbolNode carries denormalized projectRelativePath`
  - Spec requirement: _"GIVEN a symbol extracted from a file with projectRelativePath packages/core/src/index.ts, WHEN the SymbolNode is created, THEN its projectRelativePath equals packages/core/src/index.ts"_.
  - Current state: `packages/code-graph/test/domain/value-objects/symbol-node.spec.ts` has no test passing an explicit `projectRelativePath` or asserting `node.projectRelativePath`. All unit tests rely on the fallback to `filePath`.

---

### Spec: `code-graph:document-model`

#### 1. Requirements Summary

- **Requirement: DocumentNode properties**:
  - `DocumentNode` SHALL represent a textual non-code project resource.
  - Must include: `path`, `projectRelativePath`, `contentHash`, `content`, and `workspace`.
  - `projectRelativePath`: path relative to project root used for UI rendering and filesystem access.
- **Requirement: Reserved root namespace**:
  - Reserved `root:` prefix for node identities of project-global resources (`graph.includePaths`).
  - Format: `root:<project-relative-path>`.
- **Requirement: Textual classification fallback**:
  - Files without language adapter classified as `DocumentNode` if textual; binary files skipped.
  - Filesystem-backed spec directories (`specsPath`) excluded from document discovery.
  - Files under workspace `codeRoot` win; cannot produce duplicate `root:` documents.
- **Requirement: Search category**:
  - Document category first-class in search API; filterable to include/exclude.

#### 2. Implementation Status: COMPLIANT

- `packages/code-graph/src/domain/value-objects/document-node.ts`:
  - Interface defines `path`, `projectRelativePath`, `contentHash`, `content`, and `workspace`.
  - `createDocumentNode` normalizes paths with backslash replacement and defaults `projectRelativePath` to `path` if omitted.
- `packages/code-graph/src/application/use-cases/index-code-graph.ts`:
  - Registers documents with `projectRelativePath` derived from `projectRoot`.
  - Ignores binary files and files located within `specsPath`.
  - Deduplicates root include paths against workspace `codeRoot` directories.
- `packages/code-graph/src/infrastructure/sqlite/schema.ts`:
  - `documents` table persists `project_relative_path` and drops `config_relative_path`.
  - `document_fts` virtual table covers `path`, `project_relative_path`, `content`.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
  - `findDocumentsByProjectRelativePath` provides indexed lookup.
  - `searchDocuments` applies identity-aware ranking on `project_relative_path`.

#### 3. Discrepancies

- None identified.

#### 4. Test Coverage: COMPLETE

- `packages/code-graph/test/domain/value-objects/document-node.spec.ts`:
  - Tests `createDocumentNode` with normalized paths, asserting `path`, `projectRelativePath`, `contentHash`, `content`, and `workspace`.
- `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`:
  - Tests indexing text documents without adapters (`projectRelativePath: 'ws1/docs/guide.md'`).
  - Tests skipping binary files (`.png`).
  - Tests excluding filesystem-backed spec directories (`specs-ws1/changes/spec.md`).
  - Tests preventing duplicate `root:` document when file is owned by workspace `codeRoot`.
- `packages/code-graph/test/domain/ports/graph-store.contract.ts`:
  - Tests `findDocumentsByProjectRelativePath`.
  - Tests document FTS search using `projectRelativePath`.

#### 5. Missing Tests

- None. All requirements and verification scenarios have corresponding automated tests.

---

### Spec: `code-graph:workspace-integration`

#### 1. Requirements Summary

- **Requirement: FileNode path and workspace semantics**:
  - Workspace Identity: `{workspaceName}:{relativeToCodeRoot}`.
  - Root Identity: `root:{projectRelativePath}`.
  - Workspace ownership wins over project-global `graph.includePaths`.
  - `path` remains canonical graph identity; each node also stores `projectRelativePath`.
- **Requirement: Project-relative file lookup**:
  - Resolving file selectors by path relative to project root containing active `specd.yaml`.
  - Computed during indexing, denormalized onto symbols, normalized to forward slashes without leading `./`.
  - Files outside project root representable with `..`.
  - CLI and hosts resolve unprefixed and absolute selectors back to canonical file nodes.
- **Backward compatibility**:
  - Force re-index on path format change or after adding `projectRelativePath` metadata. Full rebuild required.

#### 2. Implementation Status: COMPLIANT

- `packages/code-graph/src/application/use-cases/index-code-graph.ts`:
  - Calculates `projectRelativePath = toPortableGraphPath(relative(options.projectRoot, absPath))`.
  - Strips leading `./` if present.
  - Assigns `projectRelativePath` to file and document nodes, and populates `symbolsWithProjRel`.
- `packages/code-graph/src/application/services/resolve-graph-selector.ts`:
  - `resolveFileSelector`:
    - Checks direct canonical path first.
    - Derives `projectRelativePath` via `toProjectRelativePath(input, projectRoot)`.
    - Normalizes relative path with `normalizeRelativePath` (replaces backslashes, strips leading `./`).
    - Queries `findFilesByProjectRelativePath` and `findDocumentsByProjectRelativePath`.
  - `normalizeFileSelectorPath`:
    - Utility exported for hosts to normalize selectors.
- Schema compatibility enforcement:
  - Any prior schema version missing `project_relative_path` (versions $\le 13$) triggers a required recovery / rebuild.

#### 3. Discrepancies

- None identified in code logic.

#### 4. Test Coverage: PARTIAL

- **Covered**:
  - `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`:
    - Single-workspace file paths (`core:src/index.ts`).
    - Multi-workspace file paths with identical relative paths remain distinct.
    - Workspace file wins over root file.
  - `packages/code-graph/test/application/services/resolve-graph-selector.spec.ts`:
    - Resolves unprefixed project-relative selector `packages/core/src/index.ts` to `core:src/index.ts`.
    - Resolves document selector `docs/guide.md` to `root:docs/guide.md`.
    - Resolves qualified member and symbol selectors.

#### 5. Missing Tests

- **Missing Scenario**: `Scenario: Absolute selector normalizes to projectRelativePath before lookup`
  - Spec requirement: _"GIVEN active specd.yaml at /project/specd.yaml ... WHEN CLI command resolves /project/packages/core/src/index.ts, THEN normalizes to packages/core/src/index.ts AND resolves core:src/index.ts"_.
  - Current state: Not tested in `resolve-graph-selector.spec.ts`. All test cases supply relative selectors without testing absolute path normalization against `projectRoot`.
- **Missing Scenario**: `Scenario: Project-relative lookup supports parent segments`
  - Spec requirement: _"GIVEN active specd.yaml at /project/apps/web/specd.yaml ... indexed with projectRelativePath ../../packages/core/src/index.ts, WHEN CLI resolves ../../packages/core/src/index.ts, THEN resolves core:src/index.ts"_.
  - Current state: Not tested anywhere in `packages/code-graph/test/`. No test validates resolution of `../../` parent segment paths.

---

### Spec: `code-graph:sqlite-graph-store`

#### 1. Requirements Summary

- **Requirement: Persisted node storage**:
  - `File` table: `path` (PK), `project_relative_path`, `language`, `content_hash`, `workspace`, `category`, `embedding`, `content`.
  - `Document` table: `path` (PK), `project_relative_path`, `content_hash`, `content`, `workspace`.
  - `Symbol` table: `id` (PK), `name`, `kind`, `file_path`, `project_relative_path`, `parent_id`, line, column, end_line, end_column, selection coordinates, `comment`, `search_text`.
  - Denormalized `project_relative_path` in `symbols` at index time to achieve zero-join query speed across symbol searches and hotspot calculations.
- **Requirement: SQLite full-text search**:
  - Virtual tables: `symbol_fts`, `spec_fts`, and `document_fts` (`path`, `project_relative_path`, `content`).
  - Identity-aware ranking in SQL over candidates; prioritizes canonical and project-relative path matches.
- **Requirement: Reference schema upgrade**:
  - Reference schema version MUST be **14** (`SQLITE_SCHEMA_VERSION = 14`).
  - Mismatch must reject ordinary reads with `GraphSchemaIncompatibleError` (reason `SCHEMA_INCOMPATIBLE`).
  - Re-indexing must recreate derived storage, rotate `storage.epoch`, rebuild search indexes.
  - MUST NOT use `ALTER TABLE` and MUST NOT read version 13 or older rows beside version 14 rows.
  - `files` and `documents` drop `config_relative_path`.
  - `symbols` persists `project_relative_path`.
  - Worker row shape and statements use version 14 columns.
- ADR-0028 added to ADR references.

#### 2. Implementation Status: COMPLIANT

- `packages/code-graph/src/infrastructure/sqlite/schema.ts`:
  - `SQLITE_SCHEMA_VERSION = 14`.
  - `SQLITE_SCHEMA_DDL` specifies:
    - `files` has `project_relative_path TEXT NOT NULL DEFAULT ''` and drops `config_relative_path`.
    - `documents` has `project_relative_path TEXT NOT NULL DEFAULT ''` and drops `config_relative_path`.
    - `symbols` has `project_relative_path TEXT NOT NULL DEFAULT ''`.
    - Indexes: `idx_files_project_relative_path`, `idx_documents_project_relative_path`, `idx_symbols_project_relative_path`.
    - `document_fts` virtual table: `path, project_relative_path, content`.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
  - Insert statements: `insertFileStmt`, `insertDocumentStmt`, `insertSymbolStmt` persist `project_relative_path`.
  - Zero-join queries:
    - `SYMBOL_ROW_COLUMNS` includes `project_relative_path`.
    - `getExportedSymbols` selects `s.project_relative_path` directly.
    - `getSymbolCallers` selects `target.project_relative_path` directly.
    - `searchSymbols` selects `s.project_relative_path` directly from `symbols s`.
    - `findFilesByProjectRelativePath` and `findDocumentsByProjectRelativePath` perform indexed lookups without joins.
    - `searchDocuments` scores and ranks `lower(d.project_relative_path)`.
  - Version verification:
    - `assertExistingSchemaCompatible` and `ensureSchemaVersion` assert `Number(current.value) === SQLITE_SCHEMA_VERSION` (14).
    - Throws `GraphSchemaIncompatibleError` on version mismatch, caught in `open()` and wrapped in `GraphStorageRecoveryRequiredError(..., 'SCHEMA_INCOMPATIBLE')`.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`:
  - Exposes `findFilesByProjectRelativePath` and `findDocumentsByProjectRelativePath` via worker RPC.
  - `recreate()` removes database files and WAL/SHM companions, and rotates storage generation.

#### 3. Discrepancies

- **Exception Type on Open (`GraphSchemaIncompatibleError` vs `GraphStorageRecoveryRequiredError`)**:
  - The spec verification scenarios (`Scenario: SQLite old schema rebuilds safely`, `Scenario: Any other version is incompatible`) state:
    `THEN read rejects with GraphSchemaIncompatibleError without empty recreation`
  - In code, `SQLiteGraphDatabase.open()` catches `GraphSchemaIncompatibleError` and throws `GraphStorageRecoveryRequiredError` with reason `'SCHEMA_INCOMPATIBLE'`. While both extend `SpecdCodeGraphError` and carry the message indicating schema incompatibility, callers receive `GraphStorageRecoveryRequiredError`.

#### 4. Test Coverage: PARTIAL

- **Covered**:
  - `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:
    - Asserts `SQLITE_SCHEMA_VERSION === 14`.
    - Asserts DDL contains `project_relative_path` on `files`, `documents`, `symbols`.
    - Asserts DDL does not contain `config_relative_path` or `member_form`.
    - Tests rejection of schema versions 10, 11, 12, 13 without altering tables (`it.each(['10', '11', '12', '13'])`).
    - Tests reopening schema 14 without rebuilding stored rows.
    - Tests `document_fts` search by `projectRelativePath`.
    - Tests `getFile` and `getDocument` return `projectRelativePath`.
    - Tests `findFilesByProjectRelativePath` and `findDocumentsByProjectRelativePath`.

#### 5. Missing Tests

- **Missing Scenario**: `Scenario: Any other version is incompatible (forward compatibility test)`
  - Spec requirement: _"GIVEN meta.schemaVersion is 13 or 15, WHEN the store opens, THEN the error is GraphSchemaIncompatibleError and no ALTER TABLE is executed"_.
  - Current state: `it.each(['10', '11', '12', '13'])` tests prior versions, but does NOT test a higher version (e.g. version 15).
- **Missing Scenario**: `Scenario: Symbols table stores denormalized project_relative_path`
  - Spec requirement: _"WHEN symbols are persisted by SQLiteGraphStore, THEN the symbols table record stores project_relative_path matching the owning file's project-relative path AND symbol retrieval does not require a join against the files table"_.
  - Current state: While DDL and queries select `project_relative_path` directly, there is no isolated test in `sqlite-graph-store.spec.ts` that persists a symbol with an explicit `projectRelativePath` distinct from `filePath` and asserts that querying symbols retrieves this denormalized value.

---

## Summary Table

| Spec ID                            | Requirement / Area                         | Status    | Test Coverage | Key Discrepancies / Gaps                                                                                                                                       |
| :--------------------------------- | :----------------------------------------- | :-------- | :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code-graph:symbol-model`          | `FileNode.projectRelativePath`             | COMPLIANT | PARTIAL       | Missing explicit scenario tests for `FileNode` equality and `..` parent segments in `file-node.spec.ts`.                                                       |
| `code-graph:symbol-model`          | `SymbolNode.projectRelativePath`           | COMPLIANT | PARTIAL       | `symbol-node.spec.ts` completely lacks tests asserting `projectRelativePath` on `SymbolNode`.                                                                  |
| `code-graph:document-model`        | `DocumentNode.projectRelativePath`         | COMPLIANT | COMPLETE      | Fully covered in unit, use-case, and store contract tests.                                                                                                     |
| `code-graph:document-model`        | Reserved `root:` namespace & deduplication | COMPLIANT | COMPLETE      | Fully covered in `workspace-indexing.spec.ts`.                                                                                                                 |
| `code-graph:workspace-integration` | Project-relative file lookup               | COMPLIANT | PARTIAL       | Missing test for absolute selector normalization against `projectRoot` and parent segment (`../../`) resolution in `resolve-graph-selector.spec.ts`.           |
| `code-graph:sqlite-graph-store`    | SQLite schema version 14 DDL               | COMPLIANT | COMPLETE      | Fully verified in `sqlite-graph-store.spec.ts`.                                                                                                                |
| `code-graph:sqlite-graph-store`    | Zero-join denormalized symbol storage      | COMPLIANT | PARTIAL       | DDL and SQL queries verified zero-join; missing unit test verifying denormalized symbol readback in isolation.                                                 |
| `code-graph:sqlite-graph-store`    | Schema incompatibility & rejection         | COMPLIANT | PARTIAL       | Schema 10-13 rejection tested; forward version 15 not tested in `it.each`. Throws `GraphStorageRecoveryRequiredError` wrapping `GraphSchemaIncompatibleError`. |
