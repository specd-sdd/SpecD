# Proposal: nonblocking-sqlite-graph-store

## Motivation

`SQLiteGraphStore` exposes the asynchronous `GraphStore` contract, but its current SQLite implementation is backed by `better-sqlite3`, whose database operations execute synchronously on the Node.js thread that owns the store.

As a result, methods such as graph searches, lookups, mutations, bulk commits, FTS rebuilds, schema initialization, and maintenance operations may block the host event loop even though callers interact with them through `Promise`-returning APIs.

This is increasingly problematic as SpecD evolves beyond short-lived CLI execution and is consumed by long-lived or concurrent hosts such as:

- the future HTTP API
- MCP servers
- SDK consumers
- Electron
- Studio/server integrations

A long-running SQLite operation must not prevent the host from accepting unrelated requests, processing timers, serving other non-database work, or progressing unrelated asynchronous operations.

The existing `GraphStore` asynchronous contract already provides the correct abstraction boundary. The problem is therefore not the public graph-store API, but the execution context in which synchronous SQLite work runs.

The built-in SQLite backend should remain based on `better-sqlite3`, while its synchronous database work is moved away from the host event-loop thread.

---

## Goals

This change SHALL:

- prevent synchronous SQLite operations from blocking the host event loop
- retain `better-sqlite3` as the built-in SQLite driver
- preserve the existing asynchronous `GraphStore` contract
- preserve existing SQLite persistence and query semantics
- preserve bulk-index transaction atomicity
- preserve explicit `open()` / `close()` lifecycle semantics
- support concurrent callers without requiring concurrent SQLite execution
- provide bounded backpressure for long-lived hosts
- preserve runtime-specific SQLite bindings
- provide a clean future merge path for the Electron SQLite integration currently developed on `feat/user-interface`

The resulting behavior should allow an expensive SQLite query, FTS operation, bulk index commit, or maintenance operation to consume significant wall-clock time without monopolizing the host event loop.

---

## Non-goals

This change SHALL NOT attempt to:

- make SQLite itself fully concurrent
- execute multiple writes against the same database in parallel
- introduce a SQLite worker pool
- create one worker per request
- replace SQLite with another database
- replace `better-sqlite3` solely to obtain an asynchronous API
- introduce PostgreSQL or another external database dependency
- change the `GraphStore` public abstraction
- expose worker concepts through application APIs
- change HTTP, MCP, CLI, SDK, or Studio APIs
- change graph query semantics
- change FTS ranking semantics
- change persisted graph identities or relations
- change the SQLite schema solely because of this execution change
- implement Electron-specific code that does not exist on `main`

---

## Current behavior

`@specd/code-graph` currently uses `better-sqlite3` as its built-in SQLite implementation.

`SQLiteGraphStore` owns the SQLite connection and performs synchronous operations such as:

```ts
db.prepare(...).get(...)
db.prepare(...).all(...)
db.prepare(...).run(...)
db.exec(...)
db.pragma(...)
db.transaction(...)
```

inside methods that satisfy the asynchronous `GraphStore` interface.

For example, a method may have the shape:

```ts
async searchSymbols(...) {
  return db.prepare(...).all(...)
}
```

The `async` declaration changes the caller-facing contract but does not move the SQLite operation away from the current JavaScript thread.

Therefore:

```text
HTTP / MCP / Electron / SDK host
              |
              v
       SQLiteGraphStore
              |
              v
       better-sqlite3
              |
        synchronous work
              |
              v
       host event loop blocked
```

The problem is particularly significant during bulk indexing.

`beginBulkIndexSession()` currently stages graph data and performs substantial persistence work during `commit()`, including operations such as:

- cleanup
- file persistence
- document persistence
- symbol persistence
- spec persistence
- reference-fact replacement
- observation replacement
- relation persistence
- metadata updates
- FTS rebuilding

These operations execute as part of a synchronous SQLite transaction.

A large index commit can therefore monopolize the host thread for a meaningful amount of time.

This is undesirable for the future HTTP API and other long-lived hosts.

---

