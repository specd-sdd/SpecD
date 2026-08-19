# Design: nonblocking-sqlite-graph-store

## Overview & Motivation

`SQLiteGraphStore` implements the asynchronous `GraphStore` contract in `@specd/code-graph`, but its persistence engine relies on `better-sqlite3`, whose database calls execute synchronously on the JavaScript thread that invokes them. In long-running host processes (such as MCP servers, SDK embeddings, CLI daemons, and future HTTP/Electron/Studio environments), resource-intensive SQLite operations (such as FTS index rebuilds, bulk graph commits, schema migrations, and deep traversal searches) block the host event loop.

This design introduces a worker-thread boundary for SQLite operations. Each open `SQLiteGraphStore` owns a single, persistent Node.js Worker Thread (`node:worker_threads`). Synchronous `better-sqlite3` queries and transactions run entirely inside the worker thread, while the host process communicates asynchronously over a structured, serializable request/response protocol with FIFO queuing and bounded backpressure.

---

## Architectural Boundaries & Component Structure

Following Hexagonal Architecture and DDD principles, the components are structured as follows:

```
[ Host Process ]
  CodeGraphProvider (Composition Facade)
       │
       ▼
  SQLiteGraphStore (Infrastructure Port Adapter: GraphStore)
       │
       ▼
  SQLiteWorkerClient (Worker Lifecycle, Correlation & Queue Backpressure)
       │
       │ (node:worker_threads IPC - postMessage)
=======│======================================================================== Execution Boundary
       ▼
  sqlite-worker.ts (Worker Thread Entrypoint, Message Dispatcher)
       │
       ▼
  SQLiteGraphDatabase (Synchronous SQLite Persistence & Statement Cache)
       │
       ▼
  better-sqlite3 (Native Database Driver) -> code-graph.sqlite
```

### Component Responsibilities

1. **`SQLiteGraphStore` (`packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`)**:
   - Implements the public `GraphStore` interface.
   - Translates high-level domain/application requests into worker protocol requests.
   - Manages the host-side staging session for bulk indexing (`beginBulkIndexSession()`).
   - Delegates lifecycle and message dispatch to `SQLiteWorkerClient`.
   - Exposes clean domain/infrastructure errors (`StoreOverloadError`, `StoreWorkerError`, etc.).

2. **`SQLiteWorkerClient` (`packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts`)**:
   - Manages the `Worker` instance lifecycle (`open()`, `close()`, crash detection).
   - Assigns incremental correlation IDs to outgoing requests.
   - Tracks in-flight promises in a pending map `Map<number, PendingRequest>`.
   - Enforces FIFO serial dispatch and bounded queue capacity (`maxPendingOperations`, default: 256).
   - Rejects pending and incoming promises deterministically upon worker crash or shutdown.
   - Dispatches progress notifications from the worker to host callbacks.

3. **`SQLiteWorkerProtocol` (`packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts`)**:
   - Defines strict TypeScript discriminated unions for requests, responses, errors, and progress events.
   - Defines serializable DTOs for bulk indexing payloads, search queries, and statistics.

4. **`sqlite-worker.ts` (`packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts`)**:
   - The worker entry point executed by `node:worker_threads`.
   - Listens to `parentPort` messages and dispatches them to `SQLiteGraphDatabase`.
   - Dynamically loads `better-sqlite3` using default module resolution or a specified `modulePath` from `SqliteRuntimeDescriptor`.
   - Emits structured progress events during long-running atomic operations (e.g. bulk indexing).

5. **`SQLiteGraphDatabase` (`packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`)**:
   - Houses the synchronous `better-sqlite3` database handle, prepared statement cache, schema initialization DDL, FTS queries, and atomic transaction blocks.
   - Extracted from the previous `SQLiteGraphStore` to encapsulate purely synchronous SQLite persistence without host-thread leakage.

---

## Detailed Component Specifications

### 1. Worker Protocol & DTOs

