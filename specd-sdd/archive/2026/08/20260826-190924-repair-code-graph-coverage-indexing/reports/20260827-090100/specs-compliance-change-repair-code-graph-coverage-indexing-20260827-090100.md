# Spec compliance audit — repair-code-graph-coverage-indexing

Mode: Full change audit

Scope: `code-graph:indexer`, `code-graph:graph-store`,
`code-graph:sqlite-graph-store`, `code-graph:get-graph-health`, and
`cli:graph-index`, with their project-wide rules and direct dependencies.

## Summary

| Metric                               | Result |
| ------------------------------------ | ------ |
| Specs audited                        | 5      |
| Implemented contract areas evidenced | 5      |
| Code defects                         | 0      |
| Spec/dependency discrepancies        | 1      |
| Test gaps                            | 1      |
| Blocking findings                    | 0      |

The implementation satisfies the forced-rebuild, logical coverage,
health-integrity, SQLite endpoint, and CLI-evidence behavior. The graph was
refreshed before the audit and reports 168 `COVERS_FILE`, 403 `COVERS_SYMBOL`,
and `coverageComplete: true`. Code Graph tests (711), CLI tests (877),
typecheck, and lint passed during verification.

## Required decision

The audit found one high-confidence spec drift: `code-graph:indexer` requires
deprecated field-wise repository reads that its direct dependency
`core:spec-repository-port` explicitly prohibits. Production code correctly
uses `readPersistedState()` once. The indexer spec should be corrected before
the change is considered fully compliant. It also recommends an explicit
implementation-sidecar-only E2E regression.

## Detailed findings

<!-- The complete batch report is retained below verbatim for audit traceability. -->

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

## Discrepancies and decision points

### C-01 — contradictory repository-port contract in `code-graph:indexer` (spec drift; high confidence)

`code-graph:indexer` still requires `readPersistedImplementation()` and
`readPersistedDependsOn()`. Its direct dependency, `core:spec-repository-port`,
explicitly makes `readPersistedState()` the sole semantic sidecar API. The
implementation correctly uses `readPersistedState()` once and derives both
arrays. Amend the indexer wording and scenarios rather than reintroducing the
deprecated field-wise port operations.

### C-02 — explicit implementation-only sidecar E2E is missing (test gap; medium confidence)

Unit and integration coverage establishes projection, diagnostics, force, worker
execution, and SQLite persistence, but does not include a clearly named E2E that
changes only persisted implementation state between normal incremental runs and
asserts replacement of both coverage kinds.

## Implementation and test evidence

- Force bypasses incremental skip authority and commits a complete logical generation.
- Coverage is projected through a pure application service to logical symbol IDs.
- SQLite validates logical coverage endpoints and clears generation-owned state.
- Health reports missing indexed physical nodes as inconsistent.
- CLI preserves summary and diagnostics without recomputation.
- Code Graph: 711/711 tests passed; CLI: 877/877 tests passed; typecheck and lint passed.

## Dependency consistency

The implementation follows the global Ports/Adapters rules, keeps coverage projection
in the application layer, and preserves the SDK/isolated-worker boundary. The only
material inconsistency is C-01, which is specification wording versus the Core port.
