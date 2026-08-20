---
status: accepted
date: 2026-08-20
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0025: Non-Blocking Worker-Thread SQLite Graph Store

## Context and Problem Statement

The code graph is persisted as a derived SQLite store. SQLite native writes are
synchronous and CPU-bound: schema migrations, bulk index commits, FTS rebuilds, and
WAL checkpoints block the host process's main thread for tens to hundreds of
milliseconds per operation. Spec-driven verification, indexing, and impact
workflows are interactive; long main-thread stalls make the CLI and editor hosts
feel frozen during indexing and degrade responsiveness for concurrent queries.

The graph store must remain a single-process embedded database (no server
process), keep transactional atomicity per index generation, and avoid
unbounded in-flight writes while the host stays responsive.

## Decision Drivers

- **Host responsiveness** — no SQLite native call may block the host thread
- **Single-process embedded storage** — no separate database service
- **Transactional integrity** — one atomic commit per index generation, with
  rollback on failure
- **Backpressure** — unbounded pending work must be rejected, not queued forever
- **Efficient traversal** — wide graph frontiers must cross the worker boundary as
  set-based reads instead of per-symbol RPC fan-out
- **Serialized state machine** — open/close/recreate and bulk-session mutations
  must remain race-free across async operations
- **Typed failure semantics** — expected domain failures (invalid configuration,
  schema mismatch, invalid bulk-session state) must be reconstructable across the
  worker boundary as the same typed errors
- **Minimal native surface** — only the worker thread touches native SQLite
  bindings

## Considered Options

1. Run SQLite directly on the main thread (status quo)
2. Replace SQLite with an async-native driver library
3. Use a worker pool of several SQLite workers
4. Spawn one worker per SQLite operation
5. Run one dedicated worker thread for the entire SQLite store
6. Keep per-symbol traversal reads and only raise `maxPendingOperations`

## Decision Outcome

Chosen option: **"Run one dedicated worker thread for the entire SQLite store"**,
because it keeps the proven synchronous native driver, isolates all native calls
from the host thread, preserves transactional atomicity inside one worker, and
bounds pending work with a configured concurrency limit.

### The rule

- All SQLite native operations execute inside a single dedicated worker thread.
  The host `SQLiteWorkerClient` communicates over structured RPC
  (`SQLiteWorkerRequest` / `SQLiteWorkerResponse`), never touching native
  bindings directly.
- The worker exposes a strict request/response protocol with one in-flight
  operation at a time and a bounded pending queue. `maxPendingOperations`
  (default 256) caps queued requests; exceeding it rejects immediately with
  `StoreOverloadError` instead of queuing without bound.
- `GraphStore` exposes storage-neutral batch reads for symbols and incoming or
  outgoing traversal relations. Each non-empty SQLite batch is one logical RPC;
  the worker executes bound, set-based SQL and splits inputs into sequential
  chunks below SQLite's parameter limit. Empty inputs return before IPC, symbol
  results preserve requested-id order, and relation results use deterministic
  source/type/target order.
- Breadth-first traversal issues one relation batch and one symbol batch per
  frontier rather than nested per-symbol calls. Multi-file impact shares one
  memoized read view and one concurrency budget of four across file and symbol
  work, preserving result order and semantics while keeping request pressure
  independent of frontier width.
- Lifecycle operations (`open`, `close`, `recreate`) form a serialized state
  machine. Concurrent `open()` calls share one in-flight initialization promise;
  `close()` and `recreate()` drain accepted requests before transitioning and
  reject new ones with `StoreNotOpenError`.
- Bulk index sessions are staged in chunks. The host accumulates entities into a
  session object and issues bounded staging RPCs (`BULK_RPC_CHUNK_SIZE = 1000`);
  `commitBulkIndex` performs one atomic transaction that stages the remaining
  payload, persists the generation, and rebuilds the semantic and source search
  indexes once. Commit and rollback are serialized per session; staging, writes,
  and removals reject while a commit or rollback is in flight.
- The worker owns the session lifetime map. A session removed by commit,
  rollback, close, clear, or recreate can never be resurrected; stale staging
  operations reject with `BulkSessionStateError`.
