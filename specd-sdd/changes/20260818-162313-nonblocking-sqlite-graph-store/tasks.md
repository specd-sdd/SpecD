# Tasks: nonblocking-sqlite-graph-store

## 1. Error Types & Protocol Definitions

- [x] 1.1 Add `StoreOverloadError` and `StoreWorkerError` domain errors
      `packages/code-graph/src/domain/errors/index.ts`: `StoreOverloadError`, `StoreWorkerError` — define infrastructure errors for worker failure and queue overflow
      Approach: Extend `SpecdCodeGraphError` with error codes 'STORE_OVERLOAD' and 'STORE_WORKER_ERROR', exporting them from the domain error index.
      (Req: Worker-backed non-blocking execution)

- [x] 1.2 Create worker communication protocol interfaces and DTOs
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts`: `SQLiteWorkerRequest`, `SQLiteWorkerResponse`, `SQLiteWorkerOperation`, `SerializedErrorPayload`, `SQLiteWorkerProgressEvent` — define type-safe discriminated unions for RPC over `postMessage`
      Approach: Define discriminated union types with numeric correlation `id`, operation names, serializable payload interfaces, and error serialization format.
      (Req: Worker-backed non-blocking execution)

- [x] 1.3 Create runtime descriptor interfaces
      `packages/code-graph/src/infrastructure/sqlite/sqlite-runtime-descriptor.ts`: `SqliteRuntimeDescriptor`, `SQLiteGraphStoreOptions` — define serializable SQLite runtime configuration
      Approach: Export `SqliteRuntimeDescriptor` with `modulePath?: string` and store options interface.
      (Req: Worker-backed non-blocking execution, Factory function)

## 2. Synchronous Database Extraction

- [x] 2.1 Extract synchronous SQLite database logic into `SQLiteGraphDatabase`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: `SQLiteGraphDatabase` — encapsulate `better-sqlite3` connection, prepared statement caching, schema DDL, queries, and transactions
      Approach: Move all synchronous SQL execution, `StatementCache`, FTS queries, and transactional helpers from `SQLiteGraphStore` into this dedicated synchronous class that runs inside the worker.
      (Req: SQLite schema ownership, Transactional mutation model, SQLite full-text search)

- [x] 2.2 Implement atomic bulk index commit in `SQLiteGraphDatabase`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: `SQLiteGraphDatabase.commitBulkIndex()` — execute single atomic transaction for bulk payload
      Approach: Implement `commitBulkIndex(payload, onProgress)` executing within `db.transaction(...)` and emitting stage notifications for cleanup, files, documents, symbols, specs, reference facts, observations, relations, and search indexes.
      (Req: Bulk indexing support, Transactional mutation model)

## 3. Worker Entrypoint & Dynamic Runtime Loader

- [x] 3.1 Implement worker thread entrypoint
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts`: `handleMessage()` — listen to `parentPort` messages and delegate to `SQLiteGraphDatabase`
      Approach: Listen for `parentPort.on('message')`, dynamically load `better-sqlite3` (or custom `modulePath`), execute requested operation on `SQLiteGraphDatabase`, catch errors, serialize them, and post result or error back to host.
      (Req: Worker-backed non-blocking execution)

- [x] 3.2 Implement worker packaging and path resolver
      `packages/code-graph/src/infrastructure/sqlite/resolve-worker-path.ts`: `resolveSqliteWorkerPath()` — resolve worker script path across built package and test runtimes
      Approach: Use `import.meta.url` with `.js` / `.ts` fallback to locate `sqlite-worker` deterministically in both production and development environments.
      (Req: Worker-backed non-blocking execution)

## 4. Host-side Worker Client & Queue Management

- [x] 4.1 Implement `SQLiteWorkerClient` lifecycle and correlation engine
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `SQLiteWorkerClient` — manage `Worker` thread lifecycle, request ID tracking, and Promise correlation
      Approach: Implement `open()`, `close()`, and `sendRequest()`, keeping an internal `Map<number, PendingRequest>` to resolve/reject Promises when responses arrive.
      (Req: Worker-backed non-blocking execution)

