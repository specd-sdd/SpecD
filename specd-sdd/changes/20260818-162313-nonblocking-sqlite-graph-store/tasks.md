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

## 11. Lifecycle Hardening (post-review fixes)

- [x] 11.1 Make `drainPendingRequests()` return `Promise<boolean>`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `drainPendingRequests(timeoutMs)` — return `true` if fully drained, `false` on timeout
      Approach: Resolve the inner race promise with a boolean before the timeout fires; the `Promise.race` winner determines whether all pending requests settled in time.
      (Req: Worker-backed non-blocking execution)

- [x] 11.2 Harden `close()` drain-timeout path to force-terminate worker
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `SQLiteWorkerClient.close()` — skip `close` RPC and force-terminate on drain timeout
      Approach: If `drained === false`, immediately reject all remaining pending requests with `StoreWorkerError`, skip `sendRequestInternal('close', ...)`, and call `worker.terminate()` unconditionally. This makes `drainTimeoutMs` a hard upper bound.
      (Req: Worker-backed non-blocking execution)

- [x] 11.3 Fix `open()`/`close()` concurrent-call race
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `SQLiteWorkerClient.open()` — guard state transition with narrowed check
      Approach: Replace unconditional `this.state = 'open'` with `if (this.state === 'opening') this.state = 'open'` so that a concurrent `close()` call (which sets state to `'closing'`) is not overwritten by the delayed `open()` resolution.
      (Req: Worker-backed non-blocking execution)

- [x] 11.4 Preserve `faulted` state on worker crash during `opening`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `SQLiteWorkerClient.open()` error catch — preserve `faulted` state set by crash handler
      Approach: In the `catch` block, only reset `this.state = 'closed'` if `!this.faulted`, so that an unexpected worker exit during startup leaves the store in the deterministic `faulted` state rather than silently transitioning to `closed`.
      (Req: Worker-backed non-blocking execution)

- [x] 11.5 Add lifecycle hardening tests
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-lifecycle.spec.ts`: 3 new tests - `handles close() called while open() is still in-flight without exposing open state` - `forces worker termination and rejects stuck requests when drain timeout expires` - `leaves deterministic faulted state if worker crashes unexpectedly during opening`
      (Req: Worker-backed non-blocking execution)

## 12. Lifecycle Hardening Round 2 (post-review fixes)

- [x] 12.1 Fix `closePromise` leak when `open()` fails during concurrent `close()`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `SQLiteWorkerClient.close()` — wrap entire IIFE body in outer `try/finally`
      Approach: Move `this.closePromise = undefined` into an outer `finally` that wraps the complete closure including `await this.openPromise`. Previously, `return` inside the inner catch (when `openPromise` rejected) escaped before cleanup, leaving `closePromise` permanently set. A subsequent `close()` would find the stale promise and silently skip recovery or any state reset.
      (Req: Worker-backed non-blocking execution)

- [x] 12.2 Apply shared deadline to drain + close RPC (true hard bound on `close()` total time)
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `SQLiteWorkerClient.close()` — compute `deadline = Date.now() + drainTimeoutMs` once at entry
      Approach: Drain pending requests with `drainPendingRequests(deadline - Date.now())`, then if drained, race `sendRequestInternal('close', {}, true)` against `timeout(deadline - Date.now())`. This makes `drainTimeoutMs` a genuine hard upper bound on total `close()` wall-clock time including the close RPC ACK, not just the drain phase.
      (Req: Worker-backed non-blocking execution)

- [x] 12.3 Reject pending in-flight requests before `worker.terminate()` in finally block
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `SQLiteWorkerClient.close()` finally — reorder steps
      Approach: Reject remaining pending requests with `StoreWorkerError` BEFORE calling `worker.terminate()`. This ensures callers observe the drain-timeout error message rather than the subsequent exit-event error ("Worker exited unexpectedly during shutdown") triggered by `terminate()`.
      (Req: Worker-backed non-blocking execution)

- [x] 12.4 Fix `handleWorkerExit` to reject pending requests when in `'closing'` state
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `SQLiteWorkerClient.handleWorkerExit()` — handle 'closing' state
      Approach: Previously `handleWorkerExit` bailed out for both `'closing'` and `'closed'`. If the worker crashed during `'closing'` (e.g. while `close()` awaited `openPromise`), any in-flight pending requests (the unacknowledged `open` RPC) were never rejected, causing `openPromise` to hang forever. Fix: only skip for `'closed'`; for `'closing'` with pending requests, reject them and return (do not call `faultWorker` since `close()` owns the state transition).
      (Req: Worker-backed non-blocking execution)

- [x] 12.5 Guard `open()` catch against resetting state during `close()` ownership
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: `SQLiteWorkerClient.open()` error catch — check `state !== 'closing'` before state reset
      Approach: In the `open()` catch block, only reset `this.state = 'closed'` and terminate the worker if `this.state !== 'closing'`. When `close()` is coordinating the lifecycle, `open()` must not overwrite `'closing'` or attempt to terminate the worker (close's `finally` handles both).
      (Req: Worker-backed non-blocking execution)

- [x] 12.6 Add 2 new lifecycle tests for round-2 fixes
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-lifecycle.spec.ts`: 2 new tests - `clears closePromise when concurrent close() waits on a failing open()`: verifies closePromise is cleared and a full recovery cycle (close → open → close) works after a concurrent open+close where open crashes - `bounds close() total time when worker ignores the close RPC`: verifies close() with a mock worker that responds to 'open' but never acknowledges 'close' resolves within the deadline
      (Req: Worker-backed non-blocking execution)