```typescript
export interface SqliteRuntimeDescriptor {
  readonly modulePath?: string | undefined
}

export type SQLiteWorkerOperation =
  | 'open'
  | 'close'
  | 'recreate'
  | 'clear'
  | 'getFile'
  | 'findFilesByConfigRelativePath'
  | 'getDocument'
  | 'findDocumentsByConfigRelativePath'
  | 'getSymbol'
  | 'findSymbols'
  | 'getSpec'
  | 'getSpecDependencies'
  | 'getSpecDependents'
  | 'getCoveredFiles'
  | 'getCoveringSpecsForFile'
  | 'getCoveredSymbols'
  | 'getCoveringSpecsForSymbol'
  | 'getStatistics'
  | 'searchSymbols'
  | 'searchSpecs'
  | 'searchDocuments'
  | 'upsertFile'
  | 'removeFile'
  | 'upsertSpec'
  | 'removeSpec'
  | 'commitBulkIndex'

export interface SQLiteWorkerRequest<T = unknown> {
  readonly id: number
  readonly op: SQLiteWorkerOperation
  readonly payload: T
}

export interface SQLiteWorkerSuccessResponse<T = unknown> {
  readonly id: number
  readonly type: 'result'
  readonly result: T
}

export interface SerializedErrorPayload {
  readonly code?: string | undefined
  readonly name: string
  readonly message: string
  readonly stack?: string | undefined
  readonly sqliteCode?: string | undefined
}

export interface SQLiteWorkerErrorResponse {
  readonly id: number
  readonly type: 'error'
  readonly error: SerializedErrorPayload
}

export interface SQLiteWorkerProgressEvent {
  readonly id: number
  readonly type: 'progress'
  readonly stage: string
}

export type SQLiteWorkerResponse =
  | SQLiteWorkerSuccessResponse
  | SQLiteWorkerErrorResponse
  | SQLiteWorkerProgressEvent
```

### 2. Worker Lifecycle & Initialization

#### Startup & `open()`

1. `SQLiteGraphStore.open()` calls `SQLiteWorkerClient.open({ storagePath, runtime, maxPendingOperations })`.
2. `SQLiteWorkerClient` resolves the path to `sqlite-worker.js` (see Packaging section).
3. Spawns `new Worker(workerPath, { workerData: { storagePath, runtime } })`.
4. Binds `worker.on('message')`, `worker.on('error')`, `worker.on('exit')`.
5. Sends `{ id: 1, op: 'open', payload: { storagePath, runtime } }`.
6. Inside the worker:
   - Loads the specified `better-sqlite3` module (`modulePath` or built-in import).
   - Ensures filesystem storage directory `{storagePath}/graph` exists.
   - Opens `code-graph.sqlite` and applies pragmas (`journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`, `busy_timeout = 5000`).
   - Runs schema verification / DDL creation and initializes FTS structures.
   - Sends success response.
7. `open()` Promise resolves. Store is ready to serve queries.

#### Shutdown & `close()`

1. Host marks store state as closing/closed to reject any new operations.
2. Squelches queue by draining remaining in-flight operations or terminating with timeout.
3. Sends `{ id: nextId, op: 'close', payload: {} }`.
4. Worker closes SQLite connection and prepares statement cleanup.
5. Worker reports success; host terminates worker with `worker.terminate()`.
6. Idempotent: Subsequent `close()` calls resolve immediately.

#### Worker Crash & Deterministic Failure

1. If the worker encounters an unhandled error or exits unexpectedly (`worker.on('exit', code)` where `code !== 0` while not closing):
2. `SQLiteWorkerClient` marks the store as faulted (`isFaulted = true`).
3. Iterates over all pending requests in `Map<number, PendingRequest>` and rejects each with `StoreWorkerError('SQLite worker terminated unexpectedly')`.
4. Rejects all future requests with `StoreNotOpenError` or `StoreWorkerError`.
5. No silent automatic worker resurrection.

### 3. Backpressure & FIFO Queue Management

- `maxPendingOperations`: Initial default is `256`. Configurable via `SqliteGraphStoreFactoryOptions`.
- When `pendingRequests.size >= maxPendingOperations`:
  - The request is immediately rejected on the host with `StoreOverloadError`.
  - The request is NOT sent to the worker, preventing memory bloat and unbounded IPC queuing.
- Operations are assigned monotonically increasing integer IDs.
- Messages are dispatched sequentially to the worker; worker processes them sequentially in FIFO order.

### 4. Bulk Indexing & Transaction Atomicity

- `SQLiteGraphStore.beginBulkIndexSession()` returns an `InMemoryIndexSession` (or session adapter) that accumulates files, symbols, relations, observations, documents, specs, and reference facts in host memory.
- On `session.commit()`:
  - The entire staged payload is serialized into a single `commitBulkIndex` request.
  - The worker receives the complete payload and runs a single atomic SQLite transaction:
    ```typescript
    db.transaction(() => {
      // 1. Cleanup old files/symbols
      // 2. Insert files, documents, symbols, specs
      // 3. Insert relations & observations
      // 4. Update metadata & VCS ref
      // 5. Rebuild FTS virtual tables once
    })()
    ```
  - During the transaction, the worker posts `{ id, type: 'progress', stage }` for stages:
    - `cleanup`, `files`, `documents`, `symbols`, `specs`, `reference-facts`, `observations`, `relations`, `search-indexes`.
  - Host `SQLiteWorkerClient` intercepts progress messages and invokes caller's `onProgress(stage)` callback.
