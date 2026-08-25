# Compliance partial — Code Graph store contracts

Audit mode: change (`centralize-graph-index-worker`)

Scope owned: `code-graph:index-project-graph`, `code-graph:graph-store`, and `code-graph:sqlite-graph-store`; direct contract consistency with `code-graph:composition` and global architecture/testing conventions was considered.

## Requirements summary

| Spec                             | Change-relevant requirement                         | Expected contract                                                                                                                                                                                                                                                    |
| -------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code-graph:index-project-graph` | Forced logical reindex; prepared provider lifecycle | The already-open provider receives `force`; the use case does not open/close/clear/recreate or own recovery.                                                                                                                                                         |
| `code-graph:graph-store`         | Lifecycle and recreation                            | `open()` is parameterless/non-destructive; recoverable corruption/incompatible-schema failures are typed and leave the store closed; `recreate()` requires a closed store and rotates generation; `clear()` is the healthy opened-store logical reset used by force. |
| `code-graph:sqlite-graph-store`  | SQLite realization                                  | Physical recreation is closed-only and leaves no worker open; known corrupt/incompatible open failures are typed; ordinary failures propagate; healthy force clears rather than delete/reopen.                                                                       |

## Implementation status

### `code-graph:index-project-graph`

Conformant for the new force/lifecycle contract.

- `packages/code-graph/src/application/use-cases/index-project-graph.ts` only builds `IndexOptions` and delegates once to `input.provider.index()`.
- It forwards `force: true`, VCS root/ref, and progress; it neither imports nor calls lifecycle, lock, workspace-resolution, or process APIs.
- `CodeGraphProvider.index()` in `packages/code-graph/src/composition/code-graph-provider.ts` owns the opened-store force behavior: it calls `store.clear()` under its index lock before the indexer executes.

### `code-graph:graph-store`

Conformant for the new lifecycle separation.

- The abstract port documents parameterless `open`, `clear`, closed-only `recreate`, and observable storage generation.
- `CodeGraphProvider.recreate()` rejects while provider-open with `GraphStoreRecreateRequiresClosedError`; `clear()` requires an open provider and preserves the generation.
- `SQLiteGraphStore.recreate()` invalidates sessions, rejects if the worker client is open, removes only the graph persistence directory, rotates the generation, and does not reopen the worker.

### `code-graph:sqlite-graph-store`

Conformant for typed SQLite-open handling and worker error transport.

- `SQLiteGraphDatabase.open()` closes any partially opened native handle, clears prepared statements, translates recognized recovery conditions into `GraphStorageRecoveryRequiredError`, and preserves unrelated errors.
- `serializeError()` now includes `recoveryReason`; `deserializeWorkerError()` consequently restores `CORRUPT` rather than defaulting it to schema incompatibility.
- `SQLiteGraphStore.clear()` dispatches the logical reset to the live worker. It does not delete/reopen storage.

## Discrepancies

### Finding S-1 — inherited SQLite verification scenario contradicts the narrowed recovery authority

Severity: **medium (artifact/spec drift)**

Evidence:

- The merged `code-graph:sqlite-graph-store` verification artifact still has the inherited **Reference schema upgrade / SQLite old schema rebuilds safely** scenario: after a normal read failure, “graph index” rotates generation and rebuilds the database.
- The change delta and implementation intentionally narrow physical recreation: ordinary reads propagate open failure, and recovery is authorized by the SDK only for forced indexing (`force: true`) after close; `IndexProjectGraph` itself expressly has no recovery responsibility.

Both possibilities:

1. **Spec drift likely:** update/remove the inherited scenario so it says an SDK-owned _forced_ reindex handles a typed recovery error, closes, recreates, and retries once. This matches the current design and implementation.
2. **Implementation change possible:** if every ordinary `graph index` after a typed schema failure is meant to rotate storage, SDK/provider recovery would need to be broadened beyond `force`; that contradicts the recently added force-only safety contract and is not recommended without an explicit product decision.

No code defect is asserted for S-1; the evidence favors the first interpretation.

### Observation S-2 — inherited generic “ready for fresh indexing” wording is ambiguous after recreate

Severity: **low (wording ambiguity)**

The inherited `code-graph:graph-store` verification scenario says a recreated backend is “ready for a fresh indexing run,” while the modified requirement requires it to remain closed until explicit `open()`. The concrete new scenario clarifies the intended order, and implementation is correct; nevertheless, changing the old wording to “ready to be explicitly opened for a fresh indexing run” would eliminate ambiguity.

## Test coverage

| Contract                                                                                       | Evidence                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Force is logical clear, never physical recreate                                                | `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts`; `packages/code-graph/test/composition/code-graph-provider.spec.ts` (“uses logical clear rather than physical recreation for forced indexing”). |
| Closed-only provider/store recreation                                                          | `code-graph-provider.spec.ts`; `sqlite-graph-store.spec.ts`; `sqlite-worker-lifecycle.spec.ts`.                                                                                                                              |
| Closed recreation clears data, companion lifecycle, no residual worker handle                  | `sqlite-worker-lifecycle.spec.ts` (“executes recreate() asynchronously on closed store without lingering WAL/SHM files”).                                                                                                    |
| Corrupt data becomes typed, leaves physical bytes/generation untouched until explicit recreate | `sqlite-graph-store.spec.ts` (“classifies invalid SQLite bytes as recoverable corruption without mutating the closed store”).                                                                                                |
| Ordinary runtime/module open failure propagates without deletion or epoch rotation             | `sqlite-graph-store.spec.ts` (“propagates ordinary runtime open failures without recreating or rotating storage”).                                                                                                           |
| Recovery reason survives worker IPC                                                            | `sqlite-worker-protocol.spec.ts` checks `CORRUPT` round-trip.                                                                                                                                                                |

Focused command was launched for the above suites:

`pnpm --filter @specd/code-graph test -- index-project-graph.spec.ts code-graph-provider.spec.ts sqlite-graph-store.spec.ts sqlite-worker-lifecycle.spec.ts sqlite-worker-protocol.spec.ts`

The available command capture showed Vitest startup but did not return a final aggregate in this isolated audit invocation. Earlier lifecycle hooks reported passing repository tests; the audit therefore does not claim an independent final count from this command.

## Missing tests

1. Add an end-to-end storage-path test that starts with an incompatible SQLite database and proves only SDK force recovery (not direct `IndexProjectGraph`, and not a non-forced caller) executes close → recreate → one retry. This belongs principally to `sdk:run-index-project-graph`, but it is the integration test that closes S-1’s semantic gap.
2. Add or rename the generic GraphStore recreation test to explicitly assert that an immediate indexing attempt before `open()` rejects with `StoreNotOpenError`; current SQLite tests establish the intended state indirectly.

## Dependency consistency

- `code-graph:index-project-graph` is consistent with `code-graph:composition`: the provider owns locking and logical clear; the use case is a stateless application orchestrator.
- The new GraphStore/SQLite separation is consistent with global architecture: destructive filesystem work stays in the infrastructure adapter and the use case depends on the host port.
- S-1 is inconsistent with the direct SDK recovery dependency (`sdk:run-index-project-graph` / `sdk:with-open-graph-provider`): the latter specifies typed-error recovery only on force, whereas the inherited SQLite scenario suggests a broader index-triggered recreation.

## Summary counts

- Requirements audited: 3 change-scoped specs; all change-added/modified storage and `IndexProjectGraph` requirements inspected.
- Confirmed implementation conformances: 8.
- Discrepancies: 1 medium artifact/spec-drift finding; 1 low wording ambiguity.
- Confirmed test areas: 5.
- Missing/strengthening tests: 2.
- Implementation defects found: 0.