## 13. Deep Architecture & Robustness Hardening (15 Points Review)

- [x] 13.1 `withDeadline` helper with unref'd timer cleanup
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: Implement `withDeadline<T>` helper to handle timeout race, `clearTimeout` in `finally`, and `timer.unref?.()`.

- [x] 13.2 Unified `close()` deadline
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: Calculate `deadline = now + drainTimeoutMs` at entry of `close()` and apply `withDeadline` across `openPromise`, `drainPendingRequests`, and the `close` RPC.

- [x] 13.3 Non-blocking closed store `recreate()`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts` & `storage-generation.ts`: Replace synchronous `rmSync` and `rotateStorageGeneration` in closed `recreate()` with `rm` from `node:fs/promises` and `rotateStorageGenerationAsync`.

- [x] 13.4 Chunked worker-side bulk index staging protocol
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts` & `sqlite-worker.ts`: Add `beginBulkIndexSession`, `stageBulkFiles`, `stageBulkSymbols`, etc., and `WorkerBulkSession` map in worker thread. Execute commit within a single worker `db.transaction()`.

- [x] 13.5 Isolation of `onProgress` callback exceptions
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: Wrap `pending.onProgress?.(...)` invocation in a silent `try/catch` block.

- [x] 13.6 Private `workerPath` option
      `packages/code-graph/src/infrastructure/sqlite/sqlite-runtime-descriptor.ts`: Remove `workerPath` from public `SQLiteGraphStoreOptions` and `SqliteGraphStoreFactoryOptions`; define internal options interface.

- [x] 13.7 Error serialization payload details & `SpecNotFoundError` codec
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts` & `sqlite-worker-client.ts`: Add `details` field to `SerializedErrorPayload` and update `serializeWorkerError`/`deserializeWorkerError` to preserve `SpecNotFoundError.specId`.

- [x] 13.8 Bulk session lifecycle generation & token validation
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts` & `sqlite-graph-store.ts`: Add `lifecycleGeneration` to worker client and `activeBulkSessionId` to store; invalidate `IndexWriteSession` on close, worker crash, or recreation.

