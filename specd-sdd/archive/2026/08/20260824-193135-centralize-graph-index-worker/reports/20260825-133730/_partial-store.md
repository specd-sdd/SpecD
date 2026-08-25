# Compliance audit — GraphStore and SQLiteGraphStore

## Scope and evidence

- Change: `centralize-graph-index-worker` (merged change previews).
- Change specs audited: `code-graph:graph-store` and
  `code-graph:sqlite-graph-store`.
- Direct dependencies reviewed: `code-graph:symbol-model`,
  `code-graph:staleness-detection`, `code-graph:document-model`,
  `core:config`, and `code-graph:workspace-integration`.
- Applicable globals reviewed: `default:_global/architecture`,
  `default:_global/error-handling-conventions`, and
  `default:_global/testing`.
- The graph status reported `current`, but symbol search returned no source symbols
  (`fileCount: 0`, `symbolCount: 0`). Graph-first discovery was attempted first;
  direct source inspection is used for the concrete evidence below. This is an audit
  tooling observation, not a discrepancy in the audited implementation.

## Requirements Summary

### `code-graph:graph-store`

1. `open()` remains parameterless and never clears/recreates implicitly; a known
   corrupt or non-migratable schema failure is surfaced as a typed recoverable-open
   error, while unrelated failure identities remain intact.
2. `close()` is idempotent and leaves the store closed, including after partial open
   failure.
3. `recreate()` is physical recovery only: it requires a closed store, rejects an
   open store with a typed precondition error, removes/replaces persisted state,
   rotates generation, and leaves the store closed. `clear()` is the separate,
   opened-store logical reset used for force indexing and must preserve generation.

### `code-graph:sqlite-graph-store`

4. SQLite physical recreation requires a closed worker/database, removes the graph
   persistence directory and companions, rotates generation, and does not reopen a
   handle.
5. SQLite translates only corruption and non-migratable schema errors to the typed
   recoverable-open error after partial-resource cleanup; permission/configuration/
   native-runtime/unrelated I/O errors propagate unchanged.
6. Healthy forced indexing uses logical clear plus full reanalysis, never a
   close/delete/reopen lifecycle.

## Implementation Status

| Requirement | Evidence                                                                                                                                                                                                                                                                                                                                                                                                         | Status     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1–2         | `GraphStore.open()` remains `abstract open(): Promise<void>`; `SQLiteGraphDatabase.open()` closes a partially allocated DB, clears statements, and only then classifies the error. `SQLiteGraphStore.close()` delegates to the idempotent worker close.                                                                                                                                                          | Conformant |
| 3           | `GraphStore.recreate()` documents closed-only semantics. `SQLiteGraphStore.recreate()` and `SQLiteGraphDatabase.recreate()` reject an open handle with `GraphStoreRecreateRequiresClosedError`; they remove `graph/` and rotate generation without opening SQLite. The in-memory concrete test adapter follows the same contract.                                                                                | Conformant |
| 4           | `SQLiteGraphStore.recreate()` checks `client.isOpen`, invalidates bulk-session state, removes the full `graph` directory (covering SQLite companion files), rotates storage generation, and returns while the worker remains absent.                                                                                                                                                                             | Conformant |
| 5           | `getStorageRecoveryReason()` accepts only `GraphSchemaIncompatibleError`, `SQLITE_CORRUPT`, `SQLITE_NOTADB`, and the documented malformed/not-a-database/corrupt messages. Other errors are rethrown unchanged. `GraphStorageRecoveryRequiredError` and `GraphStoreRecreateRequiresClosedError` extend `SpecdCodeGraphError` → `SpecdError`, have stable UPPER_SNAKE_CASE codes, actionable messages, and JSDoc. | Conformant |
| 6           | `CodeGraphProvider.index()` calls `store.clear()` when `options.force === true`; `IndexCodeGraph` marks force as a logical full rebuild. No force path calls `recreate()`.                                                                                                                                                                                                                                       | Conformant |

