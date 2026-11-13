# Compliance Audit — `code-graph:sqlite-graph-store`

Change: `fix-sqlite-delete-file-variable-limit`  
Mode: exhaustive, read-only, change-scoped  
Graph state: current, complete coverage, no fingerprint mismatch  
Verification command: `pnpm --filter @specd/code-graph exec vitest run test/infrastructure/sqlite/sqlite-graph-store.spec.ts`  
Result: **1 file passed, 148 tests passed**

## Requirements Summary

The merged change preview modifies two requirements and nine scenarios.

1. **Worker-efficient batch reads**
   - A logical batch remains one host/worker RPC.
   - Every collection-bound SQL statement must stay below the safe parameter budget.
   - Chunk sizing must include fixed bind positions and multiplicity when an input is referenced more than once.
   - Merged chunks must preserve deterministic order, de-duplication, unknown-value behavior, and empty-input semantics.
   - Four changed scenarios cover one-RPC dispatch, oversized collections, fixed/repeated bind accounting, and empty batches.

2. **Transactional mutation model**
   - `upsertFile`, `removeFile`, and bulk commit remain worker-local, single-transaction operations.
   - File-local cleanup must use a parameter count independent of the number of stored symbols.
   - Relations touching a file's symbols must be removed before those symbols.
   - Failures after cleanup begins must preserve the complete prior committed state.
   - Five changed scenarios cover generic atomicity, direct-upsert rollback, bulk rollback, large direct remove/upsert cleanup, and large bulk replacement cleanup.

These requirements refine rather than contradict the abstract `code-graph:graph-store` contract: that dependency already requires atomic file upsert/removal, deterministic batched traversal reads, omission of unknown identities, input de-duplication, and no backend work for empty traversal batches.

## Implementation Status

### Worker-efficient batch reads — **Conforming**

- `getSqliteInputChunkSize()` centralizes the 900-bind budget and explicitly subtracts fixed parameters and divides by input multiplicity (`sqlite-graph-database.ts:118`). Invalid or exhausted accounting rejects with `RangeError` instead of constructing an oversized statement.
- Repeated caller paths in `findDirectlyAffectedFiles()` use `getSqliteInputChunkSize(1 + dependencyTypes.length, 2)`, correctly accounting for one `IMPORTS` bind, all fixed relation-type binds, and each path appearing twice (`sqlite-graph-database.ts:899-934`). Results merge through a `Set` and are sorted.
- Logical-symbol, declaration, exported-name binding, qualified-name, resolution-step, index-coverage, freshness-latch, and coverage-target reads chunk de-duplicated collections with the shared budget helper (`sqlite-graph-database.ts:1237`, `1253`, `1273`, `2204`, `2300`, `2391`, `2408`, `3159`). Their result maps/sets remove duplicates and their final comparators provide deterministic ordering.
- `findSymbols()` subtracts all pre-existing fixed query parameters before choosing the `filePaths` chunk size, then applies the same non-collection filters to every chunk and globally sorts the merged symbols (`sqlite-graph-database.ts:1292-1387`).
- Traversal relation batches subtract the complete de-duplicated relation-type count from the id budget and merge rows by `(source,type,target)` before sorting (`sqlite-graph-database.ts:3219-3246`). This satisfies both fixed-parameter accounting and transparent chunk merging.
- Host guards avoid worker dispatch for empty symbol/relation, exact-node, coverage, affected-file, and reference lookup batches (`sqlite-graph-store.ts:308-366`, `443`, `553-585`, `861-959`). `getFreshnessLatches([])` intentionally remains one RPC because its abstract result includes the graph-level latch; the tests assert this distinction.
- The logical operation remains a single typed RPC: chunking occurs in `SQLiteGraphDatabase`, inside the persistent worker, not in `SQLiteGraphStore`.

### Transactional mutation model — **Conforming**

