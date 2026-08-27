# Partial compliance audit — code-graph coverage indexing

Scope: `repair-code-graph-coverage-indexing`, covering `code-graph:indexer`,
`code-graph:graph-store`, `code-graph:sqlite-graph-store`,
`code-graph:get-graph-health`, and `cli:graph-index`.

Audit method: merged change previews, current global/dependency specs, graph-first
symbol discovery, implementation inspection, and the current graph statistics.
The graph was current at audit start and reported 168 `COVERS_FILE` and 403
`COVERS_SYMBOL` relations, with `coverageComplete: true`.

## Requirements summary

| Spec                            | Change obligations assessed                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `code-graph:indexer`            | Forced runs reconsider all inputs; rebuild coverage from complete semantic facts; symbol coverage targets logical IDs; unresolved coverage yields deterministic diagnostics, not guessed fallback; result exposes coverage evidence. |
| `code-graph:graph-store`        | A logical generation clear removes every graph-visible generation artifact; coverage endpoint types distinguish file and logical-symbol targets.                                                                                     |
| `code-graph:sqlite-graph-store` | SQLite validates `COVERS_SYMBOL` against logical symbols, replaces reference/coverage facts atomically, and clears all logical-generation state.                                                                                     |
| `code-graph:get-graph-health`   | Persisted indexed coverage lacking a physical file/document makes graph content inconsistent and not fresh.                                                                                                                          |
| `cli:graph-index`               | CLI preserves forced-rebuild, coverage, and diagnostic evidence in text and structured output through the isolated SDK worker.                                                                                                       |

## Implementation status

### `code-graph:indexer` — substantially implemented

- `IndexCodeGraph` forces every discovered selected input through the full-rebuild
  branch when `options.force` is true (`index-code-graph.ts:809-850`), and sends
  `replaceCodeGraph: fullRebuild` to the bulk session (`:1798-1803`). This addresses
  the former force-clear/hash-skip failure mode.
- Specs are read through the semantic repository aggregate
  `readPersistedState`, then implementation links are projected by the pure
  `projectSpecCoverage` service (`:1564-1580`,
  `application/services/project-spec-coverage.ts:38-114`). The materialized
  metadata fingerprint is derived from Core; Core's `specFingerprint` includes
  the persisted-state hash (`packages/core/src/infrastructure/fs/spec-repository.ts:759-767`),
  so an implementation-sidecar change participates in the semantic skip key.
- Projection hydrates retained symbols/reference facts before reprojecting when
  needed (`index-code-graph.ts:1621-1666`). It emits file coverage only for a
  file-only link, and emits logical-symbol coverage only for exactly one logical
  target; missing and ambiguous targets become sorted diagnostics.
- `IndexResult` carries stable coverage totals and diagnostics
  (`domain/value-objects/index-result.ts:43-83`).

### `code-graph:graph-store` and `code-graph:sqlite-graph-store` — implemented

- The SQLite logical clear deletes relations, reference facts, coverage,
  observations, latches, nodes, metadata freshness keys, and FTS state in one
  transaction (`sqlite-graph-database.ts:2865-2886`).
- Reference-fact replacement deletes both coverage relation kinds before replacing
  logical/reference facts (`:3015-3025`), preventing stale coverage endpoints.
- Endpoint validation explicitly requires a spec source and logical-symbol target
  for `COVERS_SYMBOL` (`:4166-4169`); candidate resolution includes
  `logical_symbols` (`:2799-2805`).

### `code-graph:get-graph-health` — implemented

- Health reads coverage together with persisted files/documents and treats an
  `indexed` fact without either physical node as inconsistent
  (`get-graph-health.ts:238-277`). It forces `contentFresh: false`, makes
  coverage incomplete, adds `indexed-node-missing`, and returns
  `GRAPH_CONTENT_INCONSISTENT` (`:167`, `:318-320`, `:734-737`).

