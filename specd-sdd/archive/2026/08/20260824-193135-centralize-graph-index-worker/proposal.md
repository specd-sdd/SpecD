# Proposal: centralize-graph-index-worker

## Motivation

Graph indexing requires both single-writer coordination and a process boundary that
contains native tree-sitter or SQLite failures. Those guarantees are currently
implemented inside the CLI, even though they are properties of graph indexing and are
needed by every present or future host that can trigger an index.

Centralizing the isolation runtime now avoids duplicating a subtle lock and process
lifecycle in MCP, API, IPC, or desktop hosts, and removes the need for non-CLI hosts to
discover and invoke the `specd` executable.

## Current behaviour

`specd graph index` currently performs two roles:

1. It acts as a delivery adapter: parses Commander options, resolves graph context,
   renders progress and results, and maps failures to CLI exit behaviour.
2. It implements graph-index infrastructure: acquires the shared index lock, respawns
   the complete CLI with `child_process.spawn`, selects child behaviour through
   environment variables, forwards `SIGINT` and `SIGTERM`, observes child termination,
   and releases the lock.

This design protects the parent CLI from native crashes, but has several limitations:

- process supervision is coupled to CLI arguments and CLI environment flags;
- another host must duplicate the same lifecycle or perform a host-to-CLI-to-worker
  double process hop;
- progress and results flow through inherited stdio rather than a reusable typed host
  protocol;
- the CLI imports `acquireGraphIndexLock` from `@specd/code-graph/internal` and declares
  `@specd/code-graph` directly, contrary to the required `cli -> sdk -> code-graph`
  dependency direction;
- the test-only `SPECD_GRAPH_INDEX_NO_WORKER` switch is a CLI-global execution mode
  instead of a narrow process-runtime test seam;
- the current graph-index spec describes lock and worker ownership as CLI-only, making
  reuse by other hosts explicitly out of scope.

The existing safety rationale remains valid. Graph storage is single-writer, indexing
publishes one logical generation, readers must not observe a mixed generation, and only
a child process—not a worker thread—contains a native segfault.

## Proposed solution

Create a reusable isolated graph-index worker capability in `@specd/code-graph` and
migrate `specd graph index` to consume it through `@specd/sdk`.

The code-graph capability will provide two coordinated pieces:

- a parent-side supervisor that acquires the graph index lock before starting work,
  forks the packaged child entrypoint, forwards signals, consumes typed IPC messages,
  classifies termination, and releases the lock exactly once on every terminal path;
- a packaged child entrypoint that loads a trusted task module supplied by the host,
  validates the task contract, executes it with JSON-serializable input, and reports
  progress, success, or failure through the graph-owned IPC protocol.

The injected task module is a programmatic host integration point, not a new CLI flag
and not a mechanism for executing arbitrary user-provided code. The CLI will supply a
packaged, version-affine task module that reconstructs the appropriate SDK host context
from explicit serializable bootstrap input and invokes `runIndexProjectGraph`.

`@specd/sdk` will continue to own the cross-package indexing orchestration and will
re-export the curated worker API and public protocol types from the code-graph public
surface. SDK will not implement `child_process` infrastructure and will stop exposing
raw index-lock primitives such as `acquireGraphIndexLock` or index-unlocked assertions.
The CLI will retain only delivery responsibilities: option validation, selection of its
packaged task, progress/result rendering, and mapping worker outcomes to the existing
CLI error and exit contract.

## Scope and behavioural boundaries

The downstream specs, verification scenarios, and design must preserve the following
agreed boundaries.

### Ownership

- `@specd/code-graph` owns the lock-aware supervisor, child entrypoint, task contract,
  IPC contract, signal forwarding, termination classification, and cleanup.
- `@specd/sdk` owns project indexing orchestration through `runIndexProjectGraph` and
  acts as the curated facade for delivery hosts, but neither exposes nor invokes the
  raw index lock.
- `@specd/cli` owns command syntax, context-mode selection, text/JSON/TOON presentation,
  and CLI error/exit mapping. It never acquires, releases, checks, or imports the raw
  index lock.
- The injected CLI task may compose SDK APIs but must not recreate the graph indexing
  pipeline or import code-graph infrastructure directly.

### Lock and lifecycle invariants

- The parent acquires the lock before forking, so a concurrent invocation fails before
  it creates a second child. This acquisition is an internal step of the code-graph
  supervisor, not a caller hook.