- Direct `upsertFile()` executes cleanup, replacement file/symbol/relation inserts, FTS refresh, and timestamp update in one `better-sqlite3` transaction (`sqlite-graph-database.ts:1948-1965`).
- Direct `removeFile()` executes cleanup and timestamp update in one transaction (`sqlite-graph-database.ts:1973-1979`).
- Bulk cleanup and replacement run inside the single transaction created by `commitBulkIndex()` (`sqlite-graph-database.ts:2451-2512`).
- `deleteFileLocalState()` deletes symbol-endpoint relations with two correlated subqueries keyed only by `filePath`, then deletes symbols, file-endpoint relations, file FTS, and the file row (`sqlite-graph-database.ts:2972-2983`). Its bind count is constant (2, then 1/2/1/1) regardless of symbol cardinality, and relations are deleted before symbols.
- The new direct public rollback regression is valid and reaches the intended failure point. It first commits a baseline file with two symbols, incoming and outgoing symbol relations, a file-endpoint import, and searchable source content. The replacement uses two valid replacement endpoints and relation metadata `{ invalid: 1n }`. The DTO is structured-cloneable across the worker boundary; after cleanup, replacement file insertion, and replacement symbol insertion, `insertRelations()` reaches `JSON.stringify(relation.metadata)` (`sqlite-graph-database.ts:2926-2942`), which throws for `BigInt`. The enclosing transaction rolls back. Assertions prove preservation of the baseline file, both baseline symbols, incoming and outgoing relations, file import, and FTS candidate, while proving replacement FTS and relation state are absent (`sqlite-graph-store.spec.ts:1091-1214`). No test-only production hook or public API expansion was introduced.
- Large-file regressions use 16,384 symbols, well beyond the historical variable-spread failure boundary, for direct remove, direct upsert, and bulk replacement (`sqlite-graph-store.spec.ts:2524`, `2603`, `2706`). They verify old symbols, both relation directions, file-endpoint imports, and old FTS state disappear; upsert/bulk cases also verify only the replacement state is visible.
- The bulk rollback regression now removes and replaces the same baseline path before a later duplicate logical-symbol insertion fails, then verifies the baseline file, symbols, relation, and source FTS remain together (`sqlite-graph-store.spec.ts:1004-1089`).

### Global and dependency conformance — **Conforming**

- `code-graph:graph-store`: observable atomicity and batch semantics are preserved; SQLite-specific budgeting remains private to the infrastructure adapter.
- `code-graph:symbol-model` and `code-graph:workspace-integration`: canonical ids, workspaces, and symbol/file ownership are not changed. Chunk merging uses existing node/relation comparators.
- `core:config`: no configuration surface or persistence-root behavior changes.
- `default:_global/architecture`: all SQLite I/O remains in `src/infrastructure/sqlite`; no domain/application dependency reversal or host-thread SQLite work is introduced.
- `default:_global/conventions`: ESM/named-export/no-`any` constraints are preserved. The internal helper has JSDoc and parameter/return/throw documentation; public method signatures remain explicit.
- `default:_global/testing`: the integration tests use Vitest, live under the mirrored `test/infrastructure` tree, use `os.tmpdir()` plus `node:path`, clean temporary directories through the suite lifecycle, and use explicit assertions rather than snapshots.

## Discrepancies

### Implementation discrepancies: **0**

No behavior in the inspected implementation contradicts either changed merged requirement.

### Spec discrepancies: **0**

No changed requirement contradicts the abstract store contract, its direct dependencies, or relevant global constraints.

### Dual interpretation record

No discrepancy required adjudication. If the behavior were judged incorrect, the likely implementation-bug interpretation would be that a particular SQL family omitted fixed/repeated bind accounting or that cleanup escaped its transaction. The contrary spec-drift interpretation would require arguing that backend operations may exceed a documented safe budget or expose partial mutations; that would conflict with the abstract `GraphStore` atomicity and batch semantics. The inspected code and tests support the present merged spec, so neither interpretation is evidenced.

## Test Coverage

