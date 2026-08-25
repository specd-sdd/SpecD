# Compliance audit — Code Graph composition, project index, store, and SQLite

## Scope and audit method

- Change mode: `centralize-graph-index-worker`; merged change previews were read for
  `code-graph:composition`, `code-graph:index-project-graph`,
  `code-graph:graph-store`, and `code-graph:sqlite-graph-store`, including their
  merged verification scenarios.
- Direct dependencies considered: `code-graph:graph-store`, `code-graph:indexer`,
  `code-graph:symbol-model`, `code-graph:staleness-detection`,
  `code-graph:document-model`, `code-graph:workspace-integration`, and `core:config`.
  Applicable global requirements were `default:_global/architecture`,
  `default:_global/error-handling-conventions`, and `default:_global/testing`.
- Graph-first discovery was attempted. `graph stats` says current but reports zero
  files and symbols, and symbol queries therefore returned no implementation symbols.
  Source/test inspection was used as the documented fallback. This is a non-scoped
  audit-tooling observation, not an implementation discrepancy below.

## Requirements Summary

1. **Composition:** a forced `CodeGraphProvider.index()` performs logical clear and
   full reanalysis, never physical recreation. `recreate()` is a closed-provider
   physical recovery operation, while parameterless `open()` never recovers
   implicitly. Public exports expose typed recovery contracts but hide raw locking,
   worker protocol, concrete stores, and child mechanics.
2. **IndexProjectGraph:** accepts an already-open provider and prepared inputs;
   forwards force/VCS/progress intent to `provider.index()` and owns no open, close,
   clear, recreate, lock, process, or recovery operation.
3. **GraphStore:** separates logical `clear()` on a healthy open store from physical,
   closed-only `recreate()`; supports a typed recoverable-open error only for known
   corruption/schema incompatibility and leaves partial opens closed.
4. **SQLiteGraphStore:** enforces the same closed-only recreation contract, removes
   the persistence directory and rotates generation without spawning/reopening a
   worker, and classifies only known corrupt/non-migratable database failures.

## Implementation Status

| Scope                              | Requirement evidence                                                                                                                                                                                                                                                                                                                                                                                                                                     | Status     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `code-graph:composition`           | `CodeGraphProvider.index()` calls `store.clear()` when `options.force === true`, then delegates to the indexer. `recreate()` rejects `this._isOpen`, delegates only after closure, and clears the cached generation. `open()` has no input/flag and just opens then reads generation. Public barrel exports `runIsolatedGraphIndex`, recovery errors, and host contracts; raw lock helpers occur only in `src/index.ts` (internal), not `src/public.ts`. | Conformant |
| `code-graph:index-project-graph`   | `IndexProjectGraph.execute()` is a pure forwarding use case: it constructs one `provider.index()` input from prepared fields, includes `force` only when true, and calls no provider lifecycle/recovery/lock/process method.                                                                                                                                                                                                                             | Conformant |
| `code-graph:graph-store`           | The abstract port retains parameterless `open()`, explicit `clear()`, and documented closed-only `recreate()`. Concrete implementations (`SQLiteGraphStore` and the in-memory test adapter) reject open recreation and rotate generation only on physical recreation.                                                                                                                                                                                    | Conformant |
| `code-graph:sqlite-graph-store`    | `SQLiteGraphDatabase.open()` closes a partially allocated DB and clears statements before classifying. Classification is deliberately narrow: incompatible schema, `SQLITE_CORRUPT`, `SQLITE_NOTADB`, and known malformed/corrupt messages. Other errors rethrow. `SQLiteGraphStore.recreate()` performs asynchronous removal of `graph/` and generation rotation only while no client is open.                                                          | Conformant |
| Architecture and error conventions | Port is in `domain/ports`; adapter stays in `infrastructure`; provider policy is in composition; use case receives a port. Both new errors extend `SpecdCodeGraphError` → `SpecdError`, use UPPER_SNAKE_CASE codes, actionable messages, and JSDoc.                                                                                                                                                                                                      | Conformant |

## Discrepancies

### Spec discrepancies

None found.

### Code discrepancies

None found.

### Both spec and code discrepancies

None found.

## Test Coverage

| Scenario / requirement                                                           | Test evidence                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Force is forwarded by the open-provider use case                                 | `test/application/use-cases/index-project-graph.spec.ts`: `forwards force=true to provider.index`, plus VCS and progress forwarding tests.                                                                                                                 |
| Force is logical, clears, reprocesses, and does not recreate                     | `test/composition/code-graph-provider.spec.ts`: spies on `clear` and `recreate`; `test/application/use-cases/index-project-graph-integration.spec.ts` verifies unchanged generation, full-rebuild reason, and reusable healthy SQLite storage.             |
| Provider recovery is explicit and closed-only                                    | `code-graph-provider.spec.ts` rejects open `recreate()`, permits it after `close()`, and proves recoverable open failure propagates until the closed caller recreates.                                                                                     |
| Schema incompatibility is typed and recoverable only through explicit recreation | `index-project-graph-integration.spec.ts` creates an old schema, asserts `GraphStorageRecoveryRequiredError` / `SCHEMA_INCOMPATIBLE`, recreates closed storage, reopens, and indexes.                                                                      |
| Corruption is typed but non-destructive on ordinary open                         | `sqlite-graph-store.spec.ts`: writes invalid SQLite bytes, asserts `CORRUPT`, closed state, byte-for-byte persistence and unchanged epoch; then explicitly recreates and opens an empty store.                                                             |
| Ordinary open error remains ordinary                                             | `sqlite-graph-store.spec.ts`: invalid runtime module does not become recovery-required, leaves the store closed, and preserves database and epoch.                                                                                                         |
| SQLite recreation has correct lifecycle                                          | `sqlite-graph-store.spec.ts` checks open-store rejection, closed destructive reset, graph/epoch layout, and reopened empty state; worker lifecycle tests reinforce the closed-worker precondition.                                                         |
| Curated public API boundaries                                                    | `barrel.spec.ts` verifies recovery error codes and high-level isolated worker export while asserting raw lock/IPC surfaces are absent; isolated worker `dist.spec.ts` validates built child resolution and repeated logical-force tasks release the lease. |

All changed verification scenarios have direct unit or integration evidence. No missing
test was found for the revised force/recovery contract.

## Missing Tests

None identified for the audited changed requirements.

## Spec Dependency Chain

```text
default:_global/architecture + error-handling-conventions + testing
  ├─ code-graph:graph-store
  │   ├─ code-graph:symbol-model
  │   ├─ code-graph:staleness-detection
  │   └─ code-graph:document-model
  ├─ code-graph:sqlite-graph-store
  │   ├─ code-graph:graph-store
  │   ├─ core:config
  │   └─ code-graph:workspace-integration
  ├─ code-graph:composition
  │   ├─ code-graph:graph-store
  │   └─ code-graph:index-project-graph
  └─ code-graph:index-project-graph
      ├─ code-graph:composition
      ├─ code-graph:indexer
      └─ code-graph:graph-store
```

## Summary counts

- Specs audited: 4
- Revised requirements/scenario groups assessed: 11
- Conformant: 11
- Spec discrepancies: 0
- Code discrepancies: 0
- Both spec/code discrepancies: 0
- Missing tests: 0
- Non-scoped tooling observations: 1