- The lock is derived from the same resolved graph storage root used by the task.
- The child is informed through a code-graph-owned internal mechanism that its parent
  owns the lock; CLI-specific worker-selection flags are not part of the public API.
- Raw acquisition, release, lock-path, and availability helpers remain private to
  code-graph internals. Hosts receive concurrency failures only through the high-level
  worker/provider contracts.
- Lock release is idempotent and occurs after success, task failure, fork startup
  failure, invalid protocol, abnormal exit, forwarded signal, or native child crash.
- A synchronous or asynchronous failure while creating or sending the initial IPC
  command is itself a bounded terminal path. The supervisor releases its lease and
  settles even when the child never subsequently emits `exit`; best-effort child
  termination and IPC teardown cannot leave the host promise pending.
- A valid terminal result is successful only when the child also completes its required
  resource cleanup and exits normally. In particular, `graph index --force` must return
  exit 0 rather than expose a post-result native crash; the correction must fix the
  resource lifecycle and must not use `process.exit()` as an escape hatch.
- The supervisor never calls `process.exit()`. It resolves with a typed result or
  rejects/returns a typed terminal failure that the host maps to its own delivery
  semantics.
- Readers keep their existing asymmetric behaviour: they do not acquire the lock and
  continue to fail fast while indexing is active.
- This change does not introduce queuing, automatic retry, lock waiting, PID-based
  stale-lock recovery, or automatic server-side indexing.

### Task and IPC boundaries

- The supervisor accepts a trusted task-module URL/path and JSON-serializable input.
- The child loads exactly that task module and invokes one documented asynchronous task
  entry contract. Exact exported symbol names belong in design, but the contract must
  accept the supplied payload, emit zero or more progress events, and produce one
  terminal result or error.
- IPC messages are tagged, runtime-validated, and distinguish progress, successful
  result, task-reported failure, protocol failure, and abnormal process termination.
- A run produces at most one terminal outcome. Late or duplicate terminal messages are
  treated as protocol violations and cannot cause duplicate cleanup.
- Normal progress and result data travel through IPC and remain presentation-neutral.
  The graph runtime does not render CLI text, JSON, or TOON.
- Fork startup errors, malformed messages, task failures, non-zero exits, and
  signal-based exits remain distinguishable so hosts can map them without parsing
  stderr strings.
- The task and worker entry are version-affine packaged modules. Resolution must work
  from published ESM `dist/` output, not only from TypeScript source paths in the
  monorepo.

### CLI compatibility

- The command signature and existing `--force`, `--exclude-path`, `--config`, `--path`,
  and `--format` behaviour remain unchanged.
- Text, JSON, and TOON success payloads preserve the current
  `RunIndexProjectGraphResult` fields, including progress, workspace breakdowns,
  coverage/error counts, and rebuild information.
- Per-file indexing errors remain successful index results; infrastructure, worker,
  lock, task, and protocol failures remain system failures.
- `--config` and bootstrap `--path` semantics remain explicit. Because in-memory kernel
  objects cannot cross a process boundary, the child reconstructs an equivalent SDK
  context from the parent's explicit serializable bootstrap descriptor; it does not
  claim to reuse the same object identity.
- `runIndexProjectGraph` remains the sole project-index orchestration invoked by the CLI
  task. Its provider lifecycle and result semantics are not reimplemented in CLI.
- Production indexing remains process-isolated. Tests use explicit injected process or
  task seams; a CLI-global no-worker mode is not part of the target public behaviour.

### Public surface and packaging

- The reusable host-facing worker factory/function and its contracts are exported from
  the curated `@specd/code-graph` public entrypoint.
- Bare index-lock functions are not exported from the curated `@specd/code-graph`
  entrypoint. Existing internal consumers use the code-graph internal entry only where
  composition cannot encapsulate the check.
- Concrete process adapters and the executable child implementation remain internal
  implementation details even though the child file is included in published output.
- `@specd/sdk` explicitly re-exports the curated high-level worker surface for delivery
  hosts and removes its existing raw lock and lock-assertion re-exports.
- SDK's published entrypoint is the built `dist/index.js`/`dist/index.d.ts` generated
  from `src/index.ts`. `src/shared/` remains an internal directory with no public
  subpath, while explicitly curated bindings may be re-exported by the root barrel.
  SDK-specific domain error/value contracts remain permitted in `src/domain/`.
