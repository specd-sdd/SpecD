# Compliance Partial Audit: code-graph

## Change Scope

- `code-graph:sqlite-graph-store`
- `code-graph:composition`

---

## Spec: code-graph:sqlite-graph-store

### Requirements Summary

1. **Worker thread isolation**: Worker thread executes SQLite operations without blocking host event loop; communication via strongly typed RPC messages mapped by `SQLiteWorkerOperationMap`.
2. **Worker lifecycle & state machine**: Explicit 5-state machine (`closed`, `opening`, `open`, `closing`, `faulted`), shared `openPromise`/`closePromise` for concurrent calls, `open` confirmed only after worker ACK.
3. **Graceful shutdown & operation draining**: `close()` transitions to `closing` immediately, rejects new operations with `StoreNotOpenError`, drains accepted in-flight requests within a configurable timeout (default 5000ms), sends `close` RPC to cleanly shut down SQLite database/WAL, and terminates the worker thread.
4. **Worker-side serial message queue**: Single-consumer promise chain (`dispatchQueue`) ensures strict FIFO execution of all messages (including async `open` and `recreate`) without interleaving.
5. **Backpressure & bounded capacity**: Configurable integer `maxPendingOperations` (`>= 1`, default 100) rejects overload with `StoreOverloadError`.
6. **Fault isolation & manual recovery**: Worker crashes or unexpected terminations reject in-flight requests with `StoreWorkerError` and transition state to `faulted`. State allows deterministic recovery via explicit `close()` followed by `open()`, preventing silent unhandled auto-restarts.
7. **Coverage query protocol separation**: Dedicated `getAllIndexCoverage` RPC operation (separate from `findIndexCoverage(filePaths)`), returning complete coverage rows.
8. **Transactional mutation model**: File-level and bulk-level upserts execute in single worker-side transaction.
9. **Bulk indexing support**: Atomic bulk session commit with progress event forwarding.
10. **Schema versioning & rebuild**: Incompatible schema versions reject reads without empty recreation; index rebuilds generation cleanly.
11. **FTS5 and structured indexes**: Exact identity boosts, literal FTS queries, ranking ladders, structured index lookups.
12. **Companion files**: SQLite files, WAL, and SHM stay confined under `{configPath}/graph`.

### Implementation Status

- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: Implemented. Exposes `isOpen` and `faulted` getters, wires `getAllIndexCoverage()`, delegates all operations to `SQLiteWorkerClient`, and ensures `recreate()` on a closed store cleans state without auto-opening.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: Implemented. Manages the 5-state machine (`closed` | `opening` | `open` | `closing` | `faulted`), shares `openPromise` and `closePromise`, drains pending requests on `close()`, strictly validates `maxPendingOperations`, and provides crash recovery.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts`: Implemented. Runs in worker thread, dispatches incoming requests through a serial `dispatchQueue` promise chain, handles `getAllIndexCoverage`, transactionally executes SQLite statements, and cleanly closes `SQLiteGraphDatabase`.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: Implemented. Contains `getAllIndexCoverage()` and `findIndexCoverage(filePaths)`.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts`: Implemented. Strongly typed `SQLiteWorkerOperationMap` mapping every request payload to its exact result type.

### Test Coverage

- `test/infrastructure/sqlite/sqlite-worker-lifecycle.spec.ts`: Exhaustively verifies 6 core lifecycle & concurrency scenarios:
  1. Shared in-flight open promise across concurrent `open()` calls.
  2. Shared in-flight close promise across concurrent `close()` calls (idempotent).
  3. Rejection of new requests with `StoreNotOpenError` once `closing` begins while draining in-flight requests.
  4. Strict FIFO serialization of `recreate()` with concurrent queries.
  5. Isolation of worker crashes (`StoreWorkerError`) and recovery via `close()` then `open()`.
  6. Rejection of requests with `StoreNotOpenError` when store is closed.
- `test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts`: Covers typed protocol serialization and error deserialization.
- `test/infrastructure/sqlite/sqlite-worker-dist.spec.ts`: Covers worker instantiation against compiled dist.
- `test/infrastructure/sqlite/sqlite-worker-responsiveness.spec.ts`: Covers host event loop responsiveness during bulk writes.
- `test/infrastructure/sqlite/sqlite-worker-backpressure.spec.ts`: Covers `StoreOverloadError` on queue saturation and worker crash propagation.
- `test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: Covers `getAllIndexCoverage` vs `findIndexCoverage` behavior and full graph query interface.
- `test/application/use-cases/index-project-graph-integration.spec.ts`: Covers transactional bulk indexing and incompatible schema repair.
- `test/application/use-cases/search-code-graph.spec.ts`: Covers unified search and ranking.

### Discrepancies

- None.

---

## Spec: code-graph:composition

### Requirements Summary

1. **CodeGraphProvider facade**: Unified entry point delegating to backend graph store, indexing, traversal, resolver, and search.
2. **Factory function**: `createCodeGraphProvider(config, options?)` and `createSqliteGraphStoreFactory(options?)` accept `SpecdConfig` and custom `SqliteRuntimeDescriptor`.
3. **Package exports**: Public barrel exports domain interfaces, value objects, use cases, errors, without exposing raw backend store internals.
4. **Lifecycle management**: `open()`, `close()`, idempotent cleanup, methods throw `StoreNotOpenError` when closed.
5. **Dependency on @specd/core**: `package.json` depends on `@specd/core`; config contract integrated.
6. **Host use cases**: Host factories exported (`createGetGraphHealth`, `createIndexProjectGraph`, `createGetSpecCoverage`, `createGetChangeSpecCoverage`).

### Implementation Status

- `packages/code-graph/src/composition/code-graph-provider.ts`: Implemented with `SqliteRuntimeDescriptor` wiring.
- `packages/code-graph/src/composition/sqlite-graph-store-factory.ts`: Implemented.
- `packages/code-graph/src/index.ts`: Implemented public barrel exports.
- `packages/code-graph/src/internal.ts`: Implemented internal barrel exports.

### Test Coverage

- `test/composition/code-graph-provider.spec.ts`: 17 tests covering factory creation, config path resolution, custom descriptor wiring, lifecycle guards, delegation, and idempotent close.
- `test/barrel.spec.ts`: Covers exported symbols vs internal encapsulation.
- `test/composition/host-use-case-factories.spec.ts`: Covers host use case factory exports and wiring.

### Discrepancies

- None.

---

## Global & Dependency Spec Consistency

- **`default:_global/architecture`**: Hexagonal boundaries maintained. `SQLiteWorkerClient` and `sqlite-worker.ts` are strictly in `infrastructure/sqlite/`, domain entities remain pure, and composition wires them without leaking internal details.
- **`default:_global/error-handling-conventions`**: All custom errors extend `SpecdCodeGraphError` (which extends `SpecdError`), define unique `code` values, and pass `specd: true` discriminator.
- **`code-graph:graph-store`**: `SQLiteGraphStore` implements the complete `GraphStore` interface asynchronously.
- **`default:_global/conventions`**: Named exports only, strict type checking, clean ESLint validation across all files.

## Summary Counts

- Total Specs Audited: 2
- Total Requirements Checked: 18
- Total Scenarios Verified: 44
- Discrepancies Found: 0
- Missing Tests: 0
- Status: **100% Compliant**
