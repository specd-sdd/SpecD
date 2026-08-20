# Spec compliance audit — deprecate-ladybug-store

**Mode:** Specific change (`deprecate-ladybug-store`)

## Summary

The implementation conforms to all eight merged change specs and their verification scenarios. No compliance defects or blocking findings were identified.

| Category                  | Count |
| ------------------------- | ----: |
| Change specs audited      |     8 |
| Merged scenarios assessed |   71+ |
| Compliance defects        |     0 |
| Blocking findings         |     0 |
| Advisory findings         |     1 |

The only advisory is an intermittent Vitest worker-exit issue during a forked package run. The targeted serial Code Graph suite passed, as did the focused CLI suite and the workflow pre-hook's repository test/lint checks.

## Scope

- `code-graph:ladybug-graph-store`
- `code-graph:composition`
- `code-graph:sqlite-graph-store`
- `cli:graph-cli-context`
- `cli:graph-stats`
- `cli:graph-impact`
- `cli:graph-hotspots`
- `cli:graph-search`

The audit also considered the relevant global architecture/conventions/testing directives and direct dependency constraints.

## Detailed findings

### Code Graph

# Code-graph compliance audit — deprecate-ladybug-store

## Scope and result

Audited merged change artifacts and implementation for:

- `code-graph:ladybug-graph-store` — 1 verification scenario
- `code-graph:composition` — 30 verification scenarios
- `code-graph:sqlite-graph-store` — 40 verification scenarios

Result: **PASS**. No requirement, scenario, dependency, or implementation-compliance defects were found in these three spec areas.

## Evidence

- Change status is `verifying`; all scoped artifacts are complete, all 57 tasks are done, `review: required` is absent, and signoff is off.
- `graph stats` is current (`stale: false`, `contentFresh: true`, `coverageComplete: true`). Graph impact identifies `SQLiteGraphStore` as CRITICAL and its affected composition/provider and SQLite test files were reviewed.
- `createCodeGraphProvider` has a fresh per-provider registry with exactly the built-in `sqlite` factory, defaults to `sqlite`, preserves additive external factories, rejects a `sqlite` collision before construction, and raises the unknown-backend registry error for an unregistered id. Construction remains synchronous and lazy native SQLite loading occurs in `SQLiteGraphStore.open()`.
- The public barrel exposes factory-facing contracts and does not expose `LadybugGraphStore`, `SQLiteGraphStore`, `AdapterRegistry`, or `IndexCodeGraph`; `InMemoryIndexSession` remains internal-only. `@specd/core` remains a package dependency and the `SpecdConfig` overload derives storage from `configPath`.
- `SQLiteGraphStore` owns its graph/tmp paths, lazy database opening, schema setup/version rejection, destructive graph-root recreation, storage-generation rotation, transactional bulk writes, persisted content/relations, and FTS/identity-ranking paths. This matches the merged SQLite requirements without retaining Ladybug fallback or parity assumptions.
- A repository-wide code/dependency/test scan found no active Ladybug source, exports, native dependency, schema, fixture, test, or built-in registration in `@specd/code-graph`; remaining occurrences are historical changelog records only. The adjacent preservation repository contains `ladybug:graph-store`, its Ladybug implementation/factory/tests, `@ladybugdb/core@0.19.1`, provenance, and the required read-only upstream workspace declarations.

## Test evidence

- `pnpm --filter @specd/code-graph exec vitest run test/composition/code-graph-provider.spec.ts test/infrastructure/sqlite/sqlite-graph-store.spec.ts test/barrel.spec.ts --pool=threads --maxWorkers=1`
  - **PASS:** 3 files, 135 tests.
- An initial package-script invocation reported 602 passing tests but exited non-zero because one forked Vitest worker exited unexpectedly (46/47 files completed). Re-running the affected verification suites serially passed; this is recorded as a test-runner concurrency advisory, not a functional compliance failure.

## Counts

| Category                  | Count |
| ------------------------- | ----: |
| Specs audited             |     3 |
| Merged scenarios assessed |    71 |
| Compliance defects        |     0 |
| Blocking findings         |     0 |
| Advisory findings         |     1 |

