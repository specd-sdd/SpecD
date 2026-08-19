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

During `close()`:

1. `state` is set to `closing`. Any new incoming `sendRequest()` call immediately rejects with `StoreNotOpenError`.
2. The client waits for `this.pendingRequests.size === 0` with a safety timeout (default: 5000ms).
3. Once drained (or timed out), `sendRequestInternal('close', {}, true)` sends the shutdown command to the worker.
4. The worker invokes `database.close()`, closing the SQLite connection, clearing statements, and acknowledging.
5. `worker.terminate()` is called for final process cleanup.
6. Any remaining timed-out pending requests are rejected with `StoreWorkerError`.

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
  commitBulkIndex: { payload: BulkIndexPayload; result: void }
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
3. **End-to-End Indexing & Traversal**: Run indexer, health checks, symbol queries, and FTS search.