# Proposed architecture

The SQLite implementation SHALL execute its synchronous database work inside one persistent Node.js Worker Thread owned by each open `SQLiteGraphStore`.

Conceptually:

```text
                         HOST THREAD

                    CodeGraphProvider
                           |
                           v
                       GraphStore
                           |
                           v
                    SQLiteGraphStore
                           |
                           | async request / response
                           v
                  SQLiteWorkerClient
                           |
                    worker_threads
                           |
================ execution boundary ================
                           |
                           v
                      sqlite-worker
                           |
                           v
                  SQLiteGraphDatabase
                           |
                           v
                    better-sqlite3
                           |
                           v
                  code-graph.sqlite
```

The exact internal class names are not mandatory, but the responsibilities SHALL remain separated.

### SQLiteGraphStore

Responsible for:

- implementing `GraphStore`
- public store lifecycle
- translating GraphStore operations into worker requests
- correlating requests and responses
- translating worker errors
- forwarding progress events
- enforcing pending-operation limits
- handling worker failure

### SQLiteWorkerClient

Responsible for:

- Worker Thread lifecycle
- request correlation
- pending Promise tracking
- FIFO dispatch semantics
- progress messages
- errors
- shutdown
- worker termination detection

### SQLite worker

Responsible for:

- loading the configured SQLite runtime
- owning the `better-sqlite3` connection
- owning prepared statements
- executing SQL
- executing complete transactions
- SQLite-specific filesystem lifecycle where appropriate
- schema initialization
- FTS maintenance
- returning serializable results

### SQLiteGraphDatabase

The existing SQL-heavy behavior currently contained inside `SQLiteGraphStore` SHOULD be separated from the host-facing adapter so it can execute entirely inside the worker.

It remains synchronous internally.

For example:

```ts
class SQLiteGraphDatabase {
  getFile(path: string) {
    return this.db
      .prepare(GET_FILE_SQL)
      .get(path)
  }

  searchSymbols(query: SymbolQuery) {
    return this.db
      .prepare(...)
      .all(...)
  }
}
```

This is intentional.

The requirement is not that `better-sqlite3` become asynchronous.

The requirement is that synchronous SQLite execution no longer occur on the host event-loop thread.

---

# Worker lifecycle

There SHALL be one persistent SQLite worker per open `SQLiteGraphStore`.

Workers SHALL NOT be created per operation.

`SQLiteGraphStore.open()` remains the asynchronous readiness boundary.

Opening a store SHALL conceptually perform:

1. create the worker
2. establish worker communication
3. provide the serializable SQLite runtime configuration
4. load the SQLite runtime inside the worker
5. create required storage directories
6. open the database
7. configure SQLite
8. initialize or validate the schema
9. prepare backend state
10. report readiness to the host
11. resolve `open()`

The store SHALL NOT be considered open until worker-side initialization succeeds.

`SQLiteGraphStore.close()` SHALL:

1. stop accepting new operations
2. deterministically settle or reject queued operations according to shutdown semantics
3. request worker-side database closure
4. close the SQLite connection
5. clear prepared statements and worker-owned state
6. terminate the worker
7. reject any unresolved requests if termination occurs unexpectedly
8. clear host-side request tracking

`close()` SHALL remain idempotent.

Unexpected worker termination SHALL place the store in a failed/closed state.

The store SHALL NOT silently create a replacement worker and continue operating against the database unless a future change explicitly defines recovery semantics.

---

# SQLite runtime binding

The worker SHALL load `better-sqlite3` inside the worker execution context.

The host SHALL NOT:

- instantiate a `better-sqlite3` database and transfer it
- transfer prepared statements
- transfer native SQLite objects
- transfer function-valued SQLite loaders through `postMessage`

Worker communication uses structured-clone-compatible data.

The current runtime-binding mechanism therefore needs to evolve so that the worker receives serializable information describing how the SQLite runtime should be loaded.

The preferred model is conceptually:

```ts
export interface SqliteRuntimeDescriptor {
  readonly modulePath?: string
}
```