- If an exception occurs, the transaction automatically rolls back in SQLite, and the worker returns a serialized error.

---

## Build, Packaging & Runtime Resolution

### 1. Build Entry Points (`package.json` / `tsup.config.ts`)

`packages/code-graph/package.json`:

```json
{
  "scripts": {
    "build": "tsup src/public.ts src/index.ts src/infrastructure/sqlite/sqlite-worker.ts --format esm --dts --clean"
  }
}
```

This ensures `dist/sqlite-worker.js` is built as an explicit, deterministic artifact alongside `dist/public.js` and `dist/index.js`.

### 2. Worker Path Resolution

Resolution must work seamlessly in three environments:

1. **Production / Built Package**: Loaded from `dist/index.js` or `dist/public.js`.
   - Worker is at `new URL('./sqlite-worker.js', import.meta.url)`.
2. **Development / Vitest (ESM)**: Source files loaded directly via TypeScript runtime.
   - Worker is at `new URL('./sqlite-worker.ts', import.meta.url)` or compiled test helper.
3. Resolution helper:
   ```typescript
   export function resolveSqliteWorkerPath(overridePath?: string): string {
     if (overridePath) return overridePath
     const isTs = import.meta.url.endsWith('.ts')
     const workerFileName = isTs ? 'sqlite-worker.ts' : 'sqlite-worker.js'
     return fileURLToPath(new URL(`./${workerFileName}`, import.meta.url))
   }
   ```

### 3. Forward Compatibility with `feat/user-interface` (`packages/code-graph-sqlite-electron`)

On `main`, `SqliteRuntimeDescriptor` is introduced:

```typescript
export interface SqliteRuntimeDescriptor {
  readonly modulePath?: string | undefined
}
```

When `packages/code-graph-sqlite-electron` is merged from `feat/user-interface`:

- It simply calls:
  ```typescript
  createSqliteGraphStoreFactory({
    runtime: {
      modulePath: electronBetterSqlite3ResolvedPath,
    },
  })
  ```
- The worker executes `import(descriptor.modulePath)` instead of the default `better-sqlite3`.
- No duplicated worker code, no IPC duplication, and no changes to `GraphStore` or `CodeGraphProvider`.

---

## Error Handling Hierarchy

Following SpecD conventions (`default:_global/error-handling-conventions`), new error classes extend `SpecdCodeGraphError`:

```typescript
export class StoreOverloadError extends SpecdCodeGraphError {
  constructor(message = 'SQLite operation queue overloaded', options?: ErrorOptions) {
    super(message, 'STORE_OVERLOAD', options)
  }
}

export class StoreWorkerError extends SpecdCodeGraphError {
  constructor(message = 'SQLite worker encountered an error', options?: ErrorOptions) {
    super(message, 'STORE_WORKER_ERROR', options)
  }
}
```

Host-side error deserializer converts `SerializedErrorPayload` into appropriate typed error instances (preserving message, code, and cause).

---

## Testing Strategy

1. **Unit Tests (`packages/code-graph/test/infrastructure/sqlite/`)**:
   - `sqlite-worker-protocol.spec.ts`: Serialization / deserialization of complex payloads and error objects.
   - `sqlite-worker-client.spec.ts`: Queue FIFO ordering, backpressure rejection at capacity limit, correlation ID matching.

2. **Integration Tests (`packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`)**:
   - Normal lifecycle: `open()`, write files, query symbols, FTS search, stats, `close()`.
   - Concurrent callers: Multiple concurrent queries correctly correlating responses.
   - Bulk index atomicity: Commit failure rolls back transaction; progress events emitted in order.
   - Deterministic crash handling: Killing worker thread rejects all active promises.
   - Runtime descriptor: Custom `modulePath` loads expected driver.

3. **Event-Loop Responsiveness Acceptance Test (`packages/code-graph/test/infrastructure/sqlite/host-responsiveness.spec.ts`)**:
   - Dispatches a heavy worker SQLite operation (e.g. indexing 1,000 files or large FTS scan).
   - Schedules immediate host microtasks and `setInterval`/`setTimeout` timers on the main thread.
   - Asserts that host timers execute and resolve before the long-running SQLite operation completes, proving non-blocking event-loop behavior.

4. **Package Build & Distribution Test (`packages/code-graph/test/integration/built-package.spec.ts`)**:
   - Verifies that running against `dist/` resolves `dist/sqlite-worker.js` and successfully opens and queries the store.

---

## Documentation Updates

- Update `docs/code-graph/index.md` and `docs/code-graph/services.md` to document the worker thread architecture, non-blocking execution model, and `SqliteRuntimeDescriptor` configuration.