- [x] 13.9 Hardened responsiveness test
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-responsiveness.spec.ts`: Measure `maxLag` with `performance.now()` and `setInterval` to verify event-loop lag remains bounded under heavy load.

- [x] 13.10 Suite of 5 new lifecycle & session tests
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-lifecycle.spec.ts`: Add test cases for `onProgress` exception isolation, `SpecNotFoundError` roundtrip, closed `recreate()` async cleanup, and chunked session invalidation.

## 14. Compliance Reconciliation (audit D1–D5)

- [x] 14.1 Export concrete store adapter symbols from internal entry
      `packages/code-graph/src/index.ts`: export `SQLiteGraphStore`, `LadybugGraphStore`, `AdapterRegistry`, and the built-in language adapters from the `./internal` barrel only
      Approach: Add imports/re-exports for the concrete adapter infrastructure modules in `src/index.ts`; do NOT add them to `src/public.ts` (`"."`).
      (Req: Public and internal entry points)

- [x] 14.2 Remove `ResolveSymbolReference` concrete class from public surface
      `packages/code-graph/src/public.ts`: drop the concrete `ResolveSymbolReference` re-export from `"."`
      Approach: Remove `ResolveSymbolReference` from `public.ts`; keep resolver input/result/status/reason/provenance types and factories exported from `"."` and verify no host-side consumer imports the concrete class.
      (Req: Symbol-reference provider surface)

