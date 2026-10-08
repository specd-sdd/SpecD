# Spec compliance report: `fix-sqlite-delete-file-variable-limit`

## Executive summary

- Mode: specific change, full verification
- Overall result: **PASS WITH FINDINGS**
- Requirements audited: 2
- Verification scenarios audited: 8
- Scenarios behaviorally passing: 8
- Focused SQLite tests: 147/147 passing
- Findings: 0 critical, 0 high, 2 medium, 2 low

The implementation satisfies the merged parameter-budget and transactional-cleanup requirements. The remaining findings concern artifact traceability and the strength of several regression assertions, not a demonstrated runtime failure.

## Detailed Findings

# Compliance audit: `code-graph:sqlite-graph-store`

## Audit metadata

- Change: `fix-sqlite-delete-file-variable-limit`
- Lifecycle state observed: `verifying`
- Mode: full compliance audit, read-only except for this report
- Primary merged spec: `code-graph:sqlite-graph-store`
- Direct dependencies checked: `code-graph:graph-store`, `core:config`, `code-graph:symbol-model`, `code-graph:workspace-integration`
- Relevant global specs checked: `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing`, `default:_global/docs`
- Graph status: fresh, complete coverage, schema compatible; 1,207 code files and 42,669 symbols indexed
- Runtime evidence: `pnpm --filter @specd/code-graph exec vitest run test/infrastructure/sqlite/sqlite-graph-store.spec.ts` passed, 1 file / 147 tests, exit 0

## Requirements Summary

The merged change modifies two existing requirements.

1. **Worker-efficient batch reads**
   - Collection-backed SQL reads must use deterministic bounded chunks within the 900-parameter safety budget.
   - Fixed bind parameters and repeated appearances of each input must count against that budget.
   - Chunking remains internal to the persistent worker; one logical store call remains one RPC.
   - Merged results preserve deterministic ordering, de-duplication, unknown-value omission, and empty-input semantics.

2. **Transactional mutation model**
   - File-local cleanup for standalone upsert/removal and bulk commit must use a parameter count independent of the number of stored symbols.
   - Relations whose source or target is a removed symbol must be deleted before the symbol rows.
   - Cleanup remains inside the existing worker-side transaction, and failure rolls the complete mutation back.

The merged verification artifact contains eight scenarios: four for batch reads and four for transactional mutation/cleanup.

## Implementation Status

### Requirement: Worker-efficient batch reads — implemented

