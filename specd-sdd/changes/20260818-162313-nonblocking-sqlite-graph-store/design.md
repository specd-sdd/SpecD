# Design: nonblocking-sqlite-graph-store

## Overview

`SQLiteGraphStore` encapsulates `better-sqlite3` database operations, statement caches, schema initialization, and transactional batch commits off the host Node.js event loop by executing them inside a dedicated, persistent worker thread (`node:worker_threads`).

This design establishes:

1. **Explicit Lifecycle State Machine**: `WorkerState = 'closed' | 'opening' | 'open' | 'closing' | 'faulted'` with concurrent promise sharing (`openPromise`, `closePromise`).
2. **Graceful Shutdown & Drain**: `close()` stops accepting new requests, drains in-flight operations with fallback timeout, sends explicit `close` to the database, and terminates the worker cleanly.
3. **Worker FIFO Serial Execution**: Explicit single-consumer serial queue inside `sqlite-worker.ts` preventing any race condition across async operations (`open`, `recreate`) and subsequent queries.
4. **Strongly-Typed RPC Contract**: An exhaustive `SQLiteWorkerOperationMap` ensuring compile-time type safety for operation names, payloads, and returned results (including dedicated `getAllIndexCoverage`).
5. **Strict Bounded Outstanding Requests**: Validated positive integer limit (`maxPendingOperations >= 1`) throwing `StoreOverloadError` on overflow.
6. **Fault Isolation & Manual Recovery**: Worker crashes transition the store to `faulted` (throwing `StoreWorkerError`), allowing manual recovery via `close()` followed by `open()` without silent auto-restart.

---

## Architectural Breakdown

```
┌─────────────────────────────────────────────────────────────┐
│ Host Thread (CLI / SDK / Future HTTP API / MCP)             │
│   SQLiteGraphStore (implements GraphStore)                  │
│     └── SQLiteWorkerClient                                  │
│           ├── State Machine (closed|opening|open|closing|   │
│           │                  faulted)                       │
│           ├── Concurrent openPromise / closePromise sharing │
│           ├── Bounded Outstanding Requests Map (< 256)      │
│           └── Graceful shutdown drain with safety timeout   │
└──────────────────────────────┬──────────────────────────────┘
                               │ Worker MessagePort IPC
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Dedicated Worker Thread (sqlite-worker.ts)                  │
│   Single-Consumer Serial Execution Queue (FIFO Promise Chain)│
│     └── SQLiteGraphDatabase                                 │
│           ├── better-sqlite3 engine (synchronous)           │
│           ├── LRU / Map Prepared Statement Cache            │
│           ├── Atomic Bulk Index Transactions                │
│           ├── FTS5 Search Ranking Index                     │
│           └── Dedicated getAllIndexCoverage() query         │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Details

### 1. State Machine and Concurrent Deduplication

`SQLiteWorkerClient` maintains an explicit state variable:

```ts
type WorkerState = 'closed' | 'opening' | 'open' | 'closing' | 'faulted'

export class SQLiteWorkerClient {
  private state: WorkerState = 'closed'
  private openPromise?: Promise<void>
  private closePromise?: Promise<void>
  private readonly pendingRequests = new Map<number, PendingRequest>()