- [x] 14.3 Align worker-side error serialization with host codec (specId preservation)
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts` / `sqlite-worker-protocol.ts`: make worker-side `serializeError` include `details` (e.g. `specId` for `SpecNotFoundError`) matching the host-side codec
      Approach: Reuse the shared `serializeWorkerError` so host and worker serialize identically; extend the roundtrip test to assert `SpecNotFoundError.specId` survives worker→host transport.
      (Req: Symbol-reference provider surface)

- [x] 14.4 Correct test-count metadata in change artifacts
      `specd-sdd/changes/20260818-162313-nonblocking-sqlite-graph-store/verify` artifacts/reports: update the claimed `sqlite-graph-store.spec.ts` test count to the actual figure (~67 explicit `it(` + generated shared contract cases; vitest reports 113 passing)
      Approach: Reconcile the reported count in the change's verify notes so the audit D3 finding is resolved; no code change required.

- [x] 14.5 Add export-scope verification tests for internal-only symbols
      `packages/code-graph/test/`: add tests asserting concrete adapters (`SQLiteGraphStore`, `LadybugGraphStore`, `AdapterRegistry`, built-in language adapters) are importable from `@specd/code-graph/internal` and NOT from `@specd/code-graph` (`"."`), and that `ResolveSymbolReference` is not importable from `"."`
      Approach: Import/module-scope assertions mirroring the reconciled composition verify scenarios.
      (Req: Public and internal entry points, Symbol-reference provider surface)

- [x] 14.6 Re-run full compliance audit and replace the partial report
      Re-run the compliance audit (full mode) after the fixes; supersede `reports/20260819-193743/_partial-code-graph.md` with the final full report and confirm 0 non-compliant findings.
      Approach: Re-verify against the reconciled specs and update the report path in the change metadata.

## 15. Bulk Session Hardening (review of chunked staging — P1/P2 findings)

- [x] 15.1 Merge (not replace) reference-facts chunks worker-side
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts`: `stageBulkReferenceFacts` accumulates via `mergeReferenceFactChunks()` (logicalSymbols, declarations, publicBindings, localBindings, steps, coverage)
      Approach: `session.facts = session.facts === undefined ? p.facts : mergeReferenceFactChunks(session.facts, p.facts)`; add lifecycle test committing two `writeReferenceFacts()` chunks and asserting both are persisted.

- [x] 15.2 Only `beginBulkIndexSession` may create a worker session
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts`: replace `getOrCreateBulkSession` with `createBulkSession` (throws if exists) and `requireBulkSession` (throws if missing)
      Approach: `beginBulkIndexSession` calls `createBulkSession`; all `stage*`, `commitBulkIndex`, and `rollbackBulkIndexSession` call `requireBulkSession`. A finalized session can never be resurrected by staging.

- [x] 15.3 Host bulk session state machine (active/committing/rolling-back/finished)
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `beginBulkIndexSession` tracks `BulkSessionState`; `commit()` sets `committing` and `rollback()` sets `rolling-back` before their RPCs
      Approach: writes/removals/second commit/rollback accept only `state === 'active'`; commit/rollback finish with success or error (worker deletes session in finally). Add lifecycle tests for commit+write, commit+commit, commit+rollback, rollback+write, rollback+commit.

- [x] 15.4 Await the begin RPC (`ensureReady`) instead of fire-and-forget
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: store the `beginBulkIndexSession` RPC promise as `readyPromise` and await it at the start of every async session method
      Approach: On `readyPromise` rejection, mark the session finished, release `activeBulkSessionId`, and propagate the original error (no `.catch(() => {})`). Add test asserting a full session works under `maxPendingOperations: 1`.

- [x] 15.5 Serializable RPC metadata (no functions in payload types)
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts`: define `SerializableIndexWriteSessionMetadata = Omit<IndexWriteSessionMetadata, 'onProgress'>` and use it in `commitBulkIndex`
      Approach: worker casts to the concrete serializable type instead of `Record<string, unknown>`.

- [x] 15.6 `bulkLoad()` uses the chunked session flow; remove legacy direct payload
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `bulkLoad()` stages files/documents/symbols/specs/relations/observations in `BULK_RPC_CHUNK_SIZE` (1000) chunks via `IndexWriteSession` and commits atomically
      Approach: drop the `| BulkIndexPayload` legacy variant from `commitBulkIndex` so a complete-graph structured clone is impossible.

- [x] 15.7 Hardened responsiveness test with heartbeat ticks and many staging RPCs
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-responsiveness.spec.ts`: 10 000 files/symbols staged in 250-element chunks; assert `ticks > 0` and `maxLag < 200`
      Approach: keep a generous CI threshold; the goal is detecting large stalls, not microbenchmarking.

- [x] 15.8 `drainPendingRequests(0)` resolves false immediately
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: short-circuit `if (this.pendingRequests.size === 0) return true; if (timeoutMs <= 0) return false` before scheduling the interval
      Approach: prevents a 10 ms interval tick when the close deadline has already expired.

- [x] 15.9 Spec/design/verify wording: graceful-shutdown deadline + forced termination (no hard bound)
      `deltas/code-graph/sqlite-graph-store/{spec,verify}.md.delta.yaml`, `design.md`: `drainTimeoutMs` is a graceful-shutdown deadline; after expiry forced `worker.terminate()` is initiated and awaited — no hard wall-clock promise including native-code termination
      Approach: wording-only reconciliation; the implementation already awaits termination.

- [x] 15.10 Add bulk-session scenarios to the verify delta
      `deltas/code-graph/sqlite-graph-store/verify.md.delta.yaml`: scenarios for staging-state rejection, no session resurrection, reference-facts merge, `maxPendingOperations = 1`, and chunked `bulkLoad()`
      Approach: map each P1/P2 fix to an observable verify scenario.

## 16. Bulk Session Hardening round 2 (clear() ↔ session desync — P1)

- [x] 16.1 `clear()` invalidates the host bulk session token before its RPC
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `clear()` calls `invalidateBulkSession()` before `client.sendRequest('clear', {})`
      Approach: the worker clears `bulkSessions` before executing `database.clear()`, so the host must clear `activeBulkSessionId` before the RPC — even a failing SQLite clear leaves the staging session gone worker-side. Prevents the store from being locked out of creating new bulk sessions until close/reopen.

- [x] 16.2 Centralize session invalidation for destructive/lifecycle operations
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: add `private invalidateBulkSession()` and use it in `close()`, `clear()`, and `recreate()`
      Approach: removes the ad-hoc `this.activeBulkSessionId = undefined` repetitions so a future destructive op cannot forget the host/worker sync.

- [x] 16.3 Tests for clear() invalidating active and racing sessions
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-lifecycle.spec.ts`: sequential test (`session1.commit()` rejects `StoreNotOpenError` after `clear()`, then `session2` commits) and race test (concurrent `clear()` makes stale `writeFiles()` reject; a fresh session can be created and rolled back afterwards)
      Approach: mirrors the invalidation semantics already covered for close/recreate.

## 17. Compliance Reconciliation (post-audit round)

- [x] 17.1 Add `BulkSessionStateError` typed domain error
      `packages/code-graph/src/domain/errors/`: `BulkSessionStateError` (code `BULK_SESSION_STATE`) — replace the three generic `Error` throws in the host bulk-session state machine (`sqlite-graph-store.ts`: session already active, already finished, invalid state)
      Approach: Extend `SpecdCodeGraphError`; export from the domain error index.
      (Req: Worker-backed non-blocking execution, Transactional mutation model)

- [x] 17.2 Add `InvalidGraphStoreConfigurationError` typed domain error
      `packages/code-graph/src/domain/errors/`: `InvalidGraphStoreConfigurationError` (code `INVALID_GRAPH_STORE_CONFIGURATION`) — replace the generic `Error` for invalid `maxPendingOperations` in `open()` (`sqlite-worker-client.ts`)
      Approach: Extend `SpecdCodeGraphError`; export from the domain error index.
      (Req: Worker-backed non-blocking execution)

- [x] 17.3 Add `GraphSchemaIncompatibleError` typed domain error
      `packages/code-graph/src/domain/errors/`: `GraphSchemaIncompatibleError` (code `GRAPH_SCHEMA_INCOMPATIBLE`) — replace the generic `Error` for incompatible persisted schema on `open()` (`sqlite-graph-database.ts`)
      Approach: Extend `SpecdCodeGraphError`; export from the domain error index.
      (Req: Schema versioning)

- [x] 17.4 Use `BulkSessionStateError` for worker-side session lookup failures
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts`: replace generic `Error` for missing/duplicate `sessionId` (create/require bulk session) with `BulkSessionStateError`
      Approach: Keep distinct messages; unknown-operation path remains an internal protocol `Error`.
      (Req: Worker-backed non-blocking execution)

- [x] 17.5 Extend `deserializeWorkerError` with the three new codes
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`: handle `BULK_SESSION_STATE`, `INVALID_GRAPH_STORE_CONFIGURATION`, `GRAPH_SCHEMA_INCOMPATIBLE` so worker-thrown typed errors reconstruct as the same types on the host
      Approach: Add branches mirroring the existing codec; extend the round-trip test.
      (Req: Worker-backed non-blocking execution)

- [x] 17.6 Complete empty JSDoc blocks
      `packages/code-graph/src/infrastructure/sqlite/sqlite-runtime-descriptor.ts` (`SQLiteGraphStoreOptions`) and `packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts` (`WorkerBulkSession`): replace empty JSDoc with real descriptions
      Approach: Follow the local JSDoc conventions (description, `@param`, `@returns` as applicable).
      (Req: Package exports)

- [x] 17.7 Create ADR-0025
      `docs/adr/0025-nonblocking-worker-sqlite-graph-store.md`: MADR-format ADR for the non-blocking worker-thread SQLite backend decision, with `### Confirmation` and `### Spec` sections linking `code-graph:sqlite-graph-store` and `code-graph:composition`
      Approach: Document the decision and rejected alternatives (async driver, worker pool, worker per operation, main-thread SQLite).
      (Req: SQLite-backed implementation, Worker-backed non-blocking execution)

- [x] 17.8 Add `SqliteRuntimeDescriptor.modulePath` end-to-end test
      `packages/code-graph/test/`: descriptor supplied via `createSqliteGraphStoreFactory` / composition options reaches the worker during `open()` and drives the worker-side dynamic module load
      Approach: Exercise the factory plumbing path; assert the custom module is loaded inside the worker.
      (Req: Factory function, Worker-backed non-blocking execution)

- [x] 17.9 Add `createSqliteGraphStoreFactory` behavior tests
      `packages/code-graph/test/`: options plumb-through of `runtime` / `maxPendingOperations` and rejection of an invalid `maxPendingOperations`
      Approach: Unit-test the factory in isolation; invalid config rejects with `InvalidGraphStoreConfigurationError`.
      (Req: Factory function)

- [x] 17.10 Add public-barrel export-presence smoke tests
      `packages/code-graph/test/barrel.spec.ts`: assert spec-mandated `"."` exports are importable (`GraphStoreFactory`, `GraphStoreFactoryOptions`, `CodeGraphOptions`, `CodeGraphCompositionOptions`, `SqliteRuntimeDescriptor`, `SQLiteGraphStoreOptions`, `createSqliteGraphStoreFactory`, `LanguageAdapter`, model vocabulary, `SpecNotFoundError` code/specId) and that host use-case factories (`createGetGraphHealth`, `createIndexProjectGraph`, `createGetSpecCoverage`, `createGetChangeSpecCoverage`) are named exports from the public barrel
      Approach: Import from `src/public.js` and assert presence.
      (Req: Package exports, Host use cases)

- [x] 17.11 Replace `as unknown as` partial port mocks introduced/needed by this change
      `packages/code-graph/test/composition/host-use-case-factories.spec.ts`, `packages/code-graph/test/application/use-cases/get-change-spec-coverage.spec.ts`: full typed port implementations, no `as unknown as`
      Approach: Scope-limited — only mocks this change created or needed; pre-existing helper mocks stay untouched.
      (Req: default:\_global/testing)

- [x] 17.12 Run full compliance audit and confirm 24/24 + no change-attributable global findings
      Re-run the full-mode compliance audit after the fixes; update the report and confirm the change can archive cleanly
      Approach: Re-run `/specd-verify` full mode after implementation; supersede the 20260819-214909 report.
      (Req: default:\_global/\*)

- [x] 17.13 Add protocol round-trip tests for the three new typed error codes
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts`: round-trip `BULK_SESSION_STATE`, `INVALID_GRAPH_STORE_CONFIGURATION`, `GRAPH_SCHEMA_INCOMPATIBLE` through `serializeWorkerError` / `deserializeWorkerError`
      Approach: Extend the existing round-trip test; the three new codes are currently exercised only indirectly.
      (Req: Worker-backed non-blocking execution)

- [x] 17.14 Add typed assertion for the host "already active" bulk-session branch
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-lifecycle.spec.ts`: assert `beginBulkIndexSession` already-active throw rejects with `BulkSessionStateError` by type
      Approach: Add a test mirroring the in-flight commit/rollback assertions but asserting the error type directly. Placed in the lifecycle spec alongside the other bulk-session state tests.
      (Req: Worker-backed non-blocking execution)

- [x] 17.15 Add literal post-close `analyzeImpact` test
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`: assert `analyzeImpact` throws `StoreNotOpenError` after `close()`
      Approach: Exercise the shared `assertAvailable` gate via a literal impact call after close.
      (Req: Lifecycle management)

- [x] 17.16 Add provider-level `resolveFileSelector` test
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`: direct facade test normalizing a project-relative path to the canonical graph identity
      Approach: Call `provider.resolveFileSelector` on an opened provider and assert canonical resolution.
      (Req: CodeGraphProvider facade)

- [x] 17.17 Assert `SpecNotFoundError.specId` in barrel smoke test
      `packages/code-graph/test/barrel.spec.ts`: assert the `specId` getter alongside the `SPEC_NOT_FOUND` code
      Approach: Extend the existing error surface test to check both `.code` and `.specId`.
      (Req: Package exports)

- [x] 17.18 Export public resolver selector result types
      `packages/code-graph/src/public.ts`, `packages/code-graph/src/index.ts`: export `ResolvedFileSelector`, `ResolvedSymbolSelector`, `ResolvedSymbolSelectorResult` from `resolve-graph-selector.ts`
      Approach: The public facade `resolveFileSelector`/`resolveSymbolSelector` return these types; Requirement 8 requires resolver result types to be publicly nameable. Add a barrel smoke assertion for them.
      (Req: Package exports, Symbol-reference provider surface)

## 18. Main reconciliation and efficient wide traversal follow-up

- [x] 18.1 Add storage-neutral batch traversal reads to `GraphStore`
      `packages/code-graph/src/domain/ports/graph-store.ts`: `GraphStore` — add `getSymbolsByIds`, `getIncomingSymbolRelations`, and `getOutgoingSymbolRelations` with readonly inputs and documented deterministic results
      Approach: use the exact signatures from design; keep SQL and worker concepts out of the domain port.
      (Req: Batched symbol traversal reads)

- [x] 18.2 Implement deterministic batch reads in the in-memory test store
      `packages/code-graph/test/helpers/in-memory-graph-store.ts`: `InMemoryGraphStore` — implement the three new abstract methods
      Approach: deduplicate ids, omit unknown symbols, preserve first requested-id order, filter direction/types, and sort relations by source/type/target.
      (Req: Batched symbol traversal reads)

- [x] 18.3 Add typed worker protocol operations for traversal batches
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts`: `SQLiteWorkerOperationMap` — add batch symbol, incoming-relation, and outgoing-relation payload/result entries
      Approach: carry readonly id/type arrays in structured-clone-safe payloads; derive discriminators from the exhaustive operation map.
      (Req: Worker-efficient batch reads)

- [x] 18.4 Implement worker-side set-based symbol batches
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: `getSymbolsByIds` — fetch symbols with bound `IN` predicates
      Approach: deduplicate ids, query sequential chunks of at most 900 parameters, map rows by id, and emit first requested-id order without unknowns.
      (Req: Batched symbol traversal reads, Worker-efficient batch reads)

- [x] 18.5 Implement worker-side set-based relation batches
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: `getIncomingSymbolRelations` and `getOutgoingSymbolRelations` — query ids and relation types together
      Approach: validate the six traversal types, chunk ids by `900 - relationTypes.length`, use bound placeholders, deduplicate source/type/target, and globally sort merged results.
      (Req: Batched symbol traversal reads, Worker-efficient batch reads)

- [x] 18.6 Dispatch batch operations through the worker FIFO
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts`: message dispatcher — route the three new operations to `SQLiteGraphDatabase`
      Approach: execute each complete logical batch as one item on the existing serial promise chain and return one correlated response.
      (Req: Worker-backed non-blocking execution, Worker-efficient batch reads)

- [x] 18.7 Expose one-RPC batch methods from `SQLiteGraphStore`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: GraphStore batch overrides — add host empty-input guards and client requests
      Approach: return `[]` before IPC for empty inputs; otherwise issue exactly one `sendRequest` per logical method call and leave physical chunks inside the worker.
      (Req: Worker-efficient batch reads)

- [x] 18.8 Extend memoized reads for batch operations
      `packages/code-graph/src/domain/services/analyze-file-impact.ts`: `createMemoizedReadStore` — implement the three batch methods and reuse/populate per-id caches
      Approach: share resolved and in-flight reads across the full top-level impact call while reprojecting results into deterministic contract order.
      (Req: Batched symbol traversal reads, Bounded batched traversal execution)

- [x] 18.9 Add the ordered concurrency utility
      `packages/code-graph/src/domain/services/map-with-concurrency.ts`: `mapWithConcurrency` — implement a pure ordered scheduler
      Approach: validate a positive integer limit, run at most that many mappers, preserve input order, and stop scheduling after first rejection.
      (Req: Bounded batched traversal execution)

- [x] 18.10 Batch upstream BFS frontiers
      `packages/code-graph/src/domain/services/get-upstream.ts`: `getUpstream` and incoming relation helper — remove per-symbol/per-relation `Promise.all`
      Approach: one incoming relation batch and one symbol batch per frontier/lookahead; group by target and preserve visited, import, depth, cycle, and truncation semantics.
      (Req: Bounded batched traversal execution)

- [x] 18.11 Batch downstream BFS frontiers
      `packages/code-graph/src/domain/services/get-downstream.ts`: `getDownstream` and outgoing relation helper — remove per-symbol/per-relation `Promise.all`
      Approach: one outgoing relation batch and one symbol batch per frontier/lookahead; group by source and preserve visited, import, depth, cycle, and truncation semantics.
      (Req: Bounded batched traversal execution)

- [x] 18.12 Share one concurrency budget across file impact
      `packages/code-graph/src/domain/services/analyze-file-impact.ts` and `analyze-files-impact.ts`: `ImpactExecutionContext`, `analyzeFileImpactDetails`, `analyzeFilesImpact` — replace unbounded file/symbol fan-out
      Approach: create one memoized store and one budget of 4 per top-level call; avoid nested permit acquisition by using a shared re-entrant scheduler or flattened jobs; preserve ordering, coverage, counts, and risk.
      (Req: Bounded batched traversal execution, File impact)

- [x] 18.13 Add GraphStore and traversal batch unit tests
      `packages/code-graph/test/domain/`: GraphStore contract, upstream/downstream, and file-impact suites — cover order, unknown/duplicate/empty inputs, all relation types, wide frontiers, and shared maximum concurrency
      Approach: instrument store call counts and active operations; assert one logical batch per frontier and maximum active work 4 with unchanged semantic results.
      (Req: Batched symbol traversal reads, Bounded batched traversal execution)

- [x] 18.14 Add SQLite batch RPC and SQL chunk tests
      `packages/code-graph/test/infrastructure/sqlite/`: protocol, database, and store suites — verify one RPC, empty no-op, >900 parameter chunks, deterministic merge, and no loss/duplication
      Approach: spy at host/worker and database boundaries so RPC batching and physical chunking are independently proven.
      (Req: Worker-efficient batch reads)

- [x] 18.15 Add low-capacity wide-graph integration regression
      `packages/code-graph/test/integration/sqlite-wide-traversal.spec.ts`: reproduce wide overlapping multi-file upstream/downstream impact with `maxPendingOperations: 32`
      Approach: compare SQLite with the in-memory store and assert completion without `StoreOverloadError`, identical ordered results, depths, counts, coverage, and risk.
      (Req: Bounded batched traversal execution)

- [x] 18.16 Reconcile SQLite-only internal exports after the main merge
      `packages/code-graph/src/index.ts` and `packages/code-graph/test/barrel.spec.ts`: remove the historical Ladybug internal export/assertion introduced by tasks 14.1 and 14.5
      Approach: keep `SQLiteGraphStore`, `AdapterRegistry`, and language adapters internal; assert `LadybugGraphStore` is absent from both public and internal entries.
      (Req: Package exports, Factory function)

- [x] 18.17 Update ADR-0025 for batching and all affected specs
      `docs/adr/0025-nonblocking-worker-sqlite-graph-store.md`: add set-based batch reads, shared traversal budget, rejected queue-limit-only fix, and links to graph-store/traversal specs
      Approach: retain MADR, Confirmation, and Spec sections; document why batching plus bounded scheduling is required.
      (Req: Worker-efficient batch reads, Bounded batched traversal execution)

- [x] 18.18 Run build, lint, unit, integration, and manual regression commands
      repository and CLI: validate the complete reconciled implementation and original failure case
      Approach: build/lint code-graph and CLI, run all code-graph tests, index via `node packages/cli/dist/index.js graph index --format toon`, run the original six-file impact command twice, compare deterministic output, and confirm host heartbeat plus clean worker shutdown.
      (Req: all four affected specs and verification scenarios)