## Advisory

The default forked Vitest invocation is intermittently unstable in this environment. Keep the package's configured serial/native-safe execution for release verification, or investigate the worker exit separately; the focused serial run is clean.

### CLI

# CLI compliance audit — deprecate-ladybug-store

Scope: `cli:graph-cli-context`, `cli:graph-stats`, `cli:graph-impact`, `cli:graph-hotspots`, and `cli:graph-search`.

## Result

**PASS — 0 findings.** The five merged CLI specs and their merged verification scenarios are implemented consistently with the Ladybug deprecation design.

## Evidence reviewed

- Change state was `verifying`; all spec and verify artifacts were `complete`, with 57/57 tasks complete and no reported blockers or review requirement.
- Graph index was current (`stale: false`, `knownStaleSinceLastIndex: false`, complete indexed coverage), so graph-first symbol discovery was authoritative.
- Reviewed merged `spec.md` and `verify.md` artifacts for all five owned CLI spec IDs, including the change deltas that replace graph-store-specific cleanup/host bootstrap paths.
- Inspected the graph-discovered implementation entry points:
  - `packages/cli/src/commands/graph/resolve-graph-cli-context.ts`
  - `packages/cli/src/commands/graph/with-provider.ts`
  - `packages/cli/src/commands/graph/stats.ts`
  - `packages/cli/src/commands/graph/impact.ts`
  - `packages/cli/src/commands/graph/hotspots.ts`
  - `packages/cli/src/commands/graph/search.ts`

## Requirement / scenario assessment

| Spec                    | Assessment                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli:graph-cli-context` | PASS. Configured contexts retain a resolved kernel and project root without VCS validation; bootstrap contexts require a VCS root and build the synthetic workspace. `withProvider` delegates lifecycle to SDK `withOpenGraphProvider`, reuses an available resolved kernel, has no graph-store signal handlers, and does not call `process.exit(0)`. |
| `cli:graph-stats`       | PASS. Stats resolves the shared graph context, calls `withProvider`, invokes `provider.getGraphHealth()` once, and renders the returned structured health unchanged for JSON/TOON. It performs no lock probe or presenter-side health recomputation.                                                                                                  |
| `cli:graph-impact`      | PASS. Impact validates inputs before context creation, resolves the common context, uses `withProvider`, and delegates traversal/selector operations to the open provider. No Ladybug/native store ownership remains in the handler.                                                                                                                  |
| `cli:graph-hotspots`    | PASS. Hotspots resolves the common context, opens through `withProvider`, obtains stale diagnostics from the provider-side lifecycle, and delegates ranking/querying to `getHotspots`.                                                                                                                                                                |
| `cli:graph-search`      | PASS. Search resolves the common context and opens through `withProvider`; it passes categories, limits, filters, snippets, and workspace selectors to the unified provider search instead of rebuilding cross-category behavior in the CLI. Rendering preserves the provider projection and only controls presentation fields.                       |

## Dependency and global consistency

- The shared CLI commands import platform/provider types and orchestration from `@specd/sdk`; CLI delivery code remains an adapter and does not depend on Ladybug implementation details.
- The implementation follows the merged `code-graph:composition` constraint that provider construction/lifecycle are SDK-owned and the `cli:entrypoint` error/output conventions: availability failures flow through the standard handler rather than a host-owned pre-open lock check.
- Search, impact, and hotspots retain only command-specific presentation/argument parsing; the Code Graph provider owns semantic graph operations, satisfying the architecture boundary.

## Tests

Focused suite executed successfully:

```text
pnpm --filter @specd/cli test -- graph-cli-context graph-stats graph-impact graph-hotspots graph-search

Test Files  79 passed (79)
Tests       861 passed (861)
```

The command emitted expected fixture/error-path console output, but exited successfully.

## Findings

None. No remediation is required for this audit scope.

## Conclusion

The change is compliant with its merged specifications. No corrective design or implementation work is required before the standard verification transition, subject to user approval.