The implementation also remains consistent with its dependencies: the port stays in
`domain/ports`, the SQLite adapter remains in `infrastructure`, composition owns the
provider decision, and no concrete adapter was exposed from the curated public root.

## Discrepancies

### Spec discrepancies

None found.

### Code discrepancies

None found.

### Both spec and code discrepancies

None found.

## Test Coverage

| Contract / scenario                                                 | Evidence                                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Force is logical and preserves generation                           | `index-project-graph-integration.spec.ts`: `indexes after a forced logical rebuild without recreating healthy storage`; asserts unchanged generation, empty logical graph, and full-rebuild reason.                       |
| Provider invokes clear, never recreate, for force                   | `code-graph-provider.spec.ts`: `uses logical clear rather than physical recreation for forced indexing`; spies on both methods.                                                                                           |
| Open provider cannot recreate; closed provider can                  | `code-graph-provider.spec.ts`: asserts `GraphStoreRecreateRequiresClosedError`, closes, then recreates successfully.                                                                                                      |
| Typed incompatible-storage path and explicit closed recovery        | `index-project-graph-integration.spec.ts`: constructs an incompatible SQLite schema, asserts `GraphStorageRecoveryRequiredError` plus `SCHEMA_INCOMPATIBLE`, recreates closed storage, reopens, and indexes successfully. |
| SQLite incompatible schema does not delete storage on ordinary open | `sqlite-graph-store.spec.ts`: `rejects an incompatible prior schema without recreating derived storage`; verifies the database still exists.                                                                              |
| Contract fidelity for test adapter                                  | `InMemoryGraphStore.recreate()` rejects open state and increments generation only after closed recreation, preserving common port semantics in provider tests.                                                            |

Focused command launched for this audit:

```text
pnpm --filter @specd/code-graph test -- test/infrastructure/sqlite/sqlite-graph-store.spec.ts test/application/use-cases/index-project-graph-integration.spec.ts test/composition/code-graph-provider.spec.ts
```

At report creation it was still running concurrently with other verification suites;
its eventual result must be collected by the coordinator. Prior implementation
validation recorded these focused suites as passing, and this audit does not treat the
in-flight run as a failure.

## Missing Tests

1. **Actual corrupt SQLite bytes (`SQLITE_NOTADB` or `SQLITE_CORRUPT`)** — add a
   real SQLite integration case that writes invalid database bytes, asserts
   `GraphStorageRecoveryRequiredError` with `reason: 'CORRUPT'`, verifies the store
   is closed, and proves closed recreation produces an empty reopenable store.
   Current coverage exercises the schema-incompatibility branch, not the corruption
   classifier branch.
2. **Ordinary SQLite open failure identity** — inject a permission, invalid runtime,
   or unrelated I/O failure and assert that it is not translated to
   `GraphStorageRecoveryRequiredError`, that no generation rotates, and that no graph
   data is deleted. The implementation has the correct narrow classifier, but the
   negative branch is not directly exercised in these store-focused tests.

These are coverage gaps only; no observed behaviour contradicts the merged specs.

## Spec Dependency Chain

```text
default:_global/architecture
  └─ code-graph:graph-store
       ├─ code-graph:symbol-model
       ├─ code-graph:staleness-detection
       └─ code-graph:document-model
  └─ code-graph:sqlite-graph-store
       ├─ code-graph:graph-store
       ├─ core:config
       ├─ code-graph:symbol-model
       └─ code-graph:workspace-integration

default:_global/error-handling-conventions
default:_global/testing
  └─ apply across both implementations and their integration tests
```

## Summary counts

- Requirements assessed: 6
- Conformant: 6
- Spec discrepancies: 0
- Code discrepancies: 0
- Both spec/code discrepancies: 0
- Test-coverage gaps: 2
- Non-scoped audit-tooling observations: 1
