# Proposal: nonblocking-sqlite-graph-store

## Motivation

`SQLiteGraphStore` exposes an asynchronous API while `better-sqlite3` executes on the owning JavaScript thread. Long graph operations can therefore block long-lived hosts, and moving those operations to a bounded worker queue exposes traversal fan-out that can overload the queue during ordinary CLI impact and hotspot analysis.

## Current behaviour

SQLite queries, mutations, schema work, full-text search, and bulk transactions execute synchronously on the host event-loop thread. The new worker isolates that synchronous work and rejects excess outstanding requests at a finite queue limit, but graph traversal currently multiplies unbounded concurrency across files, symbols, BFS levels, and relation types. A normal multi-file `graph impact` can consequently enqueue more than 256 operations and fail with `STORE_OVERLOAD` even though the worker processes SQLite operations serially.

## Proposed solution

Run all synchronous SQLite work inside one persistent worker per open store while preserving FIFO execution, atomic transactions, explicit lifecycle, runtime binding, and bounded backpressure. Extend the storage-neutral `GraphStore` read contract with deterministic batch symbol and relation lookups, implement those operations efficiently in SQLite with bounded SQL parameter chunks, and make traversal consume batches per BFS frontier instead of producing one RPC per symbol and relation type. Retain bounded concurrency as a secondary safeguard for remaining non-batch work and multi-file aggregation.

## Specs affected

### New specs

None.

### Modified specs

- `code-graph:sqlite-graph-store`: require persistent worker-thread execution, bounded queue behaviour, and efficient chunked batch lookup implementation for worker-backed graph reads.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:composition`: preserve provider lifecycle, public/internal exports, and delegation while the default SQLite backend becomes worker-backed.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:graph-store`: add deterministic storage-neutral batch methods for symbol retrieval and incoming/outgoing symbol relations, including empty-input behaviour.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:traversal`: require breadth-first traversal and multi-file impact aggregation to use batch reads and bounded fan-out without changing results, ordering, depth, or risk semantics.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

The change affects the `GraphStore` port and contract tests, the SQLite adapter, the SQLite worker protocol/database implementation, memoized read adapters and test doubles, upstream/downstream traversal, file-impact aggregation, package barrels, build packaging, and worker lifecycle tests. Existing query results and public impact semantics remain compatible; the port gains internal batch capabilities used by traversal. The implementation assumes the canonical SQLite-only backend registry now present on `main` after Ladybug removal.

## Technical context

The agreed architecture retains `better-sqlite3`, one persistent worker and one SQLite connection per open store, serial FIFO execution, a default maximum of 256 outstanding operations, worker-side transactions, and explicit failure recovery. Raising the queue limit alone was rejected because it only postpones overload and cannot improve throughput for a serial worker.

The observed fan-out is multiplicative: multi-file impact analyzes files concurrently, each file analyzes all symbols concurrently, and each BFS frontier queries every symbol concurrently across four incoming or outgoing relation types. The preferred correction is semantic batching at the `GraphStore` boundary so a frontier becomes a small number of backend operations. SQLite should use `IN (...)` queries split into deterministic chunks to respect parameter limits. Bounded concurrency remains defence in depth for file/symbol analysis and operations that cannot be batched. A regression test will use a deliberately small pending-operation limit and a wide graph to prove that impact analysis completes without `STORE_OVERLOAD` and preserves its result.

## Open questions

None.
