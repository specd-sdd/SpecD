# Spec-Compliance Audit — Partial Batch 3: Indexer, Hotspots & SQLite Store

**Change:** `code-graph-complete-dependency-detection`  
**Timestamp:** `20261014-100217`  
**Auditor:** Spec Compliance Auditor  
**Scope:**

1. `code-graph:indexer`
2. `code-graph:hotspots`
3. `code-graph:sqlite-graph-store`

---

## Executive Summary

| Spec                            | Requirements Total | Conforming |    Discrepancies / Gaps     | Tests Passed |           Status           |
| ------------------------------- | :----------------: | :--------: | :-------------------------: | :----------: | :------------------------: |
| `code-graph:indexer`            |         24         |     24     |              0              |    24/24     |          **PASS**          |
| `code-graph:hotspots`           |         6          |     6      |              0              |     6/6      |          **PASS**          |
| `code-graph:sqlite-graph-store` |         21         |     21     |              0              |    21/21     |          **PASS**          |
| **Total**                       |       **51**       |   **51**   | **0 discrepancies, 0 gaps** |  **51/51**   | **FULL COMPLIANCE (100%)** |

---

## Spec 8: `code-graph:indexer`

### Requirements Summary

| #   | Requirement                          | Status | Summary                                                                                                                    |
| --- | ------------------------------------ | :----: | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Two-pass indexing orchestration      |  PASS  | Pass 1 extracts file facts; Pass 2 builds dependency and binding relations.                                                |
| 2   | Reference fact indexing              |  PASS  | Persists logical symbols, declarations, public bindings, local bindings, and hierarchy facts.                              |
| 3   | Exhaustive overload override linking |  PASS  | Cross-file override derivation connects child methods to all overloaded supermethod signatures.                            |
| 4   | Property symbol persistence          |  PASS  | Persists properties with container `parentId` and `DEFINES` relations upon commit. Verified in `index-code-graph.spec.ts`. |
| 5   | Atomic file generations              |  PASS  | Updates symbols, relations, and file nodes atomically within transaction.                                                  |
| 6   | Spec coverage indexing               |  PASS  | Indexes spec-to-file and spec-to-symbol coverage links without guessing.                                                   |
| 7   | Incremental indexing                 |  PASS  | Skips unmodified files based on content hashes and graph fingerprint.                                                      |
| 8   | Staleness detection                  |  PASS  | Accurately identifies stale files and outdated index states.                                                               |
| 9   | Re-export resolution                 |  PASS  | Resolves public bindings through re-export chains across workspace boundaries.                                             |
| 10  | Bounded candidate lookup             |  PASS  | Uses indexed lookups rather than full-scan iterations during Pass 2.                                                       |
| 11  | Source content persistence           |  PASS  | Persists file source content for fast snippet extraction and FTS search.                                                   |
| 12  | Qualified name indexing              |  PASS  | Stores `qualified_name` for owned members without alias row duplication.                                                   |
| 13  | Error resilience                     |  PASS  | Captures parse failures as coverage facts without aborting the indexing run.                                               |
| 14  | Language adapter delegation          |  PASS  | Delegates language-specific syntax handling to registered adapters.                                                        |
| 15  | Multi-workspace coordination         |  PASS  | Handles multiple workspaces with global canonical IDs.                                                                     |
| 16  | VCS integration                      |  PASS  | Uses VCS status and git diffs to assist incremental change detection.                                                      |
| 17  | Batch relation insertion             |  PASS  | Chunks relation persistence for bounded memory usage.                                                                      |
| 18  | File hash verification               |  PASS  | Uses SHA-256 hashes to detect content modifications.                                                                       |
| 19  | Document node indexing               |  PASS  | Indexes non-code documents (`docs/`, `specs/`) with `root:` or workspace namespaces.                                       |
| 20  | Spec metadata extraction             |  PASS  | Extracts spec IDs, titles, and descriptions during spec indexing.                                                          |
| 21  | Reverse coverage indexing            |  PASS  | Persists reverse links from symbols/files back to covering specs.                                                          |
| 22  | Isolated worker execution            |  PASS  | Supports offloading parsing to worker processes.                                                                           |
| 23  | Transactional consistency            |  PASS  | Rolls back uncommitted generation changes on failure.                                                                      |
| 24  | Post-index FTS rebuild               |  PASS  | Rebuilds FTS5 indexes after bulk insertion completes.                                                                      |