The exact public type/name may be refined during implementation, but the semantic requirement is fixed:

> SQLite runtime configuration crossing the worker boundary must be serializable.

## Default Node runtime

The normal built-in SQLite factory requires no explicit runtime configuration:

```ts
createSqliteGraphStoreFactory()
```

The worker then loads the normal `better-sqlite3` dependency.

Conceptually:

```text
SQLite worker
     |
     v
better-sqlite3
from @specd/code-graph runtime
```

## Runtime-specific module

A runtime-specific integration SHALL be able to provide a serializable module location:

```ts
createSqliteGraphStoreFactory({
  runtime: {
    modulePath: someResolvedBetterSqlite3Entry,
  },
})
```

The worker loads that module inside its own execution context.

The design SHALL NOT hard-code the assumption that the standard package-local `better-sqlite3` module is the only possible SQLite runtime.

---

# Compatibility with feat/user-interface

This change targets `main` only.

`feat/user-interface` is not an implementation dependency.

Files or packages that exist only on `feat/user-interface` MUST NOT be added, copied, or modified as part of this change merely to support that branch.

However, the design MUST preserve a clean merge path for the active Electron-specific SQLite integration currently developed on `feat/user-interface`.

That branch contains:

```text
packages/code-graph-sqlite-electron
```

which provides an Electron-compatible vendored/rebuilt `better-sqlite3` runtime through `createSqliteGraphStoreFactory(...)`.

Its current implementation injects a function-based runtime loader.

That exact mechanism cannot cross a Worker Thread boundary because functions are not structured-cloneable.

The new runtime-binding mechanism on `main` SHALL therefore allow that package, after the branches are merged, to make a localized adaptation from a function-based loader to serializable runtime information.

Conceptually, the future adaptation should be possible as:

```ts
createSqliteGraphStoreFactory({
  runtime: {
    modulePath: vendoredSqliteEntry,
  },
})
```

rather than requiring an Electron-specific GraphStore implementation.

After this change lands on `main`, merging `feat/user-interface` SHOULD NOT require:

- duplicating the SQLite worker
- duplicating the worker protocol
- implementing another `SQLiteGraphStore`
- moving SQLite execution back to Electron's main thread
- changing `GraphStore`
- changing `CodeGraphProvider`
- changing application use cases
- introducing Electron-specific concepts into `@specd/code-graph`

The Electron-specific package should remain responsible only for resolving/providing its runtime-specific SQLite binding.

`packages/code-graph-electron` on `feat/user-interface` is legacy and is not a compatibility target for this change.

---

# Worker implementation

The built-in implementation SHALL use:

```ts
node: worker_threads
```

The initial implementation SHALL NOT introduce a generic worker/execution framework for SpecD.

The worker abstraction should remain specific to the SQLite infrastructure.

Do not introduce abstractions such as:

```text
GenericWorkerPool
ExecutionScheduler
TaskRuntime
ParallelExecutionManager
```

unless an independently existing requirement justifies them.

The SQLite-specific infrastructure may use concepts such as:

```text
SQLiteWorkerClient
SQLiteWorkerRequest
SQLiteWorkerResponse
SQLiteRuntimeDescriptor
```

because these correspond directly to the problem being solved.

---

# Worker protocol

Communication SHALL use an explicit request/response protocol.

Conceptually:

```ts
interface SQLiteWorkerRequest {
  id: number
  operation: SQLiteWorkerOperation
  payload: unknown
}
```

Responses:

```ts
interface SQLiteWorkerSuccess {
  id: number
  type: 'result'
  result: unknown
}
```

Errors:

```ts
interface SQLiteWorkerFailure {
  id: number
  type: 'error'
  error: SerializedError
}
```

Progress:

```ts
interface SQLiteWorkerProgress {
  id: number
  type: 'progress'
  stage: string
}
```

The exact TypeScript representation SHOULD use discriminated unions rather than unconstrained string operations where practical.

Every request SHALL have a correlation identifier.

Multiple callers MAY have unresolved requests concurrently even though the worker executes SQLite operations serially.