Evidence in `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:

- `getSqliteInputChunkSize()` computes `floor((900 - fixedParameterCount) / inputMultiplicity)`, validates integer accounting, and rejects exhausted budgets with the documented `RangeError` messages.
- `findDirectlyAffectedFiles()` reserves seven fixed parameters (one import type and six dependency types), uses multiplicity two for paths repeated in both predicates, chunks at 446, merges through `Set`, and sorts the result.
- `getRelationsByTargets()` reserves the fixed relation-type bind, chunks 899 targets, de-duplicates by `source/type/target`, and applies `compareRelations`.
- `findLogicalSymbolsByIds()`, `findDeclarations()`, `findPublicBindingsByExportedNames()`, `findLogicalSymbolsByQualifiedNames()`, `findLogicalDeclarations()`, `findResolutionSteps()`, `findIndexCoverage()`, and `readFreshnessLatches()` now use bounded chunks and deterministic result comparators or keyed result objects.
- `findSymbols()` excludes scalar predicates from the path collection, subtracts their bind count from the available budget, chunks unique paths, preserves wildcard filtering, and sorts through `compareSymbolNodes()`.
- Host methods in `sqlite-graph-store.ts` return early for empty collections, preserving the merged verification requirement that empty logical batches avoid worker dispatch. `getFreshnessLatches([])` intentionally still performs the internal `__graph__` lookup.
- No worker operation names, payload types, public signatures, schema objects, or schema versions changed.

### Requirement: Transactional mutation model — implemented

Evidence in `SQLiteGraphDatabase.deleteFileLocalState()`:

- Relation cleanup uses two constant file-path binds and subqueries over `symbols.file_path`.
- Symbol cleanup uses one file-path bind rather than materializing IDs into JavaScript.
- Symbol-endpoint relations are deleted before symbols; file-endpoint relations, FTS content, and the file row are subsequently removed by path.
- Existing callers (`upsertFile`, `removeFile`, and bulk commit) retain their enclosing worker-side SQLite transactions.
- The rollback integration case demonstrates that a failure after staged cleanup preserves the previous file, symbols, relation, and source-content FTS candidate.

### Scenario status

| Scenario                                      | Status                | Evidence                                                                                  |
| --------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| Logical batch crosses worker boundary once    | Pass                  | Existing symbol/relation RPC assertions plus oversized newly chunked lookup dispatch test |
| Collection-binding reads chunk transparently  | Pass, coverage caveat | 901-value logical-reference, coverage, freshness, index-coverage, and symbol-path tests   |
| Fixed/repeated parameters count toward budget | Pass                  | 446/447 affected-file path boundary and 899/900 reverse-coverage boundary tests           |
| Empty batch avoids worker/SQLite work         | Pass                  | Host dispatch spy verifies early returns; freshness exception asserted explicitly         |
| File upsert/removal all-or-nothing            | Pass                  | Existing transaction behavior and bulk rollback regression; focused suite passes          |
| Bulk indexing batch all-or-nothing            | Pass                  | Bulk session rollback test preserves prior graph and FTS state                            |
| Direct mutation cleans large file             | Pass, coverage caveat | 16,384-symbol remove and upsert tests exercise the original host-variable failure         |
| Bulk commit cleans large file                 | Pass, coverage caveat | 16,384-symbol bulk replacement test exercises constant-parameter cleanup                  |

## Discrepancies

### D1 — MEDIUM: production scope contradicts the design non-goal

**Evidence**

- `design.md` states: “Do not change `GraphStore`, `SQLiteGraphStore`, or worker RPC public signatures.”
- Its affected areas and the proposal impact list only `sqlite-graph-database.ts` and `sqlite-graph-store.spec.ts` as files to modify.
- The actual diff adds ten empty-input early returns to `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`.
- The change's implementation links cover the database file and test file but do not link `sqlite-graph-store.ts` to the changed spec, even though implementation review reports it as an open tracked file.

**Spec-correct / code-questionable interpretation**

The implementation expanded beyond the approved design. If the pre-change host already fulfilled the intended abstract contract, the added host guards are unnecessary scope and should be removed or separately designed.

**Code-correct / artifact-drift interpretation**

The merged verification scenario explicitly requires empty batches to avoid worker RPC. Database-only early returns cannot satisfy that externally observable requirement because dispatch has already happened. The host guards are therefore the correct implementation, while the design's “Do not change SQLiteGraphStore” non-goal and affected-file inventory are stale and should have been revised before implementation.

**Assessment**

Behavior is compliant and the public API is unchanged, but the design/task trace is internally inconsistent. This is an artifact/scope-review finding, not a runtime defect.

### D2 — MEDIUM: large-cleanup tests do not verify associated relation removal or FTS as claimed

**Evidence**

- Verification requires the large direct and bulk cases to contain associated incoming and outgoing relations and then prove that none remain.
- Tasks 6.1 and 6.2 additionally claim assertions for incoming/outgoing relations, file-endpoint relations, and FTS-visible content.
- The 16,384-symbol direct removal, direct replacement, and bulk replacement fixtures pass `[]` for relations and omit file content. Their assertions check file/symbol/replacement visibility only.
- The separate rollback test does verify one symbol relation and source-content FTS preservation, but it does not exercise the 16,384-symbol success path.

**Spec-correct / tests-incomplete interpretation**

The implementation is plausible but the scenario is not completely demonstrated. A regression could preserve constant parameter count while leaving dangling symbol relations, and the current large fixtures would still pass.

**Code-correct / scenario-over-specific interpretation**

The SQL directly deletes both `source IN (subquery)` and `target IN (subquery)` before symbol deletion, and smaller existing relation tests exercise relation semantics. If structural SQL review plus those tests is considered sufficient, the implementation is correct and only the verification/task wording overstates what the large tests independently cover.

**Assessment**

This is a substantive missing-test gap. It does not reveal a current code bug, but the task checklist says coverage exists when it does not.

### D3 — LOW: several chunks are bounded but not normalized into input-order-independent chunks

**Evidence**

- The merged requirement asks for deterministic chunks; the design says to sort normalized lookup keys when requested order is not part of the contract.
- `findLogicalSymbolsByIds`, `findDeclarations`, `findPublicBindingsByExportedNames`, `findLogicalSymbolsByQualifiedNames`, `findResolutionSteps`, and `findIndexCoverage` de-duplicate with `Set` but do not sort before `chunksOf()`.
- Their final results are sorted, so observable output is deterministic, but the exact internal chunk membership changes when the caller permutes equivalent inputs.

**Spec-correct / code-incomplete interpretation**

“Deterministic chunks” means canonical chunks independent of input permutation; these methods should sort before chunking.

**Code-correct / wording-broader-than-needed interpretation**

For a given request sequence, `Set` insertion order and `chunksOf()` are deterministic, every statement stays within budget, and final observable results are comparator-sorted. If determinism is an output contract rather than an internal canonicalization requirement, the code satisfies the behavior and the design is more prescriptive than the spec needs.

### D4 — LOW: logical-reference and symbol-path tests weakly assert deterministic content

**Evidence**

- The 901-record logical-reference test includes duplicate and unknown keys, but asserts only `toHaveLength(901)` for five families. It does not compare returned IDs/keys or comparator ordering.
- The 901-path `findSymbols` test proves uniqueness and order stability under reversed input, but does not assert the documented `filePath/line/column/id` ordering directly.
- By contrast, reverse coverage and index coverage tests explicitly assert their required ordering.

**Spec-correct / tests-incomplete interpretation**

Wrong identities with the same count, or a stable but incorrect comparator, could pass. The affected tests should assert exact identity sequences and documented comparator order.

**Code-correct / pragmatic-test interpretation**

The production methods visibly use keyed maps and named comparators, and the full 147-test suite passes. The current tests may be adequate as boundary regressions when paired with structural review, but tasks 7.3 and 7.4 overstate the strength of their assertions.

## Test Coverage

The focused real-adapter suite passed all 147 tests. Relevant new coverage includes:

- host-side empty input dispatch behavior across newly chunked lookup families;
- exactly one host-to-worker RPC for representative oversized logical calls;
- repeated-path parameter accounting at the 446/447 boundary;
- fixed relation-type accounting at the 899/900 boundary;
- 901-item logical-reference lookups;
- 901 workspace freshness and index-coverage lookups;
- 901 file-path `findSymbols` with scalar name filtering;
- direct remove and replacement of a file with 16,384 symbols;
- bulk replacement of a file with 16,384 symbols;
- rollback after cleanup has been staged, including prior symbols, relation, file, and FTS-searchable content.

The tests use Vitest and real SQLite infrastructure in unique `os.tmpdir()` directories, contain explicit assertions rather than snapshots, and conform to the relevant global testing architecture.

## Missing Tests

1. Large direct removal with both incoming and outgoing symbol relations, a file-endpoint relation, and FTS content; assert all are absent after removal.
2. Large direct replacement with those same prior relation/FTS fixtures; assert only replacement state remains.
3. Large bulk replacement with prior incoming/outgoing relations and FTS content; assert atomic replacement and no dangling rows.
4. Exact identity and comparator-order assertions for every 901-record logical-reference family, not just result counts.
5. Direct `compareSymbolNodes` contract assertion across multiple files, lines, columns, and IDs.
6. Optional defensive unit coverage for invalid/exhausted `getSqliteInputChunkSize()` accounting; the helper is private and normal public inputs cannot reach the branches, so this is lower priority.
7. Optional reserved-key coverage for `getFreshnessLatches(['__graph__', ...])`: current `['__graph__', ...new Set(workspaces)]` can bind `__graph__` twice even though observable output remains correct.

## Dependency and global compliance

### `code-graph:graph-store`

- Compliant with atomic file upsert and file removal: cleanup remains a single adapter transaction and removes symbol/file endpoint relations.
- Compliant with deterministic batched/reference queries and reverse-coverage semantics: final result ordering is explicit and unknown keys are omitted.
- Compliant with empty-batch/no-backend-work semantics after the host early-return additions.
- No backend-neutral port signature or SQLite-specific detail leaked into the abstract port.

### `core:config`

- The implementation continues using the existing fixed internal 900-parameter safety constant; no public configuration field, config schema, derived path, or storage selection behavior changes.
- `specd.yaml` is concurrently modified to remove `rtk` from lifecycle hook commands. That edit is not part of the SQLite proposal/design and is not needed by these requirements; it appears to be separate workspace work and must not be attributed to this implementation without explicit ownership.

### `code-graph:symbol-model`

- Symbol IDs, immutable node shapes, relation vocabulary, reference facts, and canonical logical identities are unchanged.
- Cleanup covers all polymorphic relation endpoint directions without introducing schema foreign keys or mutating domain values.
- Deterministic comparators use existing node fields only.

### `code-graph:workspace-integration`

- Canonical workspace-prefixed file paths remain opaque bound values; no parsing, drive-letter logic, workspace filter, or resolution identity changes.
- Freshness results preserve caller workspace keys and false defaults.

### Global architecture and conventions

- Changes stay in the SQLite infrastructure adapter and its integration test; no inner layer imports infrastructure and no new public adapter export is introduced.
- TypeScript remains strict/ESM with named existing surfaces and no `any` introduced.
- New helper/comparator have JSDoc. Existing touched methods retain JSDoc.
- No public composition or CLI contract changes require documentation.

### Global testing and documentation

- Tests are correctly located under `test/infrastructure/sqlite`, use Vitest and portable temporary-directory APIs, and avoid snapshots.
- No ADR is warranted: the approach is local to one existing SQLite adapter and follows the existing worker/transaction architecture.
- Concurrent changes to `specs/_global/architecture/spec-lock.json` and `specs/_global/docs/spec-lock.json` are not described by this change and should be treated as unrelated metadata refreshes unless separately owned.

## Final counts

| Category                               | Count |
| -------------------------------------- | ----: |
| Changed requirements audited           |     2 |
| Requirements implemented               |     2 |
| Verification scenarios audited         |     8 |
| Scenarios behaviorally passing         |     8 |
| Focused tests passed                   |   147 |
| Critical discrepancies                 |     0 |
| High discrepancies                     |     0 |
| Medium discrepancies                   |     2 |
| Low discrepancies                      |     2 |
| Missing/strengthening tests identified |     7 |

## Overall assessment

**PASS WITH FINDINGS.** The production implementation satisfies the merged SQLite parameter-budget and atomic-cleanup requirements, and the focused real-adapter suite passes. The principal concerns are traceability and proof strength: `SQLiteGraphStore` was modified despite an explicit design non-goal, and the large cleanup tests do not include the incoming/outgoing relation and FTS fixtures claimed by the scenarios/tasks. These findings warrant either artifact correction plus stronger tests, or an explicit reviewer decision that structural code evidence and existing smaller tests are sufficient before archiving.
