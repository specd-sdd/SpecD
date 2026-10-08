# Specs compliance report — `fix-sqlite-delete-file-variable-limit`

## Executive summary

The change is substantially compliant with its merged specification, direct dependency specs, and applicable global constraints. No implementation defect, specification contradiction, duplicated requirement, or artifact-boundary problem was found. All four findings from the preceding audit (D1–D4) are closed.

The audit found one Low-severity verification gap: the direct `upsertFile()` path is transactionally correct by inspection, but the suite does not force that path to fail after cleanup has begun and prove rollback of the previously committed state. Bulk rollback is covered directly. This is a missing regression test, not evidence of incorrect behavior.

### Counts

- Functional specs reviewed: 5 (1 changed, 4 direct dependencies)
- Changed requirements: 2
- Changed scenarios: 8
- Fully covered scenarios: 7
- Implementation-compliant scenarios with partial direct test coverage: 1
- Implementation/spec contradictions: 0
- High findings: 0
- Medium findings: 0
- Low findings: 1
- Prior findings closed: 4/4

## Verification evidence

- Focused SQLite integration suite: 147/147 passed.
- Package build, typecheck, and lint: passed.
- Repository implementing hooks for tests, lint, and typecheck: passed.
- Code graph: current, content fresh, and coverage complete at audit time.

## Detailed findings

The independent workspace audit follows verbatim.

# Compliance audit — `code-graph:sqlite-graph-store`

## Conclusion

**Substantially compliant; one low-severity test-coverage gap.** The merged change delta is consistent with the four direct dependency specs and applicable global constraints. The implementation fixes the SQLite host-variable failure on all three cleanup entry points, keeps chunking inside one worker operation, accounts for fixed and repeated bind positions, preserves deterministic results, and avoids host RPCs for the newly affected empty batches. No implementation defect or spec contradiction was found.

The only residual issue is verification depth: rollback after cleanup begins is exercised through bulk commit, but the direct `upsertFile()` branch is not forced to fail after its cleanup step. The implementation is transactionally correct by inspection, so this is a missing regression test rather than evidence of a product defect.

## Scope and method

- Mode: specific change, `fix-sqlite-delete-file-variable-limit`.
- Merged change spec: `code-graph:sqlite-graph-store`.
- Direct dependencies reviewed: `code-graph:graph-store`, `core:config`, `code-graph:symbol-model`, `code-graph:workspace-integration`.
- Applicable globals reviewed: architecture, conventions, testing, docs, eslint, continuous integration, error handling, and logging.
- Change artifacts reviewed: proposal, merged spec preview, verification delta, design, and all 35 completed tasks.
- Code graph state: current, content fresh, coverage complete (1,207 indexed files, 42,735 symbols, 291 specs).
- Primary implementation files: `sqlite-graph-database.ts`, `sqlite-graph-store.ts`, and the SQLite integration suite.

## Requirements summary

| Requirement / scenario                                        | Status                                          | Evidence                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker-efficient batch reads — one logical batch / one RPC    | Compliant                                       | Host sends one request per public call; oversized dispatch test checks the exact operation sequence at `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts:427-451`.                                                                                                                      |
| Collection-binding reads stay inside parameter budget         | Compliant                                       | Central accounting helper uses `(900 - fixed) / multiplicity` at `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts:108-131`; affected lookup methods chunk normalized inputs at lines 899-928, 1237-1375, 2204-2218, and 2302-2427.                                                        |
| Fixed and repeated parameters count toward budget             | Compliant                                       | `findDirectlyAffectedFiles()` reserves the import/type parameters and multiplicity two at `sqlite-graph-database.ts:899-928`; reverse coverage reserves one relation type at `sqlite-graph-database.ts:3159-3170`. Boundary tests use 446/447 paths and 899/900 targets at `sqlite-graph-store.spec.ts:455-556`. |
| Empty batch avoids worker and SQLite work                     | Compliant                                       | Host guards are present in `sqlite-graph-store.ts:442-445`, `553-586`, and `861-960`; the spy assertion covers every newly guarded family at `sqlite-graph-store.spec.ts:406-425`. Freshness intentionally retains the internal `__graph__` lookup.                                                              |
| File upsert/removal are one transaction and rollback on error | Implementation compliant; test coverage partial | Both callers wrap cleanup and subsequent work in `db.transaction(...)` at `sqlite-graph-database.ts:1945-1980`; the cleanup helper is constant-width at lines 2972-2982. A direct post-cleanup failure is not exercised; see L1.                                                                                 |
| Bulk indexing is atomic                                       | Compliant                                       | Cleanup and replacement run within one `db.transaction(...)` at `sqlite-graph-database.ts:2448-2495`; the forced constraint-failure test proves baseline file, symbols, relation, and FTS content survive at `sqlite-graph-store.spec.ts:1010-1085`.                                                             |
| Direct cleanup succeeds above former host-variable limit      | Compliant                                       | Removal and replacement each persist 16,384 symbols plus incoming/outgoing symbol relations, a file endpoint relation, and distinct FTS content; exact absence/replacement assertions appear at `sqlite-graph-store.spec.ts:2393-2573`.                                                                          |
| Bulk cleanup succeeds above former host-variable limit        | Compliant                                       | The 16,384-symbol bulk replacement checks incoming/outgoing relations, file endpoint relation, old FTS absence, new FTS visibility, and retained unrelated state at `sqlite-graph-store.spec.ts:2575-2699`.                                                                                                      |