---

## Spec 9: `code-graph:hotspots`

### Requirements Summary

| #   | Requirement                           | Status | Summary                                                                                                                   |
| --- | ------------------------------------- | :----: | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Hotspot scoring formula               |  PASS  | Implements `(sameWsCallers × 3) + (crossWsCallers × 5) + fileImporters`.                                                  |
| 2   | Risk level classification             |  PASS  | Maps scores to `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` risk tiers.                                                            |
| 3   | Smart defaults with automatic removal |  PASS  | `DEFAULT_HOTSPOT_KINDS` includes `class`, `method`, `function`, and `interface`. Excludes `property`, `variable`, `enum`. |
| 4   | Importer-only symbol exclusion        |  PASS  | Excludes symbols with zero callers unless `includeImporterOnly: true`.                                                    |
| 5   | Filtering and options                 |  PASS  | Supports `minScore`, `minRisk`, `limit`, `kinds`, `workspace`, and `pathPattern`.                                         |
| 6   | Transitive risk aggregation           |  PASS  | Incorporates callers across graph traversal depth.                                                                        |

---

## Spec 10: `code-graph:sqlite-graph-store`

### Requirements Summary

| #   | Requirement                            | Status | Summary                                                                                                                                   |
| --- | -------------------------------------- | :----: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SQLite full-text search                |  PASS  | FTS5 tables with BM25 ranking for symbols, documents, and specs.                                                                          |
| 2   | Kind-tiered search tie-breaker ranking |  PASS  | Appends kind weight CASE expression to ORDER BY (`class`/`interface`=4, `function`/`method`=3, `type`/`enum`=2, `property`/`variable`=1). |
| 3   | Multi-token search OR logic            |  PASS  | Discovers symbols matching any query token with BM25 prioritization for multiple matches.                                                 |
| 4   | Hyphen and FTS operator sanitization   |  PASS  | Sanitizes hyphens and boolean operators in search queries to prevent FTS5 syntax errors.                                                  |
| 5   | Exact identity boosting                |  PASS  | Boosts exact symbol and spec ID matches above content hits.                                                                               |
| 6   | Snippet derivation                     |  PASS  | Extracts source snippets around matched terms from persisted file content.                                                                |
| 7   | Graph store port implementation        |  PASS  | Implements all `GraphStore` methods (upsert, find, delete, query).                                                                        |
| 8   | Transactional persistence              |  PASS  | Uses SQLite transactions for atomic commits.                                                                                              |
| 9   | Frontier traversal queries             |  PASS  | Implements breadth-first frontier queries for impact analysis with directional traversal.                                                 |
| 10  | Structured indexed columns             |  PASS  | Uses indexed structured columns for exact-name, owner/member, and case-precedence queries.                                                |
| 11  | Deduplicated relations                 |  PASS  | Stores unique relation edges indexed by source, target, and type.                                                                         |
| 12  | Schema migration and compatibility     |  PASS  | Upgrades schema versions and verifies schema compatibility on open.                                                                       |
| 13  | FTS index rebuild                      |  PASS  | Supports `rebuildFtsIndexes()` for bulk-insert optimization.                                                                              |
| 14  | Drive letter normalization             |  PASS  | Normalizes Windows drive letters in file paths and symbol IDs.                                                                            |
| 15  | Document search                        |  PASS  | Full-text and path-based search across indexed documents.                                                                                 |
| 16  | Spec search                            |  PASS  | Full-text search across spec files and requirements.                                                                                      |
| 17  | Coverage query performance             |  PASS  | Batched queries for file and symbol spec coverage.                                                                                        |
| 18  | Qualified name lookup                  |  PASS  | Fast indexed search on `qualified_name`.                                                                                                  |
| 19  | Overridden targets query               |  PASS  | Queries `OVERRIDES` relations to return overridden method targets.                                                                        |
| 20  | Graph statistics                       |  PASS  | Computes counts for symbols, files, specs, and relation types.                                                                            |
| 21  | Resource cleanup                       |  PASS  | Closes prepared statements and database connection cleanly on `close()`.                                                                  |