- Worker-thrown failures serialize as `SerializedErrorPayload` and reconstruct on
  the host. Expected domain failures use stable typed errors with machine codes:
  `BulkSessionStateError` (`BULK_SESSION_STATE`),
  `InvalidGraphStoreConfigurationError` (`INVALID_GRAPH_STORE_CONFIGURATION`),
  and `GraphSchemaIncompatibleError` (`GRAPH_SCHEMA_INCOMPATIBLE`), alongside the
  existing `StoreNotOpenError`, `StoreOverloadError`, `StoreWorkerError`,
  `GraphBusyError`, `GraphProviderStaleError`, and `SpecNotFoundError`. Unknown
  worker operations remain an internal protocol `Error`, not a host contract.
- Worker crashes fault the client. A subsequent `close()` then `open()` recovers
  the worker without leaking partial state.
- The worker may load a custom SQLite module through a serializable
  `SqliteRuntimeDescriptor` (`modulePath`), letting hosts bind driver or
  driver-location overrides across the process boundary.
- The composition surface exposes `createSqliteGraphStoreFactory` and
  `SQLiteGraphStoreOptions` (`runtime`, `maxPendingOperations`) for reusable
  store construction, while `SqliteRuntimeDescriptor` remains the only
  worker-visible configuration object.

### Consequences

- Good, because no SQLite native call blocks the host thread
- Good, because the proven synchronous driver is retained with transactional
  atomicity preserved inside the worker
- Good, because pending work is bounded and overload is reported explicitly
- Good, because wide traversals perform set-based worker reads and cannot create
  hundreds of simultaneous RPCs from one frontier
- Good, because expected failures reconstruct as typed, codeable errors on the
  host
- Good, because a worker crash is recoverable via close/open without corrupting
  the store
- Neutral, because cross-thread structured RPC adds serialization overhead
- Neutral, because large logical batches are physically chunked and executed
  sequentially inside the worker
- Bad, because a single worker is a throughput bottleneck for CPU-bound commits
- Bad, because worker lifecycle (spawn, fault, recovery) adds operational
  complexity beyond a plain synchronous store

### Confirmation

This decision is confirmed when:

- all SQLite native calls occur in the worker thread; the host performs no native
  SQLite work
- open/close/recreate are serialized and race-free under concurrent access
- bulk sessions stage in bounded chunks and commit one atomic generation
- pending operations beyond `maxPendingOperations` reject with
  `StoreOverloadError`
- traversal batches preserve ordering, deduplication, and all six symbol relation
  types across both in-memory and SQLite stores
- wide overlapping multi-file upstream and downstream impact completes with
  `maxPendingOperations: 32` and matches in-memory results
- worker-side session and configuration failures reconstruct as the same typed
  errors on the host
- `SqliteRuntimeDescriptor.modulePath` reaches the worker during `open()` and
  drives the worker-side module load
- `createSqliteGraphStoreFactory` plumbs `runtime` and `maxPendingOperations`
  and rejects invalid configuration

## Pros and Cons of the Options

### Run SQLite directly on the main thread

- Good, because it requires no worker plumbing
- Bad, because native writes block the host thread
- Bad, because interactive workflows stall during indexing

### Replace SQLite with an async-native driver library

- Good, because it would avoid the worker boundary
- Bad, because it replaces a proven driver and its migration path
- Bad, because async-native drivers still expose reentrancy and locking
  complexity

### Use a worker pool of several SQLite workers

- Good, because CPU-bound commits could run in parallel
- Bad, because multiple writers require locking and cross-worker coordination
- Bad, because transactional generation commits must stay ordered and atomic

### Spawn one worker per SQLite operation

- Good, because each operation is isolated
- Bad, because worker spawn cost dominates short operations
- Bad, because session state cannot persist across operations

### Run one dedicated worker thread for the entire SQLite store

- Good, because the host stays responsive and the protocol is simple
- Good, because sessions and generations stay in one worker
- Bad, because the single worker serializes CPU-bound commits

### Keep per-symbol traversal reads and only raise the queue limit

- Good, because it would require only a configuration change
- Bad, because a larger queue only postpones overload while retaining hundreds
  of structured-clone messages and queued promises
- Bad, because the single worker executes operations serially, so extra
  simultaneous requests do not increase SQLite throughput
- Bad, because safe capacity would depend on graph width and the number of input
  files rather than a fixed execution budget

## More Information

### Spec

- [`code-graph:sqlite-graph-store`](../../specs/code-graph/sqlite-graph-store/spec.md)
- [`code-graph:composition`](../../specs/code-graph/composition/spec.md)
- [`code-graph:graph-store`](../../specs/code-graph/graph-store/spec.md)
- [`code-graph:traversal`](../../specs/code-graph/traversal/spec.md)
