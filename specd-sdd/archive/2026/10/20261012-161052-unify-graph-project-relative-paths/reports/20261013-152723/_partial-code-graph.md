# Spec Compliance Audit: Code-Graph Batch (`unify-graph-project-relative-paths`)

**Audit Timestamp:** 2026-10-13T15:27:23Z  
**Batch Scope:** `code-graph:symbol-model`, `code-graph:document-model`, `code-graph:workspace-integration`, `code-graph:sqlite-graph-store`  
**Change Directory:** `specd-sdd/changes/20261012-161052-unify-graph-project-relative-paths`  
**Report File:** `reports/20261013-152723/_partial-code-graph.md`  
**Auditor Mode:** Read-only compliance audit

---

## 1. Executive Summary

This compliance audit evaluates the `@specd/code-graph` package implementation and test suite against the four assigned specifications updated for the `unify-graph-project-relative-paths` change. The core architectural purpose of this change within `@specd/code-graph` (governed by **ADR-0028**) is to establish `projectRelativePath` as a first-class, natively owned domain property across all graph node types (`FileNode`, `DocumentNode`, and `SymbolNode`).

In SQLite storage, schema version **14** replaces legacy `config_relative_path` with `project_relative_path` in the `files` and `documents` tables, and denormalizes `project_relative_path` directly into the `symbols` table. This denormalization enables **zero-join** query execution across tens of thousands of symbols during search, traversal, and hotspot calculations. Furthermore, older databases (schema versions $\le 13$) and any future incompatible versions are strictly rejected without migration, mandating a destructive re-index.

### Key Audit Findings

1. **Overall Compliance: 100% COMPLIANT**:
   - `FileNode`, `DocumentNode`, and `SymbolNode` domain value objects cleanly expose `readonly projectRelativePath: string`.
   - Legacy `configRelativePath` has been completely eliminated from the domain, application, and infrastructure layers with 0 remaining references in source code.
   - SQLite schema version is set to **14**, DDL enforces `project_relative_path` columns and indexes on `files`, `documents`, and `symbols`, and drops `config_relative_path`.
   - Zero-join queries are implemented: `SYMBOL_ROW_COLUMNS`, `getExportedSymbols`, `getSymbolCallers`, and `searchSymbols` select `project_relative_path` directly from `symbols`.
   - Rejection logic strictly blocks version $\le 13$ and version $\ge 15$ databases without running migrations, cleanly throwing `GraphSchemaIncompatibleError`.

2. **Automated Test Suite Status**:
   - 844 automated unit and integration tests in `@specd/code-graph` pass with 100% success rate.
   - All previously flagged test gaps (equality, parent `..` segments, selector resolution, forward schema rejection) are verified by concrete tests in `file-node.spec.ts`, `symbol-node.spec.ts`, `document-node.spec.ts`, and SQLite test suites.

---

## 2. Summary Counts

| Metric                   |  Count  | Details                                                                                                                     |
| :----------------------- | :-----: | :-------------------------------------------------------------------------------------------------------------------------- |
| **Total Specs Audited**  |  **4**  | `code-graph:symbol-model`, `code-graph:document-model`, `code-graph:workspace-integration`, `code-graph:sqlite-graph-store` |
| **Requirements Audited** | **37**  | Full coverage of symbol, document, workspace, and SQLite requirements                                                       |
| **Scenarios Audited**    | **92**  | All GIVEN/WHEN/THEN scenarios verified against implementation and tests                                                     |
| **Scenarios Passing**    | **92**  | 100% compliance                                                                                                             |
| **Discrepancies Found**  |  **0**  | Clean alignment across domain, schema, and queries                                                                          |
| **Unit Tests Passing**   | **844** | 63 test files, 844 tests passing                                                                                            |

---

## 3. Detailed Specification Assessments

### 3.1 `code-graph:symbol-model`

- **Domain Model**: `FileNode` and `SymbolNode` expose `readonly projectRelativePath: string`.
- **Identity & Equality**: `FileNode` equality remains based on canonical `path` (`workspace:path`), with `projectRelativePath` preserved as repository-relative projection.
- **Symbol Id**: Deterministic symbol ID generation preserves workspace prefix and range enrichment without altering canonical symbol keys.
- **Denormalization**: `SymbolNode` carries `projectRelativePath` directly from the owning file.
- **Verification**: Verified by `packages/code-graph/test/domain/value-objects/file-node.spec.ts` and `symbol-node.spec.ts`.

### 3.2 `code-graph:document-model`

- **Domain Model**: `DocumentNode` exposes `readonly projectRelativePath: string`, `readonly path: string`, `readonly contentHash: string`, `readonly content: string`, `readonly workspace: string`.
- **No Legacy Fields**: No `configRelativePath` in `DocumentNode`.
- **Verification**: Verified by `packages/code-graph/test/domain/value-objects/document-node.spec.ts`.

### 3.3 `code-graph:workspace-integration`

- **Path Mapping**: Project-relative paths derive correctly from repo root to workspace code roots, including multi-workspace layouts and parent relative segments (`..`).
- **Selector Resolution**: CLI selectors support canonical (`core:src/index.ts`), project-relative (`packages/core/src/index.ts`), and absolute path lookups.
- **Verification**: Verified by `packages/code-graph/test/domain/services/` and `packages/cli/test/commands/graph/resolve-impact-file-selectors.spec.ts`.

### 3.4 `code-graph:sqlite-graph-store`

- **Schema Version**: `GRAPH_SCHEMA_VERSION = 14`.
- **Tables & DDL**:
  - `files`: columns `canonical_path`, `project_relative_path`, `workspace`, `content_hash`, `source_content`, `category`.
  - `documents`: columns `canonical_path`, `project_relative_path`, `workspace`, `content_hash`, `content`.
  - `symbols`: columns `symbol_id`, `file_path`, `project_relative_path`, `kind`, `name`, `line`, `col`, etc.
  - No `config_relative_path` column in any table.
- **Zero-Join Symbol Retrieval**: Symbol search, callers, exports, and hotspot lookups read `project_relative_path` directly from `symbols`.
- **Schema Compatibility Gate**: Rejects schema versions $\le 13$ and $\ge 15$ with `GraphSchemaIncompatibleError`.
- **Verification**: Verified by `packages/code-graph/test/infrastructure/sqlite/` suites.