- [x] 4.2 Implement bounded backpressure queue in `SQLiteWorkerClient`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `SQLiteWorkerClient.sendRequest()` — enforce FIFO dispatch and max pending limit
      Approach: Check `pendingRequests.size >= maxPendingOperations` (default 256). If exceeded, reject immediately with `StoreOverloadError`. Otherwise queue and dispatch request in FIFO order.
      (Req: Worker-backed non-blocking execution)

- [x] 4.3 Implement deterministic worker crash handling in `SQLiteWorkerClient`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `worker.on('exit')`, `worker.on('error')` — handle unexpected worker termination
      Approach: On unexpected worker exit, transition store state to faulted, iterate over all entries in `pendingRequests` Map, reject each with `StoreWorkerError`, and clear tracking.
      (Req: Worker-backed non-blocking execution)

## 5. SQLiteGraphStore Adapter & Staging Integration

- [x] 5.1 Refactor `SQLiteGraphStore` to delegate to `SQLiteWorkerClient`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `SQLiteGraphStore` — implement `GraphStore` via asynchronous worker RPC
      Approach: Rewrite `SQLiteGraphStore` methods (`getFile`, `findSymbols`, `searchSpecs`, `upsertFile`, `removeFile`, `getStatistics`, etc.) to forward requests through `client.sendRequest(op, payload)`.
      (Req: SQLite-backed implementation, Worker-backed non-blocking execution)

- [x] 5.2 Integrate host bulk index session with worker commit
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `SQLiteGraphStore.beginBulkIndexSession()` — stage items in memory and commit via single worker call
      Approach: Accumulate staged graph entities in `InMemoryIndexSession` on the host, and serialize the complete staged batch to `client.sendRequest('commitBulkIndex', payload)` during `commit()`, forwarding worker progress events to `metadata.onProgress`.
      (Req: Bulk indexing support, Transactional mutation model)

## 6. Composition & Factory Updates

- [x] 6.1 Update `createSqliteGraphStoreFactory` to accept `SqliteGraphStoreFactoryOptions`
      `packages/code-graph/src/composition/create-sqlite-graph-store-factory.ts`: `createSqliteGraphStoreFactory()`, `SqliteGraphStoreFactoryOptions` — accept serializable runtime descriptor and max pending options
      Approach: Replace function-based loader option with `runtime?: SqliteRuntimeDescriptor` and pass to `SQLiteGraphStore`.
      (Req: Factory function)

- [x] 6.2 Export new types and error classes from public barrel
      `packages/code-graph/src/public.ts`, `packages/code-graph/src/index.ts`: export `SqliteRuntimeDescriptor`, `SqliteGraphStoreOptions`, `StoreOverloadError`, `StoreWorkerError`
      Approach: Re-export updated interfaces and error classes in public and internal barrels.
      (Req: Package exports)

## 7. Package Build Configuration

- [x] 7.1 Configure tsup entrypoint for `sqlite-worker.ts`
      `packages/code-graph/package.json`: `scripts.build` — add `src/infrastructure/sqlite/sqlite-worker.ts` to tsup build arguments
      Approach: Update build script to `"tsup src/public.ts src/index.ts src/infrastructure/sqlite/sqlite-worker.ts --format esm --dts --clean"` so `dist/sqlite-worker.js` is produced during compilation.
      (Req: Package exports, Worker-backed non-blocking execution)

## 8. Automated Tests & Verification

- [x] 8.1 Run existing unit and integration test suites
      Ensure `pnpm --filter @specd/code-graph test` passes without regression on existing SQLite store tests.

- [x] 8.2 Add worker protocol serialization unit tests
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts`: test request/response correlation, error serialization, unknown op handling, and DTO round-tripping.
      (Req: Error & progress protocol)

- [x] 8.3 Add bounded queue backpressure and crash recovery tests
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-backpressure.spec.ts`: verify `StoreOverloadError` on max pending requests, verify `StoreWorkerError` on worker exit/error, verify pending promises reject immediately.
      (Req: Worker-backed non-blocking execution)

- [x] 8.4 Add event-loop responsiveness test
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-responsiveness.spec.ts`: verify host event loop continues processing timers / tasks during large bulk transactions.
      (Req: Worker-backed non-blocking execution)

- [x] 8.5 Add built package (`dist`) execution test
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-dist.spec.ts`: verify `resolveSqliteWorkerPath()` correctly resolves and executes `dist/infrastructure/sqlite/sqlite-worker.js` after compilation.
      (Req: Package exports)

