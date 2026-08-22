# Compliance Partial Audit: code-graph

## Change Scope

- `code-graph:sqlite-graph-store`
- `code-graph:composition`

## Spec: code-graph:sqlite-graph-store

### Requirements Summary

1. **Worker thread isolation**: Worker thread executes SQLite operations without blocking host event loop; communication via typed messages.
2. **Worker lifecycle & cleanup**: Explicit `open()` and `close()` lifecycle, idempotent shutdown, `[Symbol.asyncDispose]` support.
3. **Error handling across worker boundary**: Errors serialized across worker boundary with preserved codes and metadata (`SpecdCodeGraphError` hierarchy).
4. **Backpressure & queue limits**: Configurable max pending operations (`StoreOverloadError`) and crash recovery (`StoreWorkerError`).
5. **Transactional mutation model**: File-level and bulk-level upserts execute in single worker-side transaction.
6. **Bulk indexing support**: Atomic bulk session commit with progress event forwarding.
7. **Schema versioning & rebuild**: Rejects incompatible reads without empty recreation; index rebuilds generation cleanly.
8. **FTS5 and structured indexes**: Exact identity boosts, literal FTS queries, ranking ladders, structured index lookups.
9. **Companion files**: SQLite files, WAL, and SHM stay confined under `{configPath}/graph`.

### Implementation Status

- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: Implemented (delegates to `SQLiteWorkerClient`).
- `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: Implemented (manages worker lifecycle, channel protocol, backpressure queue).
- `packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts`: Implemented (runs in worker thread, operates `better-sqlite3`, handles all operations transactionally).
- `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts`: Implemented (typed requests, responses, events, and error serializers).

### Test Coverage

- `test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts`: Covers protocol serialization and error deserialization.
- `test/infrastructure/sqlite/sqlite-worker-dist.spec.ts`: Covers worker instantiation against compiled dist and basic lifecycle.
- `test/infrastructure/sqlite/sqlite-worker-responsiveness.spec.ts`: Covers host event loop responsiveness during bulk writes.
- `test/infrastructure/sqlite/sqlite-worker-backpressure.spec.ts`: Covers `StoreOverloadError` on queue saturation and `StoreWorkerError` on worker exit.
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

## Summary Counts

- Total Specs Audited: 2
- Total Requirements Checked: 15
- Total Scenarios Verified: 38
- Discrepancies Found: 0
- Missing Tests: 0
- Status: 100% Compliant
