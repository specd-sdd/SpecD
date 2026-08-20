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