---

# Serialization boundary

The worker protocol SHALL contain serializable DTOs.

It SHALL NOT depend on structured clone preserving:

- class prototypes
- native objects
- prepared statements
- database connections
- functions
- callbacks

If graph-domain objects contain behavior or prototypes, the worker boundary SHALL explicitly serialize/hydrate them as appropriate.

The protocol SHOULD prefer primitive values, plain objects, arrays, and explicitly defined DTO structures.

The worker boundary is an infrastructure boundary, not a domain-model transport mechanism.

---

# Execution ordering

The initial implementation SHALL use one SQLite connection owned by one worker.

Database operations SHALL execute serially.

The initial ordering policy SHALL be FIFO.

For example:

```text
request A
request B
request C
request D
    |
    v
+----------------+
| pending queue  |
+----------------+
    |
    v
SQLite worker
    |
    +-- A
    +-- B
    +-- C
    +-- D
```

Concurrent GraphStore callers therefore receive asynchronous behavior without implying parallel SQLite execution.

This change targets host responsiveness, not database parallelism.

---

# Backpressure

Long-lived hosts such as HTTP or MCP can generate operations faster than one SQLite connection can execute them.

The implementation SHALL therefore have a finite pending-operation limit.

The default SHOULD initially be:

```text
256 pending operations
```

The exact value MAY be adjusted during implementation/testing if evidence suggests a better default.

The limit SHOULD be configurable through infrastructure/composition without leaking into `GraphStore`.

When the limit is exceeded, the operation SHALL fail explicitly with an infrastructure-level overload error.

The SQLite layer SHALL NOT expose HTTP-specific semantics such as status code `503`.

A future HTTP adapter may translate the infrastructure overload error into the appropriate HTTP response.

The implementation SHALL NOT permit an unbounded number of pending requests.

---

# Transaction semantics

Existing atomic operations SHALL remain atomic.

Transactions SHALL execute entirely inside the SQLite worker.

The host SHALL NOT implement a transaction by sending multiple independent RPC requests and assuming they cannot be interleaved.

For example, this is forbidden:

```text
host

RPC: BEGIN
RPC: delete...
RPC: insert...
RPC: insert...
RPC: COMMIT
```

Instead:

```text
host

RPC: commitBulkIndex(payload)
             |
             v
worker

db.transaction(() => {
  delete...
  insert...
  insert...
  rebuild...
})()
```

Operations currently implemented atomically SHALL remain one logical worker operation where necessary.

---

# Bulk indexing

The existing bulk-index atomicity model SHALL remain intact.

For the initial implementation, `beginBulkIndexSession()` MAY continue staging data in host memory.

For example:

```text
HOST

writeFiles()       -> stage
writeDocuments()   -> stage
writeSymbols()     -> stage
writeSpecs()       -> stage
writeRelations()   -> stage
writeObservations()-> stage

commit()
    |
    +----------------------------+
                                 |
                                 v
                           SQLITE WORKER

                           BEGIN
                           cleanup
                           files
                           documents
                           symbols
                           specs
                           reference facts
                           observations
                           relations
                           metadata
                           FTS rebuild
                           COMMIT
                                 |
    <----------------------------+
```

The complete commit payload is transferred to the worker as one logical operation.

Streaming chunks into worker-owned staging memory is explicitly outside the initial scope.

It may be considered separately if profiling later demonstrates that host-side staging or structured cloning becomes a meaningful bottleneck.

---

# Progress reporting

Existing bulk-index progress behavior SHALL be preserved.

Function callbacks cannot cross the worker boundary.

Therefore an existing host-side callback such as:

```ts
metadata.onProgress
```

SHALL remain on the host.

The worker emits serializable progress events:

```text
cleanup
files
documents
symbols
specs
reference-facts
observations
relations
search-indexes
```

The host-side `SQLiteGraphStore` / worker client receives those messages and invokes the original callback.

Conceptually:

```text
worker
  |
  | { type: "progress", stage: "symbols" }
  v
SQLiteWorkerClient
  |
  v
metadata.onProgress("symbols")
```