| Changed scenario                                  | Evidence                                                                                                                                | Status                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Logical batch crosses worker boundary once        | RPC spy covers symbols plus incoming/outgoing relation batches                                                                          | Covered                                                      |
| Collection-binding reads chunk transparently      | Oversized exact nodes, traversal ids, logical/reference lookups, coverage, freshness, index coverage, affected files, and `findSymbols` | Covered                                                      |
| Fixed and repeated parameters count toward budget | 446/447 repeated-path boundary; 896/897/898 id-plus-type boundaries; coverage's fixed type bind                                         | Covered                                                      |
| Empty batch avoids worker/SQLite work             | RPC spies assert no dispatch for traversal/exact-node/newly chunked empty inputs                                                        | Covered                                                      |
| File upsert/removal are all-or-nothing            | Transaction structure plus direct upsert rollback regression; large removal success regression                                          | Covered by static transaction evidence and integration tests |
| Direct upsert rolls back after cleanup            | Public `upsertFile()` BigInt-metadata regression verifies full baseline and absent replacement                                          | Covered                                                      |
| Bulk batch is all-or-nothing                      | Same-path staged replacement followed by duplicate logical-symbol failure preserves baseline and FTS                                    | Covered                                                      |
| Direct mutation cleans large file                 | Separate 16,384-symbol remove and replacement tests                                                                                     | Covered                                                      |
| Bulk commit cleans large file                     | 16,384-symbol bulk replacement test                                                                                                     | Covered                                                      |

The focal SQLite store suite completed successfully with **148/148** tests.

## Missing Tests

1. **Low — no deterministic failure-after-cleanup regression for direct `removeFile()` itself.**
   - Evidence: the changed generic atomicity scenario names both `upsertFile()` and `removeFile()`. The new failure regression exercises direct `upsertFile()`, while `removeFile()` is covered by transaction inspection and a successful 16,384-symbol cleanup test. Repository search found no removal-specific rejection/rollback test.
   - Code-is-correct interpretation: `removeFile()` wraps `deleteFileLocalState()` and timestamp mutation in the same `better-sqlite3` transaction, so SQLite rollback semantics are direct and there is no subsequent serialization stage that offers a natural public failure trigger.
   - Spec/test-gap interpretation: an injected SQLite cleanup failure could reveal a future transaction-boundary regression unique to removal. Adding such a test would require a safe fault mechanism; the current change deliberately avoids production test hooks. This is a coverage advisory, not evidence of faulty behavior and not a release blocker.

No missing test was found for the newly required direct public upsert rollback, large-symbol cleanup paths, fixed/repeated bind accounting, deterministic merge behavior, duplicate/unknown input behavior, or empty RPC guards.

## Spec Dependency Chain

Change scope:

`code-graph:sqlite-graph-store`

Direct declared dependencies (depth 1):

- `code-graph:graph-store` — abstract atomic mutation and batch-query semantics; fully compatible.
- `core:config` — project/config path contracts; unaffected.
- `code-graph:symbol-model` — symbol identities and ordering inputs; unchanged.
- `code-graph:workspace-integration` — canonical workspace/path identity; unchanged.

Relevant project-wide constraints:

- `default:_global/architecture`
- `default:_global/conventions`
- `default:_global/testing`
- `default:_global/error-handling-conventions` (no new user-facing error type or translation)

Graph impact reports **HIGH** scope with 4 direct, 6 indirect, and 4 transitive dependency links across 14 affected files/spec surfaces. The implementation remains confined to the SQLite infrastructure adapter and its mirrored integration test.

## Summary Counts

| Category                             | Count |
| ------------------------------------ | ----: |
| Changed requirements audited         |     2 |
| Changed scenarios audited            |     9 |
| Requirements conforming              |     2 |
| Scenarios covered                    |     9 |
| Implementation discrepancies         |     0 |
| Spec/dependency/global discrepancies |     0 |
| Critical findings                    |     0 |
| High findings                        |     0 |
| Medium findings                      |     0 |
| Low findings                         |     0 |
| Non-blocking missing-test advisories |     1 |
| Focal tests passed                   |   148 |

**Overall verdict: COMPLIANT.** The change implements the merged SQLite requirements without detected functional or architectural discrepancy. The sole advisory is optional removal-specific rollback fault coverage; current transaction structure and successful large-removal coverage provide strong evidence of correctness.