Scenario totals: **8 total; 7 fully covered; 1 implementation-compliant with a low-severity direct-test gap; 0 non-compliant.**

## Implementation status

### Constant-width cleanup

`deleteFileLocalState()` no longer materializes symbol identifiers. It deletes symbol-endpoint relations with two file-path binds, then symbols with one bind, then file-endpoint relations, file FTS, and the file row (`packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts:2972-2982`). Its three callers preserve their existing transaction ownership: direct upsert and removal at lines 1945-1980, and bulk commit at lines 2448-2495. This matches the design sequence at `design.md:190-214` and remains compatible with the dependency spec's atomic mutation contract.

### Budget-aware reads and deterministic merging

`getSqliteInputChunkSize()` validates its accounting inputs and enforces a 900-bind ceiling (`sqlite-graph-database.ts:108-131`). Fixed and repeated positions are explicitly accounted for in `findDirectlyAffectedFiles()` (`:899-928`) and `getRelationsByTargets()` (`:3159-3170`). The remaining affected collection methods deduplicate and sort their primary keys before `chunksOf()`, merge by stable identity, and apply contract comparators (`:1237-1375`, `:2204-2218`, `:2302-2427`). `findSymbols()` subtracts active scalar parameters and finishes with `compareSymbolNodes`, whose order is file path, line, column, then id (`:1292-1383`, `:3912-3918`).

The implementation therefore preserves the abstract `code-graph:graph-store` ordering, unknown omission, deduplication, and atomicity semantics. It introduces no change to `core:config`, the symbol model, workspace ownership, public signatures, worker DTOs, schema, or persistence layout.

### Host boundary

The public adapter returns before `client.sendRequest(...)` for all collection families identified by the design (`packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts:442-445`, `:553-586`, `:861-960`). This is important because database-side empty checks alone could not satisfy the no-worker-RPC clause. Non-empty payloads and RPC names are unchanged.

## Test coverage

The integration suite provides strong observable coverage rather than SQL-text assertions:

- one RPC per oversized logical lookup (`sqlite-graph-store.spec.ts:427-451`);
- no RPC for newly guarded empty collections, with the intentional freshness exception (`:406-425`);
- exact 446/447 repeated-path boundary and 899/900 fixed-type boundary (`:455-556`);
- 901-record logical symbol, declaration, public binding, qualified-name, resolution-step, freshness, index-coverage, and multi-file symbol reads (`:568-735`, `:1839-1914`);
- reverse-input stability and exact comparator-oriented identity sequences (`:680-733`, `:1875-1914`);
- complete large direct and bulk cleanup state, including relation directions and FTS (`:2393-2699`);
- transactional bulk rollback after cleanup begins (`:1010-1085`).

Reported validation evidence is consistent with the inspected implementation: focused SQLite suite **147/147**, package build/typecheck/lint successful, and implementing hooks for repository tests/lint/typecheck successful. No contradictory disabled, skipped, or snapshot-based coverage was found in the affected test file.

## Prior findings D1–D4