Worker protocol details SHALL NOT leak into `GraphStore`.

---

# Error handling

Errors produced during worker-side SQLite execution SHALL cross the worker boundary in serialized form.

Where applicable, error reconstruction SHOULD preserve:

- SpecD error category/type
- message
- SQLite error code
- relevant operation context
- cause information where safely serializable

Infrastructure errors caused by:

- worker startup failure
- runtime loading failure
- worker crash
- malformed worker response
- operation queue overflow
- database opening failure

SHALL be distinguishable from ordinary graph query results.

Unexpected worker termination SHALL reject every outstanding Promise associated with that worker.

No request SHALL remain unresolved indefinitely because its worker exited.

---

# Prepared statements

Prepared statements SHALL remain local to the worker.

The existing prepared-statement cache SHOULD move together with the database implementation.

Neither prepared statements nor database handles SHALL cross the worker boundary.

Conceptually:

```text
sqlite-worker

Database
   |
   +-- StatementCache
   |      |
   |      +-- getFile
   |      +-- getSymbol
   |      +-- searchSymbols
   |      ...
   |
   +-- transactions
```

---

# Filesystem operations

Moving SQLite calls to a worker while retaining potentially expensive synchronous SQLite-owned filesystem operations on the host would undermine the goal of this change.

SQLite/backend-owned filesystem work SHOULD therefore execute in the worker where practical.

This includes operations directly associated with:

- database creation
- database recreation
- SQLite artifacts
- WAL/SHM lifecycle where explicitly managed
- backend cleanup

Host-side filesystem operations that remain outside the worker SHALL use asynchronous filesystem APIs when they may block meaningfully.

New synchronous filesystem operations SHALL NOT be introduced on the host as part of this change.

The desired property is:

> SQLiteGraphStore operations do not perform potentially expensive synchronous persistence work on the host event-loop thread.

---

# Worker packaging

The worker SHALL be an explicit build artifact.

The implementation SHALL NOT rely on accidental tsup output structure.

For example, the build may explicitly define:

```text
src/public.ts
    -> dist/public.js

src/index.ts
    -> dist/index.js

src/infrastructure/sqlite/sqlite-worker.ts
    -> dist/sqlite-worker.js
```

The exact build configuration may differ, but the worker output path SHALL be deterministic.

Worker resolution SHALL be relative to the installed/built module, not to:

```ts
process.cwd()
```

The implementation SHOULD use an `import.meta.url`-based resolution strategy or equivalent package-relative mechanism.

The change SHALL include integration coverage that validates the worker using the actual built package layout.

A source-only test is insufficient.

At minimum, tests SHOULD verify:

```text
build @specd/code-graph
        |
        v
load built package
        |
        v
create SQLite provider
        |
        v
open()
        |
        v
worker entry resolves
        |
        v
better-sqlite3 loads
        |
        v
basic operation succeeds
        |
        v
close()
```

This is particularly important because bundling may flatten or relocate worker entrypoints.

---

# Host responsiveness requirement

The implementation SHALL include a behavioral test proving that SQLite work no longer monopolizes the host event loop.

The test SHOULD NOT merely assert that a method returns a Promise.

It should demonstrate that unrelated host event-loop work can progress while worker-side SQLite work is active.

Conceptually:

```text
start expensive SQLite operation

schedule host timer / event-loop task

SQLite still executing
        |
        +---- host timer executes
        |
SQLite completes
```

The test SHOULD avoid relying solely on timing-sensitive microbenchmarks where possible.

The acceptance property is:

> SQLite execution occurs outside the host event-loop thread.

This requirement is particularly important for the future HTTP API.

---

# HTTP API considerations

The future HTTP API is a primary motivation for this change but is not itself modified by this change.

After this change, an HTTP handler should be able to perform:

```ts
const result = await graphStore.searchSymbols(query)
```

without the corresponding synchronous SQLite query running on the HTTP server's event-loop thread.

For example:

```text
HTTP SERVER
   |
   +---- request A -> graph query ----------+
   |                                        |
   +---- request B -> unrelated work        |
   |                                        |
   +---- request C -> another graph query   |
                                            |
                                            v
                                      SQLite queue
                                            |
                                            v
                                      SQLite worker
```

The worker may process SQLite operations sequentially.

The HTTP server remains able to accept/process unrelated event-loop work while SQLite is busy.

This change SHALL NOT add HTTP-specific concepts to `code-graph`.

---

# SQLite concurrency

This proposal intentionally distinguishes:

```text
non-blocking host execution
```

from:

```text
parallel SQLite execution
```

Only the first is required.

The initial implementation SHALL use:

```text
1 SQLiteGraphStore
        |
1 SQLite worker
        |
1 SQLite connection
        |
serialized operations
```

A future change may investigate:

- multiple read connections
- WAL-based read concurrency
- read workers
- query prioritization
- separate indexing/read execution

but only if profiling demonstrates a concrete need.

These optimizations SHALL NOT be included in this change.

---

# Runtime failure and recovery

The initial implementation SHALL prefer deterministic failure over transparent worker recreation.

If the worker exits unexpectedly:

```text
SQLite worker
     X
     |
SQLiteGraphStore -> failed
```

all pending operations SHALL reject.

New operations SHALL reject until the store is explicitly closed/reopened according to the existing lifecycle contract.

Automatic worker recreation is outside the scope of this change because recovery during:

- an active transaction
- bulk indexing
- schema migration
- FTS rebuilding
- database recreation

could otherwise introduce ambiguous state.

---

# Specs affected

## Modified: `code-graph:sqlite-graph-store`

Add requirements covering:

- SQLite operations execute outside the host event-loop thread
- one persistent worker per open SQLite store
- worker owns the SQLite connection
- worker owns prepared statements
- worker owns SQLite transactions
- serializable worker protocol
- serializable runtime binding
- bounded pending-operation queue
- deterministic worker lifecycle
- worker failure propagation
- bulk-index atomicity across the worker boundary
- progress-event forwarding
- non-blocking backend-owned filesystem behavior
- existing persistence/query semantics remain unchanged

No dependency changes are expected solely from this change.

## Modified: `code-graph:composition`

Add or refine requirements covering:

- provider/factory construction remains synchronous
- `open()` remains the asynchronous native-runtime readiness boundary
- SQLite runtime binding can be resolved inside a worker execution context
- runtime-specific SQLite configuration crossing the worker boundary is serializable
- the built-in Node runtime requires no custom configuration
- runtime-specific consumers can supply an alternate SQLite module without replacing `GraphStore`
- long-lived hosts can reuse one opened provider without synchronous SQLite work blocking their host event loop

---

# Expected implementation impact

Primary changes on `main` are expected under:

```text
packages/code-graph/src/infrastructure/sqlite/
```

including the current SQLite graph-store implementation and new internal worker/protocol components.

Likely affected areas include:

```text
packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts

packages/code-graph/src/infrastructure/sqlite/
  sqlite-worker.ts
  sqlite-worker-client.ts
  sqlite-worker-protocol.ts
  sqlite-graph-database.ts
```

Exact filenames are illustrative rather than mandatory.

Composition may require changes around:

```text
create-sqlite-graph-store-factory.ts
```

Build configuration will require an explicit worker entrypoint.

Tests will require updates/additions for:

- SQLite behavior
- lifecycle
- worker startup
- worker shutdown
- errors
- transaction atomicity
- bulk indexing
- progress events
- queue/backpressure
- package build/runtime resolution
- host event-loop responsiveness

---

# Persisted data compatibility

This change SHALL NOT alter the persisted SQLite schema solely to support worker execution.

Existing graph databases SHALL continue to open normally.

No graph schema-version bump SHALL be introduced unless implementation unexpectedly requires a persisted format change, in which case that change must be separately justified.

Worker execution is an infrastructure execution change, not a storage-format change.

Existing behavior SHALL remain compatible for:

- graph files
- documents
- symbols
- specs
- relations
- observations
- reference facts
- FTS indexes
- metadata
- storage epoch semantics