  get isOpen(): boolean {
    return this.state === 'open'
  }
}
```

- **Concurrent `open()`**:
  - If `state === 'open'`, resolves immediately.
  - If `state === 'opening'`, returns the existing `this.openPromise`.
  - If `state === 'closing'` or `state === 'faulted'`, throws an error requiring clean shutdown before reopening.
  - Otherwise, initializes `this.openPromise`, validates `maxPendingOperations`, spawns the worker, awaits `open` RPC ACK, transitions to `open`, and clears `openPromise`.

- **Concurrent `close()`**:
  - If `state === 'closed'`, resolves immediately.
  - If `state === 'closing'`, returns the existing `this.closePromise`.
  - Otherwise, initializes `this.closePromise`, transitions to `closing`, drains in-flight requests, sends `close` RPC, terminates worker, transitions to `closed`, and clears `closePromise`.

### 2. Shutdown & Drain Semantics

`drainPendingRequests(timeoutMs): Promise<boolean>` returns `true` if all in-flight requests settled
within the timeout, or `false` if the timeout expired before they did.

During `close()`:

1. `closePromise` is set at the very start of the outer IIFE. A single `try/finally` wrapping the
   **entire** body (including `await openPromise`) guarantees `closePromise` is always cleared —
   even when `open()` fails concurrently. Without this, a subsequent `close()` would find the stale
   resolved promise and silently skip recovery.
2. `deadline = Date.now() + drainTimeoutMs` is computed once at the entry of `close()`. This shared
   deadline bounds the graceful-shutdown phases — `await openPromise`, the drain phase, and the
   `close` RPC ACK — using a unref'd `withDeadline` helper. It is NOT a hard upper bound on the
   total `close()` wall-clock time: once the deadline expires, forced `worker.terminate()` is
   initiated and `close()` awaits the termination to conclude (a worker executing native code offers
   no mathematical guarantee of terminating within a fixed bound).
3. If `state === 'opening'`, `close()` sets `state = 'closing'` and awaits `openPromise` with `withDeadline`.
   `open()` sees `state !== 'opening'` and skips the `→ 'open'` transition. If `openPromise` rejects or times out,
   `close()` returns early from the inner catch — the outer `finally` still clears `closePromise` and terminates the worker.
   `handleWorkerExit` in `'closing'` state also rejects any stale pending requests (such as an unacknowledged `open` RPC).
4. `state` is set to `closing`. Any new incoming `sendRequest()` call immediately rejects with `StoreNotOpenError`.
5. `drainPendingRequests(Math.max(0, deadline - now))` waits for pending requests to settle. When the
   remaining time is `0`, `drainPendingRequests(0)` resolves `false` immediately without scheduling an interval tick.
6. **If `drained === true`** (all requests settled before deadline):
   - `withDeadline(sendRequestInternal('close'), deadline)` races the clean DB close RPC against the shared deadline.
7. **If `drained === false`** OR the `close` RPC times out:
   - Any remaining pending requests are rejected **before** `worker.terminate()` is called, so
     the drain-timeout `StoreWorkerError` is the rejection callers observe (not the exit-event error).
   - `worker.terminate()` is called unconditionally to force-kill the thread; `close()` awaits it.
8. `state` transitions to `closed` and `closePromise` is cleared in the `finally` block.

### 3. Worker-Side Serial FIFO Execution Queue

To guarantee strict serial FIFO execution even across asynchronous worker operations (`open`, `recreate`), `sqlite-worker.ts` utilizes an explicit execution queue:

```ts
let dispatchQueue: Promise<void> = Promise.resolve()