| Prior finding                                            | Resolution                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 — design omitted host/store changes                   | **Closed.** `design.md:72-84` explicitly lists the host guards, unchanged DTOs, and compatibility rationale; proposal impact includes the store at `proposal.md:60-62`.                                                                                                                   |
| D2 — 16,384 cleanup tests omitted relations and FTS      | **Closed.** Direct remove, direct replace, and bulk replace now persist and assert incoming/outgoing symbol relations, a file-endpoint relation, old FTS absence, and replacement FTS visibility (`sqlite-graph-store.spec.ts:2393-2699`).                                                |
| D3 — normalized chunk inputs were not sorted             | **Closed.** All identified unordered-set lookup keys are deduplicated and sorted before chunking; freshness includes `__graph__` exactly once (`sqlite-graph-database.ts:1237-1375`, `:2204-2218`, `:2302-2427`, `:3159-3170`). The design records this invariant at `design.md:175-186`. |
| D4 — oversized-read assertions were count/stability only | **Closed.** Logical-reference families, index coverage, freshness, and multi-file symbols now compare complete expected identity sequences and exercise reversed equivalent inputs (`sqlite-graph-store.spec.ts:568-733`, `:1839-1914`).                                                  |

## Dependency and global-spec conformance

- `code-graph:graph-store`: unchanged port and DTOs; ordering, unknown omission, deduplication, one logical operation, and transaction atomicity remain intact.
- `core:config`: persistence derivation and configuration behavior are untouched.
- `code-graph:symbol-model`: no symbol identity, location, or comparator contract is widened; the new local comparator uses existing fields only.
- `code-graph:workspace-integration`: canonical workspace/file values are only lookup keys; ownership and workspace mapping are unchanged.
- Global architecture: changes stay in the SQLite infrastructure adapter and integration test; no inner-layer dependency or composition violation.
- Global conventions/eslint/docs: strict named TypeScript, explicit local helpers, JSDoc, and ESM conventions are preserved. No public API/CLI/config/schema/operator behavior changed, so `design.md:17-19` reasonably concludes that no `docs/` update is needed.
- Global testing: Vitest integration tests mirror the infrastructure path, use unique temporary directories, clean up, and avoid snapshots.

## Discrepancies and prioritized findings

### L1 — Direct upsert rollback branch lacks a forced post-cleanup failure test

**Severity: Low — test coverage gap, not an observed implementation defect.**

The merged verification scenario says that when `upsertFile()` or `removeFile()` fails after cleanup begins, previously committed file, symbols, and relations remain intact. Task 6.4 likewise attributes its rollback regression to both direct file mutation and bulk indexing. The only forced post-cleanup failure located is the bulk-session constraint failure at `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts:1010-1085`; it calls `session.commit()`, not direct `store.upsertFile()`.

The direct implementation is nevertheless transactionally sound by inspection: `upsertFile()` invokes `deleteFileLocalState()`, replacement inserts, reference-fact replacement, FTS refresh, and timestamp update inside the same `db.transaction(...)` callback (`packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts:1945-1965`). `removeFile()` also encloses cleanup and timestamp update in one transaction (`:1971-1980`). SQLite rollback therefore supports the spec, but a future regression in the direct path would not be isolated by the change-specific tests.

Possible resolutions:

1. Implementation/test interpretation: add a direct `upsertFile()` case whose duplicate reference facts or another deterministic constraint violation occurs after cleanup, then assert the original file, symbols, relations, and FTS remain.
2. Spec/test interpretation: if bulk rollback plus structural transaction inspection is considered sufficient, narrow task 6.4's claimed scenario coverage; this is less desirable because the verification scenario explicitly names direct file mutation.

No reliable failure injection exists for `removeFile()` without test-only hooks, so a direct upsert rollback test is the proportional addition.

## Deduplication and artifact quality

No duplicated requirement or conflicting artifact was found. The proposal states intent and boundaries, the delta contains only observable requirements/scenarios, the design owns implementation mechanics, and tasks map concrete edits/tests to those scenarios. The TypeScript extraction concern is correctly isolated as a non-goal and delegated to `filter-typescript-array-data-symbols`; temporary exclusions appear only as an explicit design non-goal and are absent from the spec and verification delta, as requested.

## Summary counts

- Specs in functional scope: **5** (1 changed, 4 direct dependencies).
- Changed requirements: **2**.
- Changed scenarios: **8**.
- Fully compliant scenarios: **7**.
- Partially covered but implementation-compliant scenarios: **1**.
- Implementation/spec contradictions: **0**.
- High findings: **0**.
- Medium findings: **0**.
- Low findings: **1**.
- Prior findings closed: **4/4**.