---

# Locked decisions

The following decisions are intentionally fixed by this proposal and SHALL NOT be reopened during implementation without amending the change.

### 1. Keep better-sqlite3

The built-in SQLite backend continues using `better-sqlite3`.

Do not migrate to `node-sqlite3`, `sqlite`, or another driver merely to obtain asynchronous syntax.

### 2. Use Worker Threads

The built-in non-blocking implementation uses Node.js `worker_threads`.

SQLite synchronous work does not run on the host event-loop thread.

### 3. One persistent worker per open store

Do not create workers per operation.

Do not introduce a worker pool in this change.

### 4. One SQLite connection per worker

Operations execute serially against the worker-owned connection.

Parallel SQLite execution is not a requirement.

### 5. FIFO operation ordering

The initial queue processes database operations in submission order.

Scheduling/prioritization is outside scope.

### 6. Bounded queue

Pending operations are finite.

The initial target default is 256 pending operations unless implementation/testing provides evidence for a different value.

### 7. Complete transactions execute worker-side

Transaction boundaries never span multiple independent host/worker RPC calls.

### 8. Bulk staging may remain host-side initially

The complete bulk commit moves to the worker as one logical atomic operation.

Worker-side streaming/staging is deferred.

### 9. Runtime binding must be serializable

Function-valued loaders cannot be the mechanism required by worker execution.

The runtime binding evolves toward a serializable descriptor or equivalent.

### 10. Preserve future Electron merge compatibility

The change targets `main`.

No code from `feat/user-interface` is implemented as part of this change.

However, the runtime-binding seam must allow the future `packages/code-graph-sqlite-electron` integration to provide its vendored Electron-compatible `better-sqlite3` module without duplicating the SQLite backend.

### 11. `packages/code-graph-electron` is not a compatibility target

That package is legacy and SHALL NOT influence this design.

### 12. No Electron utility process in this change

Do not introduce an Electron `utilityProcess` implementation.

The future Electron integration should first attempt to reuse the same worker-based SQLite infrastructure with its runtime-specific `better-sqlite3` binding.

A different Electron execution mechanism requires evidence and a separate change.

### 13. Worker is an explicit package artifact

Do not depend on accidental bundler paths or `process.cwd()`.

The built package must be tested.

### 14. No silent worker recovery

Unexpected worker death fails the store and outstanding operations.

Automatic restart/recovery is outside scope.

### 15. No host-side synchronous persistence work

Potentially expensive SQLite/backend-owned persistence work must not simply move from synchronous SQLite calls to synchronous filesystem calls on the host.

---

# Rejected alternatives

## Promise-wrapping better-sqlite3

Rejected.

```ts
async function query() {
  return db.prepare(...).all(...)
}
```

still executes SQLite synchronously on the current thread.

Likewise:

```ts
Promise.resolve(db.prepare(...).all(...))
```

does not solve the problem.

---

## Replace better-sqlite3 with an async driver

Rejected for this change.

The goal can be achieved without replacing the existing SQLite implementation and transaction model.

---

## Worker per operation

Rejected.

Worker startup, native module loading, connection creation, lifecycle complexity, and resource consumption would make this substantially less efficient.

---

## Worker pool

Rejected for the initial implementation.

The requirement is host responsiveness, not maximum query throughput.

---

## Multiple SQLite connections

Rejected for the initial implementation.

Read/write concurrency and WAL-based parallelism may be evaluated later using measurements.

---

## Generic SpecD execution framework

Rejected.

This change solves an SQLite-specific infrastructure problem.

A general execution abstraction would add unnecessary architectural scope.

---

## Electron-specific implementation on main

Rejected.

The change targets `main`, where the active Electron SQLite package from `feat/user-interface` does not yet exist.

Compatibility is designed into the runtime-binding seam instead.

---

## Electron utilityProcess

Rejected for the initial design.

There is currently no demonstrated requirement that justifies introducing a separate Electron execution protocol.

The future merged Electron SQLite integration should first reuse the common worker infrastructure.