## 9. Documentation Updates

- [x] 9.1 Update Code Graph architecture and services documentation
      `docs/code-graph/index.md`, `docs/code-graph/services.md`: document non-blocking worker architecture and `SqliteRuntimeDescriptor`
      Approach: Add architectural diagrams and descriptions explaining the worker thread boundary and serializable configuration.
      (Req: Worker-backed non-blocking execution)

## 10. Concurrency, Lifecycle & Protocol Hardening

- [x] 10.1 Add dedicated `getAllIndexCoverage` RPC operation and database implementation
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: `SQLiteGraphDatabase.getAllIndexCoverage()` — query all rows from `index_coverage`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `SQLiteGraphStore.getAllIndexCoverage()` — send dedicated `getAllIndexCoverage` RPC
      Approach: Add `getAllIndexCoverage` to database and protocol map without parameters, executing `SELECT * FROM index_coverage ORDER BY file_path`.
      (Req: Worker-backed non-blocking execution)

- [x] 10.2 Implement strongly-typed `SQLiteWorkerOperationMap` in protocol
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts`: `SQLiteWorkerOperationMap` — define typed mapping for operations, payloads, and results
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `SQLiteWorkerClient.sendRequest<K>()` — enforce operation-specific typed payloads and results
      Approach: Use generic parameter `K extends keyof SQLiteWorkerOperationMap` across client and worker to guarantee type safety at compile time.
      (Req: Worker-backed non-blocking execution)

- [x] 10.3 Implement formal `WorkerState` state machine in `SQLiteWorkerClient`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `WorkerState` — define `closed | opening | open | closing | faulted`
      Approach: Replace loose booleans with explicit state tracking, ensuring state transitions happen only on verified lifecycle events.
      (Req: Worker-backed non-blocking execution)

- [x] 10.4 Implement concurrent `open()` and `close()` promise sharing
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `openPromise`, `closePromise` — deduplicate simultaneous lifecycle invocations
      Approach: Return existing in-flight promise if `open()` or `close()` is called concurrently, marking `state === open` only after worker ACK.
      (Req: Worker-backed non-blocking execution)

- [x] 10.5 Implement graceful `close()` drain of in-flight requests with timeout
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `SQLiteWorkerClient.close()` — reject new requests, drain pending, send close, and terminate
      Approach: Transition to `closing`, reject new requests with `StoreNotOpenError`, wait for pending requests to drain (bounded by safety timeout), send `close` to worker, await ACK, and terminate worker thread.
      (Req: Worker-backed non-blocking execution)

- [x] 10.6 Implement single-consumer serial FIFO execution queue in `sqlite-worker.ts`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts`: `dispatchQueue` — guarantee strict FIFO execution across async and sync operations
      Approach: Chain incoming messages onto a serial Promise chain so asynchronous operations (such as `open` and `recreate`) complete fully before the next operation begins.
      (Req: Worker-backed non-blocking execution)

- [x] 10.7 Implement strict validation for `maxPendingOperations >= 1`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `validateMaxPendingOperations()` — ensure valid positive integer
      Approach: Reject invalid values (non-integers, <= 0, NaN, Infinity) with an explicit error during `open()`.
      (Req: Worker-backed non-blocking execution)

- [x] 10.8 Implement manual recovery semantics for faulted store
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: support `close()` from `faulted` to `closed`, allowing fresh `open()`
      Approach: When in `faulted` state, allow `close()` to clean up references and transition to `closed`, enabling callers to re-open a healthy worker explicitly.
      (Req: Worker-backed non-blocking execution)

- [x] 10.9 Revert `package.json` lint script modification
      `package.json`: restore `"lint": "eslint . "`
      Approach: Remove the `--cache` flag from `package.json` to avoid unrelated change scope drift.
      (Req: Package exports)

- [x] 10.10 Add exhaustive contract, lifecycle, and concurrency tests
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-lifecycle.spec.ts`: add comprehensive tests covering `getAllIndexCoverage`, concurrent `open()`, concurrent `close()`, drain semantics, `recreate()` serialization, backpressure bounds, and fault recovery.
      (Req: Worker-backed non-blocking execution)
