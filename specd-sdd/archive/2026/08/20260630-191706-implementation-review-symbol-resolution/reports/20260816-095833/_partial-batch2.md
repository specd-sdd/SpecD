# Batch 2 Compliance Audit Report

## Requirements & Verification Summary

| Spec ID                            | Total Requirements | Satisfied | Discrepancies | Missing Tests |
| :--------------------------------- | :----------------: | :-------: | :-----------: | :-----------: |
| `code-graph:graph-store`           |         21         |    21     |       0       |       0       |
| `code-graph:sqlite-graph-store`    |         14         |    14     |       0       |       0       |
| `code-graph:ladybug-graph-store`   |         14         |    14     |       0       |       0       |
| `code-graph:indexer`               |         22         |    22     |       0       |       0       |
| `code-graph:staleness-detection`   |         13         |    13     |       0       |       0       |
| `code-graph:workspace-integration` |         11         |    11     |       0       |       0       |
| `code-graph:get-graph-health`      |         8          |     8     |       0       |       0       |
| `code-graph:index-project-graph`   |         5          |     5     |       0       |       0       |
| **Total**                          |      **108**       |  **108**  |     **0**     |     **0**     |

---

## Detailed Findings per Spec

### 1. `code-graph:graph-store`

#### Requirements Compliance

- **GraphStore port**: Abstract class in `src/domain/ports/graph-store.ts` taking `storagePath`.
- **Minimum graph semantics**: Supports `FileNode` (with full content), `SymbolNode`, `SpecNode`, `DocumentNode`, and relation families (`IMPORTS`, `DEFINES`, `CALLS`, `CONSTRUCTS`, `USES_TYPE`, `EXPORTS`, `DEPENDS_ON`, `COVERS_FILE`, `COVERS_SYMBOL`, `EXTENDS`, `IMPLEMENTS`, `OVERRIDES`).
- **Connection lifecycle**: `open()` and `close()` defined; `close()` is idempotent.
- **Store recreation**: `recreate(): Promise<void>` for destructive resets.
- **Storage generation tracking**: Generation snapshots and `storage.epoch` tracking.
- **Atomic file-level upsert & removal**: `upsertFile`, `removeFile`, `upsertSpec`, `removeSpec` provided.
- **Additive relation insertion**: `addRelations` provided.
- **Query & Search methods**: Full set of query methods (`getFile`, `getSymbol`, `getCallers`, `getCallees`, `searchSymbols`, `searchSpecs`, `searchDocuments`, etc.) defined.
- **Delta Additions**:
  - Reference & coverage persistence (`replaceReferenceFacts`, `getAllReferenceFacts`, `findLogicalSymbols`, `findPublicBindings`, `findLocalBindings`, `findResolutionSteps`, `findIndexCoverage`, `getAllIndexCoverage`).
  - Source-content search candidates (`searchSourceContentCandidates`).
  - Incompatible store handling.
  - Indexed-input freshness persistence (`getIndexedInputObservations`, `markIndexedInputsStale`, `updateIndexedInputObservations`, `getFreshnessLatches`, `markWorkspacesAndGraphStaleSinceLastIndex`).
  - Single-session bulk indexing (`beginBulkIndexSession`, `IndexWriteSession`).

#### Implementation Locations

- `packages/code-graph/src/domain/ports/graph-store.ts`

#### Test Coverage

- `packages/code-graph/test/domain/ports/graph-store.contract.ts` (Abstract contract test suite executed against all concrete stores).

#### Findings

- **Status**: 100% Compliant. No discrepancies or missing tests found.

---

### 2. `code-graph:sqlite-graph-store`

#### Requirements Compliance

- **SQLite-backed implementation**: Backend ID `sqlite`, using SQLite via `better-sqlite3`.
- **Config-derived persistence layout**: `{configPath}/graph/code-graph.sqlite` and `{configPath}/tmp`.
- **Default backend role**: Serves as the default backend in code-graph provider factory.
- **Destructive recreation & generation sidecar**: `recreate()` removes SQLite files and rotates `storage.epoch`.
- **SQLite schema ownership & versioning**: Schema version `9` defined in `schema.ts`. Defines tables for Files, Symbols, Specs, Documents, Meta, LogicalDeclarations, PublicBindings, LocalBindings, ResolutionSteps, IndexCoverage, and FTS tables (`symbol_fts`, `spec_fts`, `document_fts`).
- **Full-text search**: FTS5 tables with identity prioritization, token expansion, and BM25 ranking.
- **Transactional mutation model & bulk loading**: Uses SQLite transactions and bulk insert optimizations.
- **Delta Additions**:
  - Reference schema upgrade (schema version 9, trigram content FTS, batch reverse coverage lookup).

