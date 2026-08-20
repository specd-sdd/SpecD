# CLI graph commands compliance audit — deprecate-ladybug-store

## Scope

Read-only audit of `cli:graph-impact`, `cli:graph-hotspots`, and
`cli:graph-search`, evaluated against their merged change previews, direct
dependencies, and global conventions.

## Requirements and implementation status

| Spec                 | Status | Evidence                                                                                                                                                                                                                                         |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cli:graph-impact`   | Pass   | `registerGraphImpact` resolves context with `resolveGraphCliContext` and opens the provider via `withProvider`. Graph impact shows the command's direct dependents are the CLI entrypoint and `graph-impact.spec.ts`; the full CLI suite passed. |
| `cli:graph-hotspots` | Pass   | `registerGraphHotspots` uses the shared context/provider seam. Its graph dependents include its CLI registration and 28 targeted test symbols in `graph-hotspots.spec.ts`; the command retains the provider-owned availability path.             |
| `cli:graph-search`   | Pass   | `registerGraphSearch` delegates to the shared context/provider seam and to the provider's unified search surface. Its direct dependents are the CLI entrypoint and 25 targeted test symbols in `graph-search.spec.ts`.                           |

## Discrepancies

No additional discrepancy was confirmed for these three command adapters. They
inherit the shared `withProvider` lifecycle concern recorded in the CLI lifecycle
audit; this audit does not duplicate it as a command-local defect.

## Test coverage

The verification hooks ran the complete CLI suite successfully: **79 test files,
861 tests**. Graph impact confirms focused test coverage for impact, hotspots, and
search. The commands preserve the global architecture boundary: presentation and
argument handling stay in CLI while provider lifecycle and graph behavior remain in
SDK/Code Graph.

## Summary counts

| Metric                              | Count |
| ----------------------------------- | ----: |
| Specs audited                       |     3 |
| Passing command adapters            |     3 |
| New command-local discrepancies     |     0 |
| Inherited shared-lifecycle concerns |     1 |