---

# Acceptance criteria

The change is complete when all of the following are true:

- SQLite database operations no longer execute on the host event-loop thread.
- `better-sqlite3` remains the built-in SQLite driver.
- Existing `GraphStore` consumers require no API changes.
- `CodeGraphProvider` requires no worker-specific knowledge.
- `SQLiteGraphStore.open()` initializes the worker and resolves only when SQLite is ready.
- `SQLiteGraphStore.close()` closes SQLite and terminates the worker cleanly.
- Unexpected worker termination rejects outstanding operations.
- Prepared statements exist only inside the worker.
- Existing graph queries return equivalent results.
- Existing graph mutations preserve their semantics.
- Existing transactional operations remain atomic.
- Bulk indexing remains atomic.
- Bulk indexing progress callbacks continue working.
- FTS behavior remains equivalent.
- Existing SQLite databases remain compatible.
- The operation queue has bounded backpressure.
- Queue overflow produces an explicit infrastructure error.
- Worker resolution works from the actual built package.
- Tests demonstrate that unrelated host event-loop work progresses while SQLite is executing.
- No SQLite-specific worker concepts leak into `GraphStore`.
- Runtime-specific SQLite module binding remains possible through serializable configuration.
- The design leaves a localized migration path for `packages/code-graph-sqlite-electron` when `feat/user-interface` is later merged.
- No implementation dependency on `feat/user-interface` is introduced.
- `packages/code-graph-electron` is ignored as legacy.
- No SQLite schema-version bump occurs solely because of worker execution.

---

# Verification scenarios

The implementation SHOULD include coverage for at least the following scenarios.

### Normal lifecycle

```text
create provider
open
query
mutate
query
close
```

All operations succeed and the worker terminates cleanly.

### Concurrent callers

Several GraphStore operations are started without awaiting each previous operation.

All resolve correctly and request responses are correlated to the correct caller.

### Event-loop responsiveness

A sufficiently expensive SQLite operation runs while an unrelated host timer/event-loop task is scheduled.

The host task executes before the SQLite operation completes.

### Bulk index

A representative bulk index executes in the worker.

The transaction remains atomic and progress events reach the host callback.

### Bulk index failure

An intentional failure during commit rolls back the complete transaction.

No partially committed graph state remains.

### Worker crash

The worker is intentionally terminated with outstanding requests.

Every outstanding request rejects.

Subsequent operations fail deterministically.

### Queue overflow

The pending-operation limit is reached.

Additional requests fail with the expected overload error instead of accumulating without bound.

### Close with pending operations

The defined shutdown policy is respected and no Promise remains unresolved.

### Existing database

A database created by the pre-worker implementation opens and behaves normally.

### Built package

The actual compiled/package layout can locate and start `sqlite-worker.js`.

### Runtime-specific binding

A test runtime descriptor points to an alternate compatible SQLite module location and verifies that loading occurs inside the worker rather than on the host.

This provides coverage for the extension seam that the future Electron integration will use.

---

# Summary

SpecD's SQLite GraphStore already exposes an asynchronous application-facing API, but the built-in `better-sqlite3` implementation currently performs synchronous database work on the host thread.

This change preserves the existing architecture and SQLite implementation while moving database execution behind a persistent Worker Thread boundary.

The resulting architecture is:

```text
HTTP / MCP / CLI / SDK / Electron host
                    |
                    v
             CodeGraphProvider
                    |
                    v
                GraphStore
                    |
                    v
             SQLiteGraphStore
                    |
              async protocol
                    |
                    v
              SQLite Worker
                    |
                    v
              better-sqlite3
                    |
                    v
             code-graph.sqlite
```

The SQLite worker owns the connection, statements, transactions, FTS work, and backend persistence execution.

The host receives a genuinely non-blocking asynchronous storage boundary while SQLite itself remains simple and serial.

The change is implemented entirely against `main`, while its runtime-binding design deliberately preserves a clean future merge path for the Electron-specific SQLite runtime currently developed on `feat/user-interface`.
