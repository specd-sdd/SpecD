# Proposal: nonblocking-sqlite-graph-store

## Motivation

`SQLiteGraphStore` exposes an asynchronous API while `better-sqlite3` executes on the owning JavaScript thread, so long graph operations block long-lived hosts. The worker isolates that synchronous work, but real-world load on the actual SpecD graph (≈37k symbols, 1,084 files, 206 MB DB) proves that callers cross the worker boundary with unbounded RPC fan-out. `graph impact` on a single large file and `graph hotspots --min-risk HIGH` both overflow the 256-operation queue (`STORE_OVERLOAD`) even though domain traversal is already concurrency-limited.

## Current behaviour

SQLite work executes synchronously on the host thread. After the worker change, the host still treats every `GraphStore`/`CodeGraphProvider` call as cheap: presentation code resolves display paths with one `getFile`/`getDocument` RPC per affected symbol, and `computeHotspots.collectHierarchySignals` issues three hierarchy RPCs per symbol. These callers turn data-dependent collections into thousands of concurrent RPCs, saturating the bounded serial worker queue.

## Proposed solution

Keep `better-sqlite3` on one persistent worker with FIFO serial execution and `maxPendingOperations = 256` as a hard safety fuse. Treat the worker boundary as an RPC boundary and require callers to prefer, in order: pure local derivation, batch `GraphStore` operations, memoization of already-loaded data, bounded concurrency, and unrestricted `Promise.all` only for intrinsically small collections. Concretely:

- Make CLI impact display-path resolution a pure projection of the project/workspace configuration — zero graph reads.
- Rewrite hotspot hierarchy signals to use the existing batch relation APIs instead of three RPCs per symbol.
- Add symmetrical exact batch node lookups (`getFilesByPaths`, `getDocumentsByPaths`, `getSpecsByIds`) to `GraphStore` and the provider.
- Audit and classify every data-dependent `GraphStore`/provider fan-out as pure derivation, batch, memoization, bounded concurrency, or intentionally bounded `Promise.all`.
- Validate provider availability once per composite public operation instead of multiplying RPCs through per-call `assertAvailable`.
- Keep `StoreOverloadError` at 256 as defense in depth; never raise the limit or turn it into an unbounded wait queue.

## Specs affected

### New specs

None.

### Modified specs

- `code-graph:sqlite-graph-store`: require persistent worker-thread execution, bounded queue behaviour, and efficient chunked batch lookup implementation for worker-backed graph reads, including the new exact batch node APIs.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:composition`: preserve provider lifecycle, public/internal exports, and delegation while the default SQLite backend becomes worker-backed; add provider-level exact batch node operations and single availability validation per composite operation.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:graph-store`: add deterministic storage-neutral batch methods for symbol, file, document, and spec retrieval plus incoming/outgoing symbol relations, including empty-input behaviour, ordering, deduplication, and one logical worker operation semantics.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:traversal`: require breadth-first traversal, multi-file impact aggregation, and hotspot hierarchy signals to use batch reads and bounded fan-out without changing results, ordering, depth, or risk semantics.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-impact`: require pure display-path projection for result formatting with zero graph reads, and bounded presentation fan-out.
  - Depends on (added): `code-graph:composition`, `code-graph:graph-store`
  - Depends on (removed): none
- `cli:graph-hotspots`: require hotspot presentation to complete on wide graphs without overflowing the worker queue.
  - Depends on (added): `code-graph:composition`, `code-graph:graph-store`
  - Depends on (removed): none

## Impact

The change affects the `GraphStore` port and contract tests, the SQLite adapter, the SQLite worker protocol/database implementation, memoized read adapters and test doubles, upstream/downstream traversal, file-impact aggregation, hotspot computation, package barrels, build packaging, CLI impact/hotspots presentation, and worker lifecycle tests. Existing query results and public impact semantics remain compatible. The implementation assumes the canonical SQLite-only backend registry now present on `main` after Ladybug removal.

## Technical context

Real measurements against the actual graph established the failure modes: a 3,909-line file yields 598 affected symbols and the CLI fires ≈1,800 concurrent display-path RPCs; `computeHotspots.collectHierarchySignals` fires ≈111k RPCs (3 × 37k symbols). `analyzeFileImpact`/`analyzeFilesImpact` already use `mapWithConcurrency` with `IMPACT_CONCURRENCY = 4` and peak at 4 active RPCs; the failures are caller-side, not domain-side.

Agreed direction: `toGraphDisplayPath` becomes a pure function over `(projectRoot, workspace.codeRoot, canonicalPath)` — `core:src/index.ts` → `relative(projectRoot, packages/core/src/index.ts)` — with a per-render `Map` to avoid recomputation. Hotspot signals use `getIncomingSymbolRelations(candidateIds, [EXTENDS, IMPLEMENTS, OVERRIDES])` folded in memory. Exact batch node APIs mirror the existing `getSymbolsByIds` contract (arbitrary order in, deduplicate, first-requested order out, omit unknowns, one logical worker operation, chunked `IN` queries inside the worker). `assertAvailable` generation checks are validated once per composite facade call, not per inner loop. Raising the queue limit alone was rejected because it only postpones overload; silent unbounded waiting was rejected because it hides pathological callers.

## Open questions

None.