parentPort.on('message', (message: SQLiteWorkerRequest) => {
  dispatchQueue = dispatchQueue
    .then(() => handleMessage(database, message, (resp) => parentPort?.postMessage(resp)))
    .catch((error) => {
      // Unhandled error reported to host; queue remains unbroken
      parentPort?.postMessage({
        id: message.id,
        type: 'error',
        error: serializeError(error),
      })
    })
})
```

This ensures that queries dispatched after `recreate()` wait until `recreate()` finishes database teardown, schema creation, and initialization before executing.

### 4. Strongly-Typed RPC Protocol Map

The RPC protocol defines the complete contract mapping operation names to their payload and return types:

```ts
export interface SQLiteWorkerOperationMap {
  open: { payload: OpenWorkerPayload; result: void }
  close: { payload: Record<string, never>; result: void }
  recreate: { payload: Record<string, never>; result: void }
  clear: { payload: Record<string, never>; result: void }
  getFile: { payload: { filePath: string }; result: FileNode | undefined }
  findFilesByConfigRelativePath: { payload: { configRelativePath: string }; result: FileNode[] }
  getDocument: { payload: { documentId: string }; result: DocumentNode | undefined }
  findDocumentsByConfigRelativePath: {
    payload: { configRelativePath: string }
    result: DocumentNode[]
  }
  getSymbol: { payload: { symbolId: string }; result: SymbolNode | undefined }
  findSymbols: { payload: { query: SymbolQuery }; result: SymbolNode[] }
  getSpec: { payload: { specId: string }; result: SpecNode | undefined }
  getSpecDependencies: { payload: { specId: string }; result: Relation[] }
  getSpecDependents: { payload: { specId: string }; result: Relation[] }
  getCoveredFiles: { payload: { specId: string }; result: Relation[] }
  getCoveringSpecsForFile: { payload: { filePath: string }; result: Relation[] }
  getCoveringSpecsForFiles: { payload: { filePaths: readonly string[] }; result: Relation[] }
  getCoveredSymbols: { payload: { specId: string }; result: Relation[] }
  getCoveringSpecsForSymbol: { payload: { symbolId: string }; result: Relation[] }
  getCoveringSpecsForSymbols: { payload: { symbolIds: readonly string[] }; result: Relation[] }
  getCallers: { payload: { symbolId: string }; result: Relation[] }
  getCallees: { payload: { symbolId: string }; result: Relation[] }
  getImporters: { payload: { filePath: string }; result: Relation[] }
  getImportees: { payload: { filePath: string }; result: Relation[] }
  findDirectlyAffectedFiles: { payload: { filePaths: readonly string[] }; result: string[] }
  getExtenders: { payload: { symbolId: string }; result: Relation[] }
  getExtendedTargets: { payload: { symbolId: string }; result: Relation[] }
  getImplementors: { payload: { symbolId: string }; result: Relation[] }
  getImplementedTargets: { payload: { symbolId: string }; result: Relation[] }
  getOverriders: { payload: { symbolId: string }; result: Relation[] }
  getOverriddenTargets: { payload: { symbolId: string }; result: Relation[] }
  getExportedSymbols: { payload: { filePath: string }; result: SymbolNode[] }
  getSymbolCallers: {
    payload: Record<string, never>
    result: Array<{ symbol: SymbolNode; callerFilePath: string }>
  }
  getFileImporterCounts: { payload: Record<string, never>; result: Map<string, number> }
  getAllFiles: { payload: Record<string, never>; result: FileNode[] }
  getAllDocuments: { payload: Record<string, never>; result: DocumentNode[] }
  getAllSpecs: { payload: Record<string, never>; result: SpecNode[] }
  getAllReferenceFacts: { payload: Record<string, never>; result: ReferenceFactsWrite }
  findLogicalSymbolsByIds: { payload: { ids: readonly string[] }; result: LogicalSymbol[] }
  findDeclarations: {
    payload: { logicalSymbolIds: readonly string[] }
    result: LogicalDeclaration[]
  }
  findPublicBindingsByExportedNames: {
    payload: { exportedNames: readonly string[] }
    result: PublicBinding[]
  }
  getStatistics: { payload: Record<string, never>; result: GraphStatistics }
  searchSymbols: {
    payload: { query: string; options: SearchOptions }
    result: Array<{
      symbol: SymbolNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  }
  searchSpecs: {
    payload: { query: string; options: SearchOptions }
    result: Array<{
      spec: SpecNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  }
  searchDocuments: {
    payload: { query: string; options: SearchOptions }
    result: Array<{
      document: DocumentNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  }
  searchSourceCandidates: {
    payload: { query: SourceContentCandidateQuery }
    result: SourceContentCandidatePage
  }
  upsertFile: {
    payload: {
      file: FileNode
      symbols: SymbolNode[]
      relations: Relation[]
      referenceFacts?: ReferenceFactsWrite | undefined
    }
    result: void
  }
  removeFile: { payload: { filePath: string }; result: void }
  upsertDocument: { payload: { document: DocumentNode }; result: void }
  removeDocument: { payload: { documentPath: string }; result: void }
  upsertSpec: { payload: { spec: SpecNode; relations: Relation[] }; result: void }
  removeSpec: { payload: { specId: string }; result: void }
  removeSpecs: { payload: { specIds: readonly string[] }; result: void }
  addRelations: { payload: { relations: Relation[] }; result: void }
  readStorageGenerationSnapshot: {
    payload: Record<string, never>
    result: StorageGenerationSnapshot
  }
  rotateStorageGeneration: {
    payload: { expectedGeneration: string }
    result: StorageGenerationSnapshot
  }
  getIndexedInputObservations: {
    payload: { resources: readonly IndexedResourceKey[] }
    result: readonly IndexedInputObservation[]
  }
  markIndexedInputsStale: {
    payload: { updates: readonly MarkIndexedInputStaleInput[] }
    result: void
  }
  updateIndexedInputObservation: {
    payload: { updates: readonly UpdateIndexedInputObservationInput[] }
    result: void
  }
  readFreshnessLatches: { payload: { workspaces: readonly string[] }; result: FreshnessLatches }
  markWorkspacesAndGraphStaleSinceLastIndex: {
    payload: { workspaces: readonly string[] }
    result: void
  }
  replaceReferenceFacts: { payload: { facts: ReferenceFactsWrite }; result: void }
  findLogicalSymbols: {
    payload: { lookups: readonly LogicalSymbolLookup[] }
    result: LogicalSymbol[]
  }
  findLogicalDeclarations: {
    payload: { logicalSymbolIds: readonly string[] }
    result: LogicalDeclaration[]
  }
  findPublicBindings: {
    payload: { lookups: readonly PublicBindingLookup[] }
    result: PublicBinding[]
  }
  findLocalBindings: { payload: { lookups: readonly LocalBindingLookup[] }; result: LocalBinding[] }
  findResolutionSteps: { payload: { fromIds: readonly string[] }; result: ResolutionStep[] }
  findIndexCoverage: { payload: { filePaths: readonly string[] }; result: IndexCoverage[] }
  getAllIndexCoverage: { payload: Record<string, never>; result: IndexCoverage[] }
  rebuildFtsIndexes: { payload: Record<string, never>; result: void }
  beginBulkIndexSession: { payload: { sessionId: string }; result: void }
  stageBulkFiles: { payload: { sessionId: string; files: FileNode[] }; result: void }
  stageBulkSymbols: { payload: { sessionId: string; symbols: SymbolNode[] }; result: void }
  stageBulkReferenceFacts: {
    payload: { sessionId: string; facts: ReferenceFactsWrite }
    result: void
  }
  stageBulkRemovals: {
    payload: {
      sessionId: string
      filePaths?: string[]
      documentPaths?: string[]
      specIds?: string[]
    }
    result: void
  }
  commitBulkIndex: {
    payload: { sessionId: string; metadata?: SerializableIndexWriteSessionMetadata }
    result: void
  }
  rollbackBulkIndexSession: { payload: { sessionId: string }; result: void }
}
```

### 5. `getAllIndexCoverage()` Implementation

In `SQLiteGraphDatabase`:

```ts
getAllIndexCoverage(): IndexCoverage[] {
  const db = this.ensureOpen()
  const rows = db.prepare('SELECT * FROM index_coverage ORDER BY file_path').all() as IndexCoverageRow[]
  return rows.map(toIndexCoverage)
}
```

---

## Testing Strategy

1. **Coverage Contract Tests**: Verify `findIndexCoverage(filePaths)` vs `getAllIndexCoverage()` return exact matching records.
2. **Concurrency & Lifecycle Tests**:
   - Multiple concurrent `open()` calls share one initialization promise.
   - Multiple concurrent `close()` calls share one shutdown promise.
   - `close()` drains in-flight requests and rejects new ones.
   - `close()` sends `close` to worker before termination.
   - Concurrent queries and `recreate()` preserve strict FIFO ordering.
   - `faulted` state prevents operations and recovers after `close()` + `open()`.
   - Strict validation of `maxPendingOperations` (< 1, non-integer, negative rejects).
   - **`close()` called while `open()` is still in-flight**: `close()` waits for `openPromise`, then
     proceeds to shut down; `open()` does **not** expose `'open'` state after resolving.
   - **Drain timeout forces worker termination**: when `drainPendingRequests()` returns `false`, the
     `close` RPC is skipped and `worker.terminate()` is called; pending requests are rejected with
     `StoreWorkerError`.
   - **Worker crash during `opening`**: unhandled worker exit before the `open` ACK leaves state as
     `faulted` (not `closed`), giving callers deterministic signal that startup failed.

- **`closePromise` cleared when `open()` fails during concurrent `close()`**: a subsequent
  `close()` executes the recovery path rather than returning the stale promise; a full
  `open()` → `close()` cycle succeeds afterwards.
  - **`close()` force-terminates when worker ignores the `close` RPC**: a mock worker that
    responds to `open` but never acknowledges `close` causes `close(N)` to give up graceful
    shutdown at ≈N ms and await forced termination; the store reaches `'closed'`.
  - **Bulk session state machine**: writes/removals, duplicate commits, and rollbacks are
    rejected while a commit (`committing`) or rollback (`rolling-back`) is in flight; the
    original operation completes unaffected.
  - **No session resurrection**: staging RPCs against a committed, rolled-back, closed, or
    recreated session reject instead of creating a new worker-side session (`createBulkSession`
    is only reachable from `beginBulkIndexSession`).
  - **Reference-facts chunk merge**: two `writeReferenceFacts()` calls in one session persist
    data from both chunks after commit.
  - **`maxPendingOperations: 1` session**: a full begin → stage → commit session succeeds
    because the begin RPC is shared and awaited (`ensureReady`) instead of fire-and-forget.
  - **`bulkLoad()` chunked staging**: large `bulkLoad()` inputs are staged in bounded chunks
    through the session flow; no single complete-graph structured-clone is sent.
  - **Responsiveness with many staging RPCs**: 10 000 files/symbols staged in 250-element
    chunks while the host heartbeat (10 ms interval) keeps ticking (`ticks > 0`) with bounded
    `maxLag`.

3. **End-to-End Indexing & Traversal**: Run indexer, health checks, symbol queries, and FTS search.
