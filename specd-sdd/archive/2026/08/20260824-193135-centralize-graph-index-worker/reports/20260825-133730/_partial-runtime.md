# Compliance Audit — Runtime and Code-Graph Composition

**Change:** `centralize-graph-index-worker`  
**Scope:** `code-graph:isolated-index-worker`, `code-graph:composition`, and
`code-graph:index-project-graph`; direct dependencies `code-graph:graph-store`,
`code-graph:indexer`, and `default:_global/architecture` / `testing`.  
**Method:** merged change previews, graph-first symbol discovery, source/test inspection,
and focused Vitest execution.

## Requirements Summary

| Spec                               | Requirement outcome                                                                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code-graph:isolated-index-worker` | Public `runIsolatedGraphIndex` must fork a package-relative ESM child, own the storage-root lease, validate JSON IPC, preserve typed failures, forward signals, and clean every terminal path.                                            |
| `code-graph:composition`           | The provider must keep lifecycle explicit; `force` must logically clear/reprocess rather than recreate; closed-only physical recreation and typed recoverable open errors are public contracts; worker/lock/IPC internals remain private. |
| `code-graph:index-project-graph`   | The stateless use case forwards prepared inputs and `force` to an already-open provider and owns no lifecycle, lock, clear, or recreate action.                                                                                           |

## Implementation Status

### `code-graph:isolated-index-worker` — compliant

- `src/composition/run-isolated-graph-index.ts` exposes the high-level public operation
  and resolves the emitted child relative to `import.meta.url`.
- `src/infrastructure/isolated-index-worker/supervisor.ts` uses `node:child_process.fork`,
  acquires/releases the internal lease, validates the startup payload, scopes signal
  handlers, converts all examined terminal paths to typed errors, and centralizes
  idempotent cleanup before settling.
- The startup `send` callback explicitly settles a `GraphIndexWorkerStartError` even if
  the child never emits `exit`; this matches the regression scenario for the previous
  hanging-force-worker failure.
- `isolated-index-worker-child.ts` imports only the supplied trusted file URL, validates
  progress/results at the boundary, disconnects after its one terminal envelope, and
  uses `exitCode` rather than `process.exit()`.
- `public.ts` exports the host contracts and typed errors, while the worker entrypoint,
  protocol, runtime seam, and lock helpers remain absent from the public entrypoint.

### `code-graph:composition` — compliant

- `CodeGraphProviderImpl.index()` asserts an open provider, obtains its internal lock,
  invokes `store.clear()` for `force: true`, and then runs the indexer; it does not call
  `recreate()`.
- `recreate()` rejects when open with `GraphStoreRecreateRequiresClosedError`; ordinary
  `open()` propagates the typed recoverable storage-open error without implicit deletion.
- The curated barrel publishes `runIsolatedGraphIndex`, recovery error contracts, and
  the provider facade, but not the concrete worker/store/lock implementation.

### `code-graph:index-project-graph` — partially spec-inconsistent, code compliant

- `IndexProjectGraph.execute()` is stateless and forwards project root, workspaces,
  graph configuration, version, VCS fields, progress, and `force` once to
  `provider.index()`.
- It neither opens/closes/clears/recreates nor performs locking/spawning, conforming to
  the new forced-logical-reindex contract and the architecture boundary.

## Discrepancies

### Spec discrepancy — medium severity

`code-graph:index-project-graph` still retains the legacy **Requirement:
Incompatibility repair execution** and its verification scenario. They say that
`IndexProjectGraph` supports provider-owned repair and that indexing detects schema
incompatibility, recreates storage, rebuilds search, and reports the repair reason.

That conflicts with the same merged spec's revised requirements: the use case receives
an _already-open_ provider and **MUST NOT** implement physical recovery; typed open
recovery belongs to the SDK lifecycle owner before `IndexProjectGraph` is invoked. The
implementation correctly follows the revised contract, so this is **spec drift, not a
code defect**. Remove or rewrite the legacy requirement and scenario to describe the
SDK-owned recovery boundary (or move it to `sdk:run-index-project-graph`).

### Code discrepancies

None found in this assigned scope.

### Both spec and code discrepancies

None found.

## Test Coverage

| Area                             | Evidence                                                                                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IPC JSON and envelope validation | `protocol.spec.ts` checks strict JSON values, cycles/functions/symbols, exact start/child envelopes, and bounded serialized errors.                                                                                  |
| Worker terminal/cleanup behavior | `supervisor.spec.ts` checks progress order, duplicate terminal rejection, exit-without-terminal, and failed initial send with a non-exiting child.                                                                   |
| Signal isolation                 | `signals.spec.ts` covers SIGINT/SIGTERM forwarding once and preservation of existing host listeners.                                                                                                                 |
| Built package behavior           | `dist.spec.ts` verifies emitted worker presence/private exports, real child PID, invalid module/result/task failures, abnormal post-result exit, and two forced logical reindex child tasks followed by lease reuse. |
| Provider force/recovery          | `code-graph-provider.spec.ts` verifies logical `clear()` rather than `recreate()`, closed-only recreation, public error behavior, and lock handoff.                                                                  |
| Project use case                 | `index-project-graph.spec.ts` verifies one forward to `provider.index`, force forwarding, VCS forwarding, and progress forwarding.                                                                                   |

Focused execution passed: `pnpm --filter @specd/code-graph exec vitest run test/application/use-cases/index-project-graph.spec.ts test/infrastructure/isolated-index-worker/supervisor.spec.ts test/infrastructure/isolated-index-worker/signals.spec.ts --reporter=dot` — **3 files, 11 tests passed**.

## Missing Tests

No missing implementation test was identified for the corrected runtime behavior.

After correcting the stale legacy repair requirement, remove/replace its obsolete
`IndexProjectGraph` repair scenario. A replacement belongs to the SDK recovery test
suite and must assert that typed open failure is recovered only by forced SDK
orchestration before this use case receives an open provider; it must not make
`IndexProjectGraph` recreate storage.

## Spec Dependency Chain

`default:_global/architecture` → `code-graph:composition` →
`code-graph:index-project-graph` → host orchestration.

`code-graph:graph-store` and `code-graph:indexer` provide the persistence/indexing
contracts consumed by composition; `code-graph:isolated-index-worker` is an additional
composition dependency and remains one-way (`code-graph` does not depend on SDK or CLI).
The inspected code preserves this direction: native/process I/O is confined to
infrastructure/composition, while `IndexProjectGraph` depends only on its host port.

## Summary Counts

- Specs reviewed: **3**
- Requirements/scenario groups reviewed: **all assigned groups**
- Code discrepancies: **0**
- Spec discrepancies: **1** (legacy `IndexProjectGraph` repair requirement/scenario)
- Both spec and code discrepancies: **0**
- Missing implementation tests: **0**
- Required specification-test alignment changes: **1**