- `@specd/cli` removes its direct `@specd/code-graph` runtime dependency and imports the
  worker capability only from `@specd/sdk`; it imports no lock helper from either
  package.
- Public symbols receive JSDoc and follow the existing typed `SpecdError` contract.

## Specs affected

### New specs

- `code-graph:isolated-index-worker`: Defines the complete reusable contract for
  lock-aware process supervision, the packaged child runtime, trusted injected task
  modules, validated IPC, signal and termination semantics, cleanup invariants, typed
  failures, test seams, and ESM distribution.
  - Depends on: none

### Modified specs

- `code-graph:composition`: Adds the isolated index worker capability and its contracts
  to the curated public package surface while moving bare index-lock primitives out of
  that surface and keeping concrete process infrastructure internal.
  - Depends on (added): `code-graph:isolated-index-worker`
  - Depends on (removed): none
- `sdk:composition`: Adds explicit re-exports of the curated isolated-worker API and
  types, removes raw index-lock and lock-assertion re-exports, and keeps SDK free of
  process and lock infrastructure.
  - Depends on (added): `code-graph:isolated-index-worker`
  - Depends on (removed): none
- `cli:graph-index`: Replaces CLI-owned spawn, lock, environment-switch, and signal
  supervision with one high-level worker call and a packaged injected CLI task. CLI no
  longer imports or invokes any lock helper. The spec also clarifies subprocess context
  reconstruction while preserving observable indexing, output, progress, rebuild,
  error, and concurrency behaviour.
  - Depends on (added): `code-graph:isolated-index-worker`
  - Depends on (removed): none
- `code-graph:index-project-graph`: Separates a forced logical reindex from physical
  storage recreation. A force request clears indexed graph content and reprocesses all
  inputs; it no longer asks an already-open store to recreate its database.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:graph-store`: Defines distinct contracts for clearing reusable indexed
  content and recreating unrecoverable physical storage, including the closed-store
  precondition for recreation.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:sqlite-graph-store`: Applies the separated clear/recreate contracts to
  SQLite, including safe removal of a closed storage directory and generation rotation.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:run-index-project-graph`: Selects the force lifecycle before provider opening,
  detects only typed recoverable storage-open failures, and coordinates one closed-store
  recreation and retry while preserving SDK ownership of project/workspace/VCS
  orchestration.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:with-open-graph-provider`: Lets the SDK indexing orchestration close a failed
  transient provider before the bounded force-only recovery, then reopen it without
  adding an index-specific `open` variant.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

### Code and tests

- `packages/code-graph/src/infrastructure/index-lock.ts` remains the internal lock
  authority and is consumed by code-graph composition/supervision rather than SDK or
  CLI.
- `packages/code-graph` gains parent/child process infrastructure, public contracts and
  typed errors, unit tests for protocol and cleanup, and process-level tests for fork,
  signals, abnormal exit, and lock release.
- `packages/code-graph/package.json` and its `tsup` inputs gain a stable child entrypoint
  in published `dist/` alongside the existing SQLite worker entry.
- `packages/sdk/src/index.ts` replaces raw lock re-exports with the high-level isolated
  worker exports; SDK does not gain a worker implementation or a dependency on CLI.
- Corrective SDK coverage imports every worker contract and failure from generated
  declarations and proves generated declarations expose no lock, release, token, or raw
  IPC surface.
- `packages/cli/src/commands/graph/index-graph.ts` loses inline `runIndexWorker`, direct
  lock handling, and worker-selection branching.
- `packages/cli` gains a thin packaged index task adapter and tests that cover option
  serialization, SDK context reconstruction, progress/result mapping, and failure
  mapping through the reusable runtime.
- Built CLI integration coverage verifies `--force` exits normally after child cleanup
  and that JSON and TOON output contain exactly one parseable final result with no IPC or
  progress leakage.
- `force` becomes a logical full rebuild: it clears graph content and bypasses
  incremental reuse so every selected input is reindexed. Physical SQLite recreation is
  not a shortcut for force because it is reserved for explicitly unrecoverable storage.
  When, and only when, `--force` encounters a typed recoverable storage-open failure,
  the SDK use case closes the failed provider, recreates closed storage, and retries the
  complete open-and-index operation once.
- `packages/cli/package.json` removes `@specd/code-graph`, satisfying the existing
  delivery-host dependency constraint.