### `cli:graph-index` — implemented

- The CLI schema and text renderer preserve `fullRebuild`, `fullRebuildReason`,
  coverage status counts/reasons, and sorted coverage diagnostics rather than
  recomputing them (`packages/cli/src/commands/graph/index-graph.ts:49-57,
179-205`). Documentation was updated in `docs/cli/cli-reference.md` and
  `docs/code-graph/index.md`.

## Discrepancies and decision points

### C-01 — contradictory repository-port contract in `code-graph:indexer` (spec drift; high confidence)

`code-graph:indexer` still requires
`readPersistedImplementation()` and `readPersistedDependsOn()`
(`specs/code-graph/indexer/spec.md:23, 231-232`). Its direct dependency,
`core:spec-repository-port`, explicitly says these field-wise methods **must not**
be in the port and that `readPersistedState()` is the sole semantic sidecar API
(`specs/core/spec-repository-port/spec.md:241-245`; verification
`specs/core/spec-repository-port/verify.md:38-44`).

The implementation uses `readPersistedState()` once and derives both arrays
(`index-code-graph.ts:1564-1566`), which conforms to the Core dependency and
does not inspect sidecar files. Therefore the likely fault is stale wording in
the indexer spec, not a code defect. The alternative is to reintroduce deprecated
field-wise port operations, but that would violate the direct Core dependency.

Recommendation: amend the indexer wording/scenarios to require one aggregate
`readPersistedState()` read and projection of its `implementation` and
`dependsOn` fields.

### C-02 — no observed integration test for implementation-only sidecar update (test gap; medium confidence)

The pure projection tests prove logical/file projection, no guessed fallback,
missing-file diagnostics, and ambiguity diagnostics. The integration/CLI tests
prove forced worker execution, repair, locking, structured output, and SQLite
reference behavior. However, the audited test set has no clearly named
end-to-end case that mutates only persisted implementation state between normal
incremental runs and asserts replacement/preservation of both coverage kinds.

Code evidence indicates it should work because Core's metadata fingerprint
includes persisted state, but an explicit regression test would protect the
cross-package premise that made this bug possible.

## Test coverage

- Unit: `project-spec-coverage.spec.ts` covers file coverage, uniquely resolved
  logical symbol coverage, missing files, missing symbols, ambiguity, sorted
  diagnostics, and no fallback.
- Unit: `get-graph-health.spec.ts` covers an indexed coverage fact with no
  persisted graph node and checks inconsistency reason codes.
- Store contract/integration: `graph-store.contract.ts`,
  `sqlite-graph-store.spec.ts`, and `sqlite-wide-traversal.spec.ts` exercise
  logical endpoints/reference facts.
- CLI integration: `graph-index.spec.ts` and
  `graph-index-integration.spec.ts` cover result rendering, worker isolation,
  forced structured indexes, recovery behavior, and lock release.
- Verification evidence supplied by the implementation pass: Code Graph
  **711/711** and CLI **877/877** tests passing; typecheck and lint passing.

## Dependency consistency

- The implementation follows the global Ports/Adapters direction: pure coverage
  projection remains application-layer code and SQLite behavior remains in the
  infrastructure adapter.
- `code-graph:sqlite-graph-store` conforms to `code-graph:graph-store` by using
  logical identities for symbol coverage.
- `cli:graph-index` preserves the SDK/isolated-worker boundary; no direct
  `@specd/code-graph` import was introduced by the changed CLI command.
- The one material dependency inconsistency is C-01, in the indexer spec wording
  relative to the current Core port contract.

## Summary counts

- Specs audited: **5**
- Requirements/contract areas assessed: **5**
- Implemented and evidenced: **5**
- Code defects found: **0**
- Spec/dependency discrepancies: **1** (C-01)
- Test gaps: **1** (C-02)
- Blocking findings: **0**; C-01 requires an artifact update before the change can
  be called fully compliant.