#### Implementation Locations

- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`
- `packages/code-graph/src/infrastructure/sqlite/schema.ts`

#### Test Coverage

- `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts` (Runs contract tests + SQLite-specific DDL, FTS, schema migration, and transaction tests).

#### Findings

- **Status**: 100% Compliant. No discrepancies or missing tests found.

---

### 3. `code-graph:ladybug-graph-store`

#### Requirements Compliance

- **Ladybug-backed implementation**: Backend ID `ladybug`, using LadybugDB graph database engine.
- **Config-derived persistence layout**: `{configPath}/graph/code-graph.lbug` and `{configPath}/tmp`.
- **Destructive recreation & storage generation sidecar**: Implements `recreate()` and updates `storage.epoch`.
- **Ladybug schema ownership & versioning**: Schema version `13` with node tables (File, Symbol, Spec, Document, Meta, LogicalSymbol, IndexCoverage, etc.) and relationship tables (`IMPORTS`, `DEFINES`, `CALLS`, `EXTENDS`, `IMPLEMENTS`, `OVERRIDES`, etc.).
- **Full-text search**: `QUERY_FTS_INDEX` over `symbol_fts`, `spec_fts`, and `document_fts` with shared identity reranking.
- **Prepared statement usage**: Cypher queries use parameterized prepared statements.
- **Delta Additions**:
  - Reference schema upgrade (schema version 13 with logical symbols, declarations, public/local bindings, resolution steps, coverage, source content candidate queries).

#### Implementation Locations

- `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`
- `packages/code-graph/src/infrastructure/ladybug/schema.ts`

#### Test Coverage

- `packages/code-graph/test/infrastructure/ladybug/ladybug-graph-store.spec.ts`
- `packages/code-graph/test/infrastructure/ladybug/ladybug-graph-store-multi-kind.spec.ts`

#### Findings

- **Status**: 100% Compliant. No discrepancies or missing tests found.

---

### 4. `code-graph:indexer`

#### Requirements Compliance

- **IndexCodeGraph use case**: Orchestrates discover, diff, extract, spec indexing, store commit, clean, and VCS ref persistence.
- **Incremental indexing**: Content hashing (`computeContentHash`), graph fingerprint comparison, escalation to full rebuild on mismatch.
- **Multi-workspace file discovery & binary filtering**: Discovers workspace files and project-global documents, applies binary extension filters and document decoding policy.
- **Two-pass extraction & shared indexing session**: Pass 1 extracts file analyses into `IndexSession`; Pass 2 resolves imports, scoped bindings, and cross-file relations.
- **Chunked processing & memory bounds**: Processes files in sequential chunks (default 20 MB).
- **Progress reporting & phase timing**: Progress callback with percent/phase/detail and debug logging for phase timings.
- **Cross-workspace package resolution**: Maps `packageName -> workspaceName` via language adapters.
- **Index result**: `IndexResult` contains counts, errors, duration, per-workspace breakdown, `vcsRef`, `graphFingerprint`, `fullRebuild`, `fullRebuildReason`, and `phaseMetrics`.
- **Spec dependency indexing & LLM description**: Direct consumption of `SpecRepository` and `GetSpecMetadata`; prefers `optimizedDescription`.
- **Delta Additions**:
  - Reference fact indexing, incompatible derivation rebuild, indexed-input observation capture, bounded incremental relation construction.

#### Implementation Locations

- `packages/code-graph/src/application/use-cases/index-code-graph.ts`
- `packages/code-graph/src/application/use-cases/in-memory-index-session.ts`
- `packages/code-graph/src/application/use-cases/discover-files.ts`
- `packages/code-graph/src/application/use-cases/compute-content-hash.ts`

#### Test Coverage

- `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`
- `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`
- `packages/code-graph/test/application/use-cases/discover-files.spec.ts`
- `packages/code-graph/test/application/use-cases/compute-graph-fingerprint.spec.ts`

#### Findings

- **Status**: 100% Compliant. No discrepancies or missing tests found.

---

### 5. `code-graph:staleness-detection`

#### Requirements Compliance

- **VCS ref storage & comparison**: Accepts `vcsRef` during indexing, compares current ref against `lastIndexedRef`.
- **Graph derivation freshness**: Fingerprint computation from version, workspace layout, and effective config.
- **Warn-not-block & derivation mismatch policies**: Surfaced via diagnostics and health reporting.
- **GraphStatistics extension**: Surfaces `lastIndexedRef` and `graphFingerprint`.
- **Centralized index lock control**: Lock management in config directory.
- **Health orchestration**: Integrated with `GetGraphHealth`.
- **Delta Additions**:
  - Monotonic workspace and aggregate `knownStaleSinceLastIndex` latches.
  - Resource freshness assessment (`AssessIndexedResourceFreshness`).
  - Filtered VCS diffs and hybrid filesystem assessment.

#### Implementation Locations

- `packages/code-graph/src/application/use-cases/assess-indexed-resource-freshness.ts`
- `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts`
- `packages/code-graph/src/application/use-cases/get-graph-health.ts`

#### Test Coverage

- `packages/code-graph/test/application/use-cases/assess-indexed-resource-freshness.spec.ts`
- `packages/code-graph/test/application/use-cases/compute-graph-fingerprint.spec.ts`
- `packages/code-graph/test/application/use-cases/staleness-detection.verify.spec.ts`

#### Findings

- **Status**: 100% Compliant. No discrepancies or missing tests found.

---

### 6. `code-graph:workspace-integration`

#### Requirements Compliance

- **FileNode path & workspace semantics**: Workspace identity `{workspaceName}:{relativeToCodeRoot}` and `root:{projectRelativePath}`.
- **SymbolNode ID & SpecNode workspace**: `SymbolNode.id` includes workspace-prefixed file path; `SpecNode` includes `workspace` field.
- **Config-relative file lookup**: Computes `configRelativePath` for project-relative lookups.
- **Spec resolution via SpecRepository**: Uses `SpecRepository` methods (`list`, `artifact`, `readPersistedImplementation`, `readPersistedDependsOn`).
- **Cross-workspace import resolution**: Pass 2 package name resolution across workspaces.
- **WorkspaceIndexTarget & breakdown**: Accepted in options and reported in `IndexResult.workspaces`.
- **Delta Additions**:
  - Canonical module/package resolution identity, handling of visibility and case rules, path normalization.

#### Implementation Locations

- `packages/code-graph/src/application/use-cases/index-code-graph.ts`

#### Test Coverage

- `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`

#### Findings

- **Status**: 100% Compliant. No discrepancies or missing tests found.

---

### 7. `code-graph:get-graph-health`

#### Requirements Compliance

- **Returns enriched graph health**: `GetGraphHealthResult` with `GraphStatistics`, `stale`, `currentRef`, `fingerprintMismatch`.
- **Provider-owned availability & VCS staleness**: Uses `provider.getStatistics()` and `createVcsAdapter`.
- **Computes derivation fingerprint mismatch**: Compares stored fingerprint map against current calculation.
- **Delta Additions**:
  - Exposes content freshness, coverage summary/reasons (`excluded`, `unsupported`, `parse-failed`, `partial`).
  - Aggregate and workspace health projection with latches and machine-readable reasons.

#### Implementation Locations

- `packages/code-graph/src/application/use-cases/get-graph-health.ts`

#### Test Coverage

- `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`

#### Findings

- **Status**: 100% Compliant. No discrepancies or missing tests found.

---

### 8. `code-graph:index-project-graph`

#### Requirements Compliance

- **Executes project indexing**: `IndexProjectGraph` delegates to `provider.index(indexOptions)`.
- **Supports force recreate**: Forwards `force: true` to provider.
- **Accepts open provider & prepared inputs**: Forwarding of `projectRoot`, `workspaces`, `graphConfig`, `vcsRoot`, `vcsRef`, `force`, `onProgress`.
- **Delta Additions**:
  - Incompatibility repair execution, reporting `fullRebuild` and `fullRebuildReason`.

#### Implementation Locations

- `packages/code-graph/src/application/use-cases/index-project-graph.ts`

#### Test Coverage

- `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts`
- `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`

#### Findings

- **Status**: 100% Compliant. No discrepancies or missing tests found.