- `docs/adr/0027-code-graph-owned-index-worker.md` records the significant multi-package
  ownership and process-isolation decision; the new worker spec links to it as
  historical provenance.

### Compatibility and data

- No graph schema, derivation fingerprint, storage location, index generation model, or
  persisted data format changes are expected.
- No command-line flag or successful structured output field is removed or renamed.
- Removing raw lock helpers from the public Code Graph/SDK surfaces is an intentional
  API tightening. Integrators must invoke the isolated worker for writes and use graph
  provider operations for reads instead of coordinating lock files themselves.
- The capability introduces no external service or new third-party runtime dependency;
  it uses Node.js process and IPC facilities already available to the packages.
- Existing read-only graph hosts remain read-only unless they explicitly adopt the new
  worker API. The capability does not trigger background or automatic indexing.

## Technical context

The graph lock exists because SQLite is single-writer and project indexing publishes a
complete generation. A second writer can otherwise produce `SQLITE_BUSY`, duplicate
expensive parsing, or expose a mixed generation. The long-lived parent must own the
lock: if a native child crashes, the parent survives and can still release it. Acquiring
the lock before `fork()` also closes the race in which two invocations both start work.

A worker thread was rejected because native faults are process-wide. Forking the CLI
executable was rejected because it couples the worker to Commander, repeats argument
parsing, requires binary discovery for other hosts, and creates a double process hop.
A separate installable helper package was rejected because it reintroduces version skew
between supervisor, child protocol, and graph implementation.

Putting the concrete project-index task entirely in code-graph was also rejected.
`runIndexProjectGraph` currently combines Core and Code Graph concerns: it reads config
through the SDK host kernel, lists workspaces, resolves VCS state, supplies spec metadata
materialization, owns provider lifecycle, and invokes graph indexing. Moving that logic
would duplicate SDK composition or make code-graph aware of SDK. The injected module
keeps the reusable process runtime graph-owned while allowing each host to compose the
correct version-affine task.

The observed force-path `SIGSEGV` occurs after a valid worker result, following the
current open → close → remove → reopen → close SQLite lifecycle. Experiments that only
changed shutdown mechanics or replaced the SQLite worker did not eliminate it. The
agreed direction is therefore semantic rather than diagnostic: a forced index is a
complete logical clear plus reanalysis of all selected inputs, whereas physical
recreation is a closed-store repair operation for corruption, incompatibility, or an
otherwise unusable storage state.

`GraphStore.open()` remains parameterless and retains its ordinary typed error contract:
search and non-forced indexing surface an open failure without deleting data. The SDK
`runIndexProjectGraph` use case owns the exceptional force-only recovery decision. It
will recover only a typed storage-corruption or schema-incompatibility failure, ensure
the failed provider is closed, invoke physical `recreate()` under its closed-store
precondition, and retry once. Permission, configuration, native-runtime, and other
untyped or non-recoverable failures propagate unchanged; they never authorize deletion.

The current `runIndexWorker` in
`packages/cli/src/commands/graph/index-graph.ts` and the current lock helpers in
`packages/code-graph/src/infrastructure/index-lock.ts` are the behavioural baseline.
The refactor must preserve their safety properties while replacing inherited CLI stdio
and CLI environment control with a typed, host-neutral process contract.

`acquireGraphIndexLock` has a broad transitive impact through provider availability and
graph operations. The new API therefore stays narrow: hosts supply storage identity,
one trusted task module, serializable task input, and optional progress handling; they
do not receive lower-level control over lock deletion or child internals.

## Non-goals

- Moving `runIndexProjectGraph` or SDK host composition into code-graph.
- Adding automatic, scheduled, background, queued, or retrying indexing.
- Changing graph query behaviour, reader locking, index generation atomicity, storage
  schema, or backend selection.
- Exposing arbitrary task-module selection as a `specd graph index` user option.
- Defining a general-purpose process pool or worker framework unrelated to graph
  indexing.
- Supporting worker threads as an alternative isolation mode.
- Preserving CLI-specific worker environment variables as public compatibility APIs.
- Preserving raw index-lock helpers as SDK or host-facing public APIs.

## Open questions

None that can change downstream scope or requirements. The design artifact must choose
concrete TypeScript symbol names, file locations, IPC envelope field names, runtime
validators, and test adapter shapes within the fixed behavioural boundaries above.
