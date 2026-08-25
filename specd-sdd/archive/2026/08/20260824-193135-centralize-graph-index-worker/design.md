# Design: centralize-graph-index-worker

## Objectives and expected outcomes

This change makes `@specd/code-graph` the sole owner of graph-index single-writer
coordination and process isolation. A host supplies a storage root, one trusted
installed task module, JSON data, and an optional progress callback to
`runIsolatedGraphIndex`; code-graph acquires the lock, forks its own published ESM
worker, validates IPC, forwards signals, classifies failures, and cleans up before the
promise settles.

`@specd/sdk` remains the owner of project-level graph orchestration through
`runIndexProjectGraph`, and re-exports only the high-level isolated-worker API and
host-facing types. It neither exports nor invokes raw lock helpers. `@specd/cli`
becomes a delivery adapter: it resolves command context, selects its packaged task,
calls the SDK worker API, renders progress/results, and maps failures to exit status.
It has no direct code-graph dependency and contains no lock, fork, IPC, signal, or
worker-mode implementation.

The observable `specd graph index` flags, successful text/JSON/TOON results,
per-file-error semantics, busy message, and exit codes remain stable. Production
indexing is always process-isolated.

## Corrective revision: terminal settlement, force recovery, and facade evidence

The compliance audit and a reproducible `graph index --force` run add three corrective
constraints. First, the supervisor's initial `child.send` failure path cannot rely on a
later `exit` event: it must initiate best-effort termination/IPC disconnect and perform
idempotent finalization itself, so the lease and host promise settle even for a child
that remains silent. Second, a valid IPC result followed by `SIGSEGV` is correctly an
abnormal exit, but the forced index must not cause that exit. Investigation traces the
forced path through SQLite recreation (close, remove, reopen) and final worker-client
termination; implementation must isolate and fix that native-resource lifecycle before
the child disconnects, never masking it with `process.exit()`.

The repair changes semantics rather than hiding the crash: a healthy forced index is a
logical `clear()` plus reanalysis of every selected input, never physical recreation.
`open()` remains parameterless and never deletes storage. Only transient SDK indexing
with `force: true` may recover `GraphStorageRecoveryRequiredError`: after the lifecycle
helper closes the failed provider, SDK calls `provider.recreate()` on the closed
provider and retries `open()` exactly once. `recreate()` rejects an open provider,
removes physical storage, rotates generation, and leaves it closed. Explicit providers,
non-forced calls, recovery failures, second open failures, and all other errors
propagate without deletion or retry. Regression coverage runs healthy force twice,
typed recovery once, and non-recoverable failure cases; no path uses `process.exit()`.

Third, SDK's existing implementation intentionally has SDK-specific `domain` contracts
and root-barrel aliases implemented by an internal `shared` module. The specification
therefore treats `shared` as non-addressable rather than non-re-exportable, permits the
narrow `domain` role, and names built `dist` as the package export shape. Publish-shaped
tests, not source-only inspection, enforce both the positive curated surface and its
negative lock/IPC boundary.

The full verification audit adds one final lifecycle correction. The generic
`withOpenGraphProvider` contract has no specialized `options.open`, no `TOpen`
generic, and no callback argument carrying an open result: both attempts invoke the
same parameterless `provider.open()`. If the recovery callback throws or the retry
open fails, the helper performs a final best-effort `provider.close()` before
`afterClose`, preserving the primary error, never invoking recovery twice, and never
attempting a third open. The defensive close is required because recreation or a
partial retry may have acquired resources after the pre-recovery close.

The legacy `IndexProjectGraph` incompatibility-repair requirement is removed because
that use case receives an already-open provider and only forwards logical force.
Physical recovery occurs exclusively in transient SDK orchestration before the use
case runs. Integration coverage also exercises corrupt SQLite bytes and an ordinary
non-recoverable open failure, proving that only corruption or incompatible schema
grants recreation authority.

## Full-verification corrective revision: prepared-provider use-case delegation

`runIndexProjectGraph` SHALL construct one `IndexProjectGraph` use case through
`createIndexProjectGraph()` and invoke `execute()` with the already-open provider and
the prepared project index input. It SHALL not call `provider.index()` directly.
This preserves the Code Graph application boundary while retaining SDK ownership of
configuration, workspace selection, VCS resolution, lifecycle hooks, and force-only
recoverable-open handling.

In `packages/sdk/src/orchestration/run-index-project-graph.ts`, replace the local
direct provider-index closure with a local `IndexProjectGraph` instance created after
the graph configuration and VCS input are prepared. The closure used by both the
caller-owned provider path and the transient-helper path SHALL call:

```ts
indexProjectGraph.execute({
  provider,
  projectRoot,
  workspaces,
  graphConfig,
  codeGraphVersion,
  vcsRoot,
  ...(input.force === true ? { force: true } : {}),
  ...(vcsRef !== undefined ? { vcsRef } : {}),
  ...(input.onProgress !== undefined ? { onProgress: input.onProgress } : {}),
})
```

It SHALL continue to decorate the returned `IndexResult` with the existing
force-recovery `fullRebuild` and `fullRebuildReason` fields. The recovery callback
remains outside the use case: only a transient `force: true` initial
`GraphStorageRecoveryRequiredError` closes through the helper, calls closed-provider
`recreate()`, and retries parameterless `open()` once. Explicit providers remain
caller-owned and never close, recreate, or retry.

`packages/sdk/test/orchestration/run-index-project-graph.spec.ts` SHALL make the
mocked `createIndexProjectGraph` seam observable. Add assertions that it is created
once and that `execute()` receives the exact prepared provider, selected workspaces,
VCS data, force flag, and unchanged progress callback for both explicit and transient
provider paths. Keep force-recovery assertions proving that the use case executes only
after the one allowed retry. The test double's `provider.index` must not be the
orchestration assertion point.

The inherited SQLite worker-queue scenario that allowed `recreate()` alongside
concurrent reads and writes is removed. Recreate is physical filesystem work on a
closed store and therefore rejects when a SQLite worker is open. The destructive
recreation scenarios explicitly cover the valid sequence: close, recreate, then an
explicit later open. A healthy force run remains an open-store logical `clear()` and
never performs delete/reopen. This resolves the prior ambiguity that a recreated
store could be immediately indexed before an explicit open.

## Scope

- Add a generic but graph-index-specific parent supervisor and child runtime to
  `@specd/code-graph`.
- Make the worker entry and the host's injected task module version-affine published
  ESM files.
- Move the existing parent-held lock handoff into code-graph and scope it to one exact
  storage root and one lock lease.
- Add runtime validation for task data and every IPC envelope.
- Add stable typed worker failures under `SpecdCodeGraphError`.
- Re-export the curated worker API from `@specd/sdk`; remove all SDK raw-lock exports.
- Replace CLI process supervision with one SDK call and a packaged CLI task that
  reconstructs configured or bootstrap SDK state and invokes `runIndexProjectGraph`.
- Remove the CLI's direct `@specd/code-graph` dependency and environment-mode switches.
- Update package, SDK, Code Graph, and CLI reference documentation.

## Non-goals

- Moving `runIndexProjectGraph`, kernel construction, workspace listing, VCS lookup,
  spec metadata access, or SDK provider lifecycle into code-graph.
- Exposing a general process runner, arbitrary end-user task selection, a worker pool,
  worker threads, or an in-process production mode.
- Adding queueing, lock waiting, retries, timeouts, scheduled/background indexing, or
  stale-lock PID recovery.
- Changing graph schemas, derivation fingerprints, storage paths, generation
  publication, provider backend selection, reader locking, or query behavior.
- Preserving `SPECD_GRAPH_INDEX_WORKER`, `SPECD_GRAPH_INDEX_NO_WORKER`, or
  `SPECD_GRAPH_INDEX_LOCK_HELD` as supported inputs.
- Making lock paths, lock leases, lock assertions, child bootstrap functions, process
  adapters, or raw IPC DTOs public through Code Graph or SDK.
- Treating the injected task as a security sandbox. The caller is trusted and must
  select an installed module; the CLI offers no task-module option.

## Constraints and assumptions

- Runtime is Node.js ESM and uses `node:child_process.fork`; only a process boundary
  contains native crashes.
- Public and protocol values use the JSON value model defined below. `undefined`,
  `bigint`, symbols, functions, cyclic structures, non-finite numbers, class instances,
  dates, maps, sets, typed arrays, and symbol-keyed properties are invalid.
- Storage roots and task paths are absolute after normalization. A task URL must use
  the `file:` scheme; network URL schemes and relative paths are rejected before fork.
- One isolated run has one child, one task invocation, zero or more progress events,
  and exactly one terminal protocol envelope followed by child exit.
- The existing lock remains fail-fast. A pre-existing lock always yields
  `GraphBusyError`; this change does not infer liveness from lock contents.
- Domain code remains free of I/O. Public contracts and the runner port live under
  `application/ports`; locking, process control, module loading, and IPC live under
  `infrastructure`; `composition/run-isolated-graph-index.ts` is the only public wiring
  layer that constructs the concrete runner. There are no default exports, module-level
  service singletons, or `any` types.
- Every new exported symbol has complete JSDoc, including parameter, return, thrown
  error, generic parameter, and trust-boundary documentation.

## Affected areas

### Code Graph runtime and package

- `acquireGraphIndexLockByStoragePath`, `acquireGraphIndexLock`,
  `assertGraphIndexUnlockedByStoragePath`, and lock-path helpers in
  `packages/code-graph/src/infrastructure/index-lock.ts`
  - Change: introduce an internal lease with a random owner token; keep acquisition,
    release, assertion, and path logic internal. The existing fail-fast behavior and
    busy message remain unchanged.
  - Dependents: provider indexing/availability, CLI's current worker, lock tests, and
    graph provider/integration tests. Graph analysis reports 3 direct and 49 transitive
    dependents; risk is **CRITICAL**. The migration therefore preserves provider read
    checks and changes only write-lock handoff semantics.
- `CodeGraphProviderImpl.withIndexLock` and `assertAvailable` in
  `packages/code-graph/src/composition/code-graph-provider.ts`
  - Change: replace the global `SPECD_GRAPH_INDEX_LOCK_HELD === 'true'` bypass with an
    internal exact-root, exact-lease verification. Reads keep calling
    `assertGraphIndexUnlockedByStoragePath`.
  - Impact: provider construction and indexing tests are transitive dependents. The
    public `CodeGraphProvider` signature does not change.
- `packages/code-graph/src/public.ts`
  - Change: export `runIsolatedGraphIndex`, JSON/task/public option types, and typed
    worker errors. Do not export raw lock, process adapter, child entry, or IPC types.
  - Impact: one direct barrel test dependent; graph risk LOW.
- `packages/code-graph/src/index.ts`
  - Change: export the same curated worker API for internal consumers while retaining
    raw lock helpers only on `@specd/code-graph/internal`. Raw IPC and child bootstrap
    remain file-private and are not added to either barrel.
  - Impact: four direct test dependents; graph risk MEDIUM.
- `packages/code-graph/package.json`
  - Change: add `src/infrastructure/isolated-index-worker/child.ts` as a `tsup` entry in
    every build variant so `dist/child.js`-equivalent output is published. Do not add a
    package export subpath. No third-party dependency is added.
- `packages/code-graph/test/infrastructure/index-lock.spec.ts`
  - Change: cover lease contents, idempotent release, exact handoff, unrelated roots,
    and legacy busy semantics.
- `packages/code-graph/test/barrel.spec.ts`
  - Change: assert the high-level surface exists and raw lock/protocol/process symbols
    are absent from the public barrel.
- Existing provider and indexing tests found in the blast radius remain regression
  coverage and must pass unchanged unless their internal handoff fixture is updated.

### SDK facade

- `packages/sdk/src/index.ts`
  - Change: explicitly re-export `runIsolatedGraphIndex` and only its public JSON,
    input, task, progress, result, and error contracts from `@specd/code-graph`.
    `acquireGraphIndexLock`, `assertGraphIndexUnlocked`, lock-path helpers, lease/token
    types, and IPC envelopes must not appear in source or generated declarations.
  - Impact: one barrel-test dependent; graph risk LOW. Existing graph health, result,
    version, composition, and orchestration exports remain intact.
- `packages/sdk/test/barrel.spec.ts`
  - Change: positive assertions for the high-level worker and negative assertions for
    every raw lock/IPC/process symbol.
- `packages/sdk/src/orchestration/run-index-project-graph.ts`
  - Change: build and invoke `createIndexProjectGraph().execute()` for every prepared
    provider instead of calling `provider.index()` directly. When a transient
    provider's first parameterless `open()` rejects with
    `GraphStorageRecoveryRequiredError` and input `force` is true, select the generic
    helper recovery callback that calls `provider.recreate()` and permits one retry.
    Explicit providers, non-force, and all other errors remain untouched.
- `packages/sdk/src/composition/with-open-graph-provider.ts`
  - Change: retain only `beforeOpen`, `afterClose`, and
    `recoverOpenFailure(error, provider): Promise<boolean>` as lifecycle options.
    Remove the specialized open callback and result parameter. Every terminal
    recovery/retry failure performs final best-effort close before `afterClose` while
    preserving the primary error and the one-retry bound.
- `packages/code-graph/src/composition/code-graph-provider.ts`,
  `packages/code-graph/src/domain/ports/graph-store.ts`, and the SQLite store/database
  infrastructure
  - Change: force indexing calls logical `clear()` and bypasses incremental reuse;
    expose `recreate()` on the provider only as a closed-provider physical recovery
    operation. Add public typed recoverable-open and recreate-while-open errors.
    SQLite closes partial handles before translating only corruption/non-migratable
    schema errors and never delete-reopens healthy storage for force.

### CLI delivery adapter

- `registerGraphIndex`, current `runIndexWorker`, signal closures, and worker
  environment branches in `packages/cli/src/commands/graph/index-graph.ts`
  - Change: delete `runIndexWorker`, `spawn`, direct lock imports, signal handling, and
    environment branches. Resolve context once, create the serializable descriptor,
    and call `runIsolatedGraphIndex` from SDK once. Keep parsing, output formatting,
    progress rendering, and exit mapping.
  - Dependents: `packages/cli/src/index.ts` and two command test suites; graph risk
    MEDIUM. `registerGraphIndex` keeps its signature.
- `packages/cli/package.json`
  - Change: remove `@specd/code-graph`; add the CLI task source as a separate `tsup`
    entry in build/dev/debug scripts so it is present in `dist/` next to `index.js`.
- `packages/cli/test/commands/graph-index.spec.ts`
  - Change: mock `runIsolatedGraphIndex` from SDK, assert descriptors/options/progress
    and failure mapping, and remove environment/fork/lock mocks.
- `packages/cli/test/commands/graph-index-integration.spec.ts`
  - Change: execute publish-shaped built CLI output for the real process-isolated path;
    remove the in-process environment bypass.

### Documentation

- `docs/code-graph/services.md`: replace public raw-lock documentation with the
  `runIsolatedGraphIndex` API, trust boundary, failure classes, and internal lock note.
- `docs/code-graph/use-cases.md`: state that Code Graph owns isolation/locking and an
  injected SDK-composed task owns project orchestration.
- `docs/sdk/index.md`: list the high-level worker re-export, clarify that SDK exposes no
  lock primitives, and map CLI graph index to both `runIsolatedGraphIndex` and
  `runIndexProjectGraph` inside the task.
- `docs/cli/cli-reference.md`: remove CLI-parent ownership and all worker environment
  variables; document Code Graph-owned isolation, unchanged lock behavior, signal
  handling, and the absence of a public no-worker mode.
- `docs/adr/0027-code-graph-owned-index-worker.md`: record the cross-package ownership,
  process-isolation, injected-task, and tokenized parent-lock decisions in MADR format,
  including confirmation and links to the four affected specs.
- `GRAPH_INDEX_LOCK_NOTES.md`: it is an analysis input, not authoritative public
  documentation. Do not update or delete it in this change.

## New constructs

### Public Code Graph contracts

Location:
`packages/code-graph/src/application/ports/isolated-graph-index-runner.ts`.

```ts
export type GraphIndexJsonPrimitive = null | boolean | number | string

export type GraphIndexJsonValue =
  | GraphIndexJsonPrimitive
  | readonly GraphIndexJsonValue[]
  | { readonly [key: string]: GraphIndexJsonValue }

export type GraphIndexTaskProgressEmitter<TProgress> = (progress: TProgress) => void

export type GraphIndexTask<TInput, TProgress, TResult> = (
  input: TInput,
  emitProgress: GraphIndexTaskProgressEmitter<TProgress>,
) => Promise<TResult>

export interface RunIsolatedGraphIndexInput<TInput, TProgress> {
  readonly storageRoot: string
  readonly taskModule: URL | string
  readonly taskInput: TInput
  readonly onProgress?: (progress: TProgress) => void
}

export interface IsolatedGraphIndexRunner {
  run<TInput = GraphIndexJsonValue, TProgress = GraphIndexJsonValue, TResult = GraphIndexJsonValue>(
    input: RunIsolatedGraphIndexInput<TInput, TProgress>,
  ): Promise<TResult>
}
```

The port is an interface because it has no invariant constructor arguments, and its
operation is an explicit method. It contains no Node, filesystem, process, or IPC type.

Location: `packages/code-graph/src/composition/run-isolated-graph-index.ts`.

```ts
export function runIsolatedGraphIndex<
  TInput = GraphIndexJsonValue,
  TProgress = GraphIndexJsonValue,
  TResult = GraphIndexJsonValue,
>(input: RunIsolatedGraphIndexInput<TInput, TProgress>): Promise<TResult>
```

`taskModule` accepts an absolute filesystem string or `file:` URL. The public function
normalizes `storageRoot` with `resolve()`, converts absolute paths with
`pathToFileURL()`, validates `taskInput` before lock acquisition, and does not expose a
lock token. The task module must have the exact named export `runGraphIndexTask`; no
default-export fallback is permitted. The generics intentionally do not use
`extends GraphIndexJsonValue`: ordinary readonly result interfaces such as
`RunIndexProjectGraphResult` do not carry a string index signature. Runtime validation
is authoritative and rejects any actual value outside the JSON model before transport.

Location: `packages/code-graph/src/domain/errors/isolated-graph-index-errors.ts`.

```ts
export class GraphIndexWorkerStartError extends SpecdCodeGraphError {
  readonly code = 'GRAPH_INDEX_WORKER_START'
  readonly cause?: unknown
}

export class GraphIndexTaskContractError extends SpecdCodeGraphError {
  readonly code = 'GRAPH_INDEX_TASK_CONTRACT'
}

export class GraphIndexTaskExecutionError extends SpecdCodeGraphError {
  readonly code = 'GRAPH_INDEX_TASK_EXECUTION'
  readonly taskCode: string | null
}

export class GraphIndexWorkerProtocolError extends SpecdCodeGraphError {
  readonly code = 'GRAPH_INDEX_WORKER_PROTOCOL'
}

export class GraphIndexWorkerExitError extends SpecdCodeGraphError {
  readonly code = 'GRAPH_INDEX_WORKER_EXIT'
  readonly exitCode: number | null
  readonly signal: string | null
}

export class GraphIndexWorkerSignalError extends SpecdCodeGraphError {
  readonly code = 'GRAPH_INDEX_WORKER_SIGNAL'
  readonly signal: 'SIGINT' | 'SIGTERM'
  readonly exitCode: number | null
}

export class GraphIndexProgressHandlerError extends SpecdCodeGraphError {
  readonly code = 'GRAPH_INDEX_PROGRESS_HANDLER'
  readonly cause?: unknown
}
```

All constructors take explicit message/detail arguments, set a stable `name`, preserve
structured fields, and provide JSDoc. Existing `GraphBusyError` remains the concurrency
type and retains its current `GRAPH_BUSY` code/message.

### Internal lock lease and handoff

Location: `packages/code-graph/src/infrastructure/index-lock.ts`.

```ts
interface GraphIndexLockLease {
  readonly storageRoot: string
  readonly lockPath: string
  readonly ownerPid: number
  readonly ownerToken: string
  release(): void
}

function acquireGraphIndexLockLeaseByStoragePath(storageRoot: string): GraphIndexLockLease

function createGraphIndexLockHandoffEnv(
  lease: GraphIndexLockLease,
): Readonly<Record<string, string>>

function isGraphIndexLockHandoffForStoragePath(storageRoot: string): boolean
```

The lock file is created with `openSync(..., 'wx')` and contains one JSON object:
`{"version":1,"pid":<parent pid>,"token":"<randomUUID>"}` plus a newline. The two
internal child environment fields contain the normalized root and token. Handoff is
valid only when both fields exist, the requested provider storage root normalizes to
the same path, the lock file parses as version 1, and its pid/token match the
environment. Missing, malformed, or mismatched handoff data causes normal lock
acquisition; it never removes or ignores another root's lock.

Existing config-shaped acquire/path/assert wrappers may remain on the internal barrel
for provider/tests, but they are not re-exported by `public.ts` or SDK. New lease and
handoff functions are imported by relative source path only and are not barrel exports.
Release is idempotent and removes only the lock file held by that lease: before removal
it verifies the current file still contains the lease token. It unregisters exactly its
own exit/SIGINT/SIGTERM handlers. Internal signal handlers release then preserve the
existing 130/143 behavior only for direct provider-owned locks; the supervisor uses a
lease option that installs only an `exit` safety handler because it owns signal
forwarding itself.

### Internal IPC protocol

Location: `packages/code-graph/src/infrastructure/isolated-index-worker/protocol.ts`.
Nothing from this file is exported by either package barrel.

```ts
const GRAPH_INDEX_PROTOCOL = 'specd.graph-index.v1'

interface StartMessage {
  readonly protocol: typeof GRAPH_INDEX_PROTOCOL
  readonly type: 'start'
  readonly taskModuleHref: string
  readonly taskInput: GraphIndexJsonValue
}

type ChildMessage =
  | {
      readonly protocol: typeof GRAPH_INDEX_PROTOCOL
      readonly type: 'progress'
      readonly value: GraphIndexJsonValue
    }
  | {
      readonly protocol: typeof GRAPH_INDEX_PROTOCOL
      readonly type: 'result'
      readonly value: GraphIndexJsonValue
    }
  | {
      readonly protocol: typeof GRAPH_INDEX_PROTOCOL
      readonly type: 'failure'
      readonly category: 'task-contract' | 'task-execution' | 'protocol'
      readonly error: SerializedTaskError
    }

interface SerializedTaskError {
  readonly name: string
  readonly message: string
  readonly code: string | null
  readonly stack: string | null
}
```

Validators are explicit type guards over `unknown`; they require exact protocol/type
tags, required fields, no unsupported category, and valid JSON payloads. Extra envelope
fields are rejected to detect version skew. Error serialization never relies on
`JSON.stringify(Error)` and bounds `name`, `message`, `code`, and `stack` to 64 KiB
each. The parent never parses stderr.

### Parent supervisor

Location: `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`.

`runIsolatedGraphIndex` is the public production wrapper. Tests use the non-exported
`runIsolatedGraphIndexWithRuntime(input, runtime)` by direct source import.

```ts
interface IsolatedGraphIndexRuntime {
  readonly fork: typeof import('node:child_process').fork
  readonly process: Pick<NodeJS.Process, 'on' | 'removeListener' | 'execPath' | 'env'>
  readonly workerUrl: URL
  readonly acquireLock: (storageRoot: string) => GraphIndexLockLease
}
```

The infrastructure adapter `NodeIsolatedGraphIndexRunner` implements
`IsolatedGraphIndexRunner`. The production composition function constructs one adapter
per invocation with the real `fork`, real process, internal lock lease, and
`new URL('../infrastructure/isolated-index-worker/isolated-index-worker-child.js',
import.meta.url)` matching the emitted build filename. The launcher calls
`fork(fileURLToPath(workerUrl), [], options)` with:

- `execPath: process.execPath` implicitly through `fork`;
- `serialization: 'json'`;
- `stdio: ['ignore', 'ignore', 'ignore', 'ipc']`;
- an environment cloned from `process.env` plus only the internal root/token handoff;
- no CLI argv, no inherited normal output, and no public mode switch.

The supervisor validates public input before acquiring the lock. It acquires the lock
before calling `fork`, registers child events and its own `SIGINT`/`SIGTERM` handlers,
then sends exactly one `StartMessage`. A synchronous throw, child `error`, missing IPC
channel, or failure to send the start message becomes `GraphIndexWorkerStartError`.

The state machine is:

```text
VALIDATING -> LOCKED -> STARTING -> RUNNING -> TERMINAL_SEEN -> EXITED -> CLEANED
                    \-> START_FAILED ---------------------------> CLEANED
                                RUNNING -> PROTOCOL_FAILED -----> CLEANED
                                RUNNING -> SIGNAL_FORWARDED ----> CLEANED
                                RUNNING -> EXITED_WITHOUT_TERM --> CLEANED
```

The parent does not settle on receipt of a terminal envelope. It stores the first
terminal outcome and waits for child exit, which makes duplicate terminal detection
deterministic. A second terminal envelope, a progress envelope after a terminal, or any
malformed envelope records `GraphIndexWorkerProtocolError`, sends `SIGTERM` if the
child is still alive, and waits for exit. A clean code-0 exit with one result resolves;
a clean code-0 exit with one failure rejects with its mapped task error; code 0 without
a terminal rejects with `GraphIndexWorkerExitError`; non-zero/signal exits reject with
`GraphIndexWorkerExitError` unless the parent forwarded SIGINT/SIGTERM, in which case
`GraphIndexWorkerSignalError` wins. A terminal result followed by non-zero/signal exit
does not resolve successfully.

Progress is synchronously delivered in arrival order. With no callback it is ignored.
If the callback throws, the parent records `GraphIndexProgressHandlerError`, terminates
the child, waits for exit, and performs normal cleanup. The runtime does not transform
or render values.

One idempotent `finalize()` owns all cleanup: remove only the two installed parent
signal listeners; detach the child listeners installed by this run; disconnect the IPC
channel when connected; clear the child reference; and release the lease once.
`finalize()` completes before resolve/reject. Competing message/error/exit events call
the same guarded terminal path and cannot settle twice.

### Child runtime

Location:
`packages/code-graph/src/infrastructure/isolated-index-worker/isolated-index-worker-child.ts`.

The child requires an IPC channel and accepts exactly one valid `StartMessage`. It
converts the `file:` URL to a dynamic import, checks that `runGraphIndexTask` is a
function, and invokes it exactly once with the input and a validating progress emitter.
Missing/non-callable exports produce `task-contract`; an import failure produces
`task-contract`; a task throw/rejection produces `task-execution`; invalid emitted or
returned JSON produces `protocol`. It sends exactly one terminal envelope, disconnects,
sets `process.exitCode = 0`, and allows the event loop to drain. It never calls
`process.exit`, writes results/progress to stdout, or catches native crashes.

The child has a one-terminal guard. A failed `process.send` sets non-zero exit code
because the parent can no longer receive a valid terminal. Unexpected parent
disconnect before completion cancels no graph operation forcibly; the child sets a
failure exit code after the current synchronous turn and relies on process teardown.

### CLI graph-index task

Location: `packages/cli/src/graph-index-task.ts`, emitted as
`packages/cli/dist/graph-index-task.js` by a separate build entry.

```ts
type CliGraphIndexContextDescriptor =
  | {
      readonly mode: 'configured'
      readonly configFilePath: string
    }
  | {
      readonly mode: 'bootstrap'
      readonly projectRoot: string
      readonly vcsRoot: string
    }

interface CliGraphIndexTaskInput {
  readonly context: CliGraphIndexContextDescriptor
  readonly index: {
    readonly force: boolean
    readonly excludePaths?: readonly string[]
  }
}

type CliGraphIndexProgress = {
  readonly percent: number
  readonly phase: string
}

export const runGraphIndexTask: GraphIndexTask<
  CliGraphIndexTaskInput,
  CliGraphIndexProgress,
  RunIndexProjectGraphResult
>
```

For `configured`, the task calls `openSpecdHost` with the exact absolute
`configFilePath` and `buildCliKernelOptions()`, then uses the returned kernel and a
provider factory bound to the returned config. For `bootstrap`, it calls
`createBootstrapGraphConfig` with the exact `projectRoot`/`vcsRoot`, then
`createSdkContext(config, { kernel: buildCliKernelOptions() })`. It calls
`runIndexProjectGraph` exactly once, forwards force/exclusions, adapts the existing
two-argument progress callback to `{percent, phase}`, and returns the unmodified result.
It contains no Commander, formatter, lock, fork, IPC, or direct code-graph import.

The parent descriptor is built only from `resolveGraphCliContext`: configured mode
requires its non-null `configFilePath`; bootstrap requires the already resolved roots.
Missing impossible invariants are CLI validation failures before worker invocation.
The parent supplies `new URL('./graph-index-task.js', import.meta.url)` from the bundled
CLI entry. Publish-shaped integration tests, not source-relative in-process execution,
verify this URL.

## Execution workflows

### Successful CLI run

1. Commander validates flags and rejects simultaneous `--config`/`--path` with code 1.
2. `resolveGraphCliContext` resolves configured or bootstrap state in the parent.
3. CLI builds the context descriptor and index input, then calls the SDK-exported
   `runIsolatedGraphIndex` once with `storageRoot: context.config.configPath`.
4. Code Graph validates data/path, acquires the exact-root lease, forks its packaged
   child, installs scoped signal handlers, and sends the start envelope.
5. The Code Graph child imports the packaged CLI task and invokes it once.
6. The task reconstructs equivalent SDK state and invokes `runIndexProjectGraph` once.
7. Progress crosses IPC as `{percent, phase}`. CLI supplies a callback only for text
   mode and preserves its existing carriage-return rendering. JSON/TOON receive no
   progress callback and stdout remains a single structured result.
8. The task returns `RunIndexProjectGraphResult`; the worker validates/sends it and
   exits cleanly; the parent validates exit, cleans up, and resolves.
9. CLI keeps the existing text formatter or passes the result to `output` for JSON/TOON,
   then exits 0. Per-file errors remain fields in a successful result.

### Failure and signal behavior

- Context/flag failures occur before worker invocation and remain CLI code 1.
- `GraphBusyError` occurs before fork and is mapped by CLI to the current retry-later
  fatal output and code 3.
- All worker start/task/protocol/exit/signal/progress-handler failures are
  `SpecdCodeGraphError` subclasses; CLI uses their message with its existing
  presentation-safe `cliError(..., 3)` path.
- The supervisor never calls `process.exit`. When its host receives SIGINT/SIGTERM it
  forwards that signal, waits for child exit, releases resources, and rejects with
  structured signal details. CLI owns any final exit mapping.
- Native child termination is indistinguishable from an abnormal signal/exit at Node's
  parent API and becomes `GraphIndexWorkerExitError`; the host remains alive.
- There is no automatic retry on any failure.

## Security, consistency, performance, and operations

- Module selection is programmatic and trusted. File-only absolute resolution prevents
  accidental network imports or CWD-dependent lookup; the runtime is not a sandbox.
- JSON validation prevents prototype-bearing/class data and process-boundary coercion.
  Validation is linear in payload size and uses a `WeakSet` for cycle detection.
- The lock is acquired before fork and held until child exit/cleanup, maintaining one
  writer and one logical generation. Lock tokens prevent an unrelated child/root from
  using the internal bypass.
- There is no buffering beyond IPC transport and one retained terminal value. Progress
  is processed in arrival order; a slow synchronous callback naturally applies event
  loop backpressure. No queue or concurrency limit is added.
- Multiple simultaneous runs for different storage roots are permitted. Each has its
  own child, listeners, lease, and token.
- Normal runtime output is silent. Hosts log/render returned values and errors. Typed
  error code, message, exit code, and signal are the observability contract; this
  change adds no metrics or monitoring service.
- A stuck task remains stuck unless the host receives SIGINT/SIGTERM or terminates the
  process externally; adding a timeout would change behavior and is out of scope.

## Key decisions

- **Code Graph owns both supervisor and child runtime** → lock semantics, provider
  handoff, native isolation, and IPC evolve together and can be reused by every host.
  **Rejected:** SDK ownership, which would put graph infrastructure above orchestration;
  CLI ownership, which duplicates it; a new package, which creates version skew.
- **SDK retains `runIndexProjectGraph` and only re-exports the worker** → kernel,
  workspace, VCS, metadata, and provider lifecycle remain at their existing boundary.
  **Rejected:** moving the project task into code-graph, which would create an SDK
  dependency or duplicate composition.
- **The CLI ships a trusted injected task** → code-graph stays host-neutral while the
  task can compose SDK and CLI kernel options. **Rejected:** re-forking the CLI command,
  inherited argv/env behavior, and arbitrary user-selected modules.
- **Parent owns an exact-root tokenized lease** → a native child crash cannot strand a
  live parent's ownership and the child avoids only its own lock. **Rejected:** child
  lock ownership, an unscoped boolean environment bypass, or a caller-visible token.
- **Terminal result waits for clean child exit** → duplicate terminal messages and a
  crash after sending a result cannot become false success. **Rejected:** settling on
  first terminal envelope.
- **Strict JSON, tagged v1 protocol, and exact validators** → transport behavior is
  deterministic and version skew is an explicit typed error. **Rejected:** arbitrary
  structured-clone payloads or unvalidated Node messages.
- **No public in-process test mode** → production cannot accidentally lose crash
  containment. **Rejected:** retaining `SPECD_GRAPH_INDEX_NO_WORKER`; tests inject an
  internal runtime or execute built output.
- **Composition exposes the function over an application port** → the curated public
  API does not export a concrete infrastructure adapter, and application/domain layers
  stay independent of Node I/O. **Rejected:** exporting the infrastructure supervisor
  directly, which violates the global package layering and curated-barrel rules.

## Trade-offs

- A configured child reconstructs equivalent state rather than preserving kernel
  object identity. This is necessary across a process boundary; using the exact config
  path and CLI kernel options preserves behavior.
- A separate CLI task build entry adds one published file and requires publish-shaped
  tests. This avoids coupling Code Graph to SDK and avoids respawning Commander.
- Strict JSON excludes richer values. Index inputs/progress/results are already plain
  data, and rejection avoids silent transport coercion.
- Waiting for child exit adds a small post-result delay. It guarantees correct
  duplicate/crash classification and complete cleanup.
- A corrupted/stale lock still blocks indexing. Existing fail-fast safety is retained;
  recovery policy is deliberately not broadened.

## Spec impact

### `code-graph:composition`

- Direct dependents: `cli:graph-hotspots`, `cli:graph-search`; no transitive spec
  dependents were reported.
- Both depend only on existing curated provider/query exports. Those exports and read
  busy behavior remain unchanged, so no delta is required.
- The new dependency on `code-graph:isolated-index-worker` records the public worker
  surface. No cycle is introduced because the new worker spec has no spec dependency.

### `sdk:composition`

- Direct dependent: `cli:graph-cli-context`.
- Additional affected dependents reported by graph analysis:
  `cli:graph-hotspots`, `cli:graph-impact`, `cli:graph-search`, and `cli:graph-stats`.
- These specs consume existing SDK context, provider, health, and query exports. All
  remain unchanged. Removing raw lock symbols affects only the graph-index command and
  its old tests, which are already in scope; no additional spec delta is required.

### `cli:graph-index`

- No dependent specs were reported. Its flags, formats, result schema, error codes,
  repair behavior, and reader-facing busy message remain stable.

### `code-graph:isolated-index-worker`

- New foundational spec with no declared dependencies or dependents. Composition, SDK,
  and CLI graph-index explicitly depend on it in this change.
- ADR-0027 records the decision that produced this spec; the spec's `## ADRs` section
  links to that record but does not treat it as a dependency.

## Dependency map

```mermaid
graph LR
  CLI[CLI registerGraphIndex] --> SDKW[SDK re-export runIsolatedGraphIndex]
  SDKW --> SUP[Code Graph supervisor]
  SUP --> LOCK[internal lock lease]
  SUP --> CHILD[published Code Graph child]
  CHILD --> TASK[published CLI graph-index task]
  TASK --> SDKI[SDK runIndexProjectGraph]
  SDKI --> USECASE[createIndexProjectGraph().execute]
  USECASE --> PROVIDER[CodeGraphProvider.index]
  PROVIDER --> HANDOFF[internal exact-root handoff]
  HANDOFF --> LOCK
  CGCOMP[code-graph:composition] -. depends on .-> WORKSPEC[code-graph:isolated-index-worker]
  SDKCOMP[sdk:composition] -. depends on .-> WORKSPEC
  CLISPEC[cli:graph-index] -. depends on .-> WORKSPEC
```

```text
┌──────────────────────┐   calls   ┌────────────────────────┐
│ CLI registerGraphIndex│──────────▶│ SDK curated re-export  │
└──────────────────────┘           │ runIsolatedGraphIndex  │
                                   └────────────┬───────────┘
                                                │
                                                ▼
                                   ┌────────────────────────┐
                                   │ Code Graph supervisor  │
                                   └──────┬──────────┬──────┘
                                          │          │ forks
                                     owns │          ▼
                                          │   ┌────────────────────┐
                                 ┌────────▼──┐│ Code Graph child   │
                                 │ lock lease│└─────────┬──────────┘
                                 └─────▲─────┘          │ imports
                                       │                ▼
                                 verifies       ┌──────────────────┐
                                       │        │ CLI task module  │
                              ┌────────┴────┐   └────────┬─────────┘
                              │ provider    │◀───────────┤ calls
                              │ handoff     │            ▼
                              └─────────────┘   ┌──────────────────┐
                                                │ SDK              │
                                                │ runIndexProject… │
                                                └──────────────────┘

┌──────────────────────┐ depends on ┌─────────────────────────────┐
│ code-graph:composition│─ ─ ─ ─ ─ ─▶│ code-graph:isolated-index… │
├──────────────────────┤             └─────────────────────────────┘
│ sdk:composition      │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─▲
├──────────────────────┤                                            │
│ cli:graph-index      │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
└──────────────────────┘
```

## Migration / rollback

There is no persisted-data migration. Deployment requires Code Graph, SDK, and CLI to
be built and published together so the supervisor, child protocol, SDK re-export, and
CLI task are version-affine.

Forward migration order inside the monorepo is: add Code Graph runtime/build entry and
tests; wire it through composition and expose it publicly; re-export through SDK and
remove raw exports; add CLI task;
migrate command/tests and remove direct dependency; update docs; build publish-shaped
packages and run end-to-end verification.

Rollback is a package-version rollback of Code Graph, SDK, and CLI together. Lock-file
location is unchanged. A lock created by the new version contains JSON instead of the
old PID line, but both versions treat any existing file as busy and delete only locks
they acquire; therefore no data conversion is needed. Never run old and new writer
implementations concurrently during rollback.

## Testing

### Automated tests

- New `packages/code-graph/test/infrastructure/isolated-index-worker/protocol.spec.ts`
  covers JSON acceptance/rejection, input validation before task invocation, exact
  protocol/version fields, malformed/unknown/extra fields, non-serializable progress
  and result, error serialization bounds, and presentation-neutral values.
- New `packages/code-graph/test/infrastructure/isolated-index-worker/supervisor.spec.ts`
  uses the injected runtime to cover successful result/no `process.exit`, progress
  A/B/C order, absent callback, busy-before-fork, fork/IPC startup failures, task and
  contract failures, malformed IPC, duplicate/late terminal, clean exit without
  terminal, non-zero exit, simulated native crash, callback throw, and idempotent
  cleanup/release across competing events.
- New `packages/code-graph/test/infrastructure/isolated-index-worker/signals.spec.ts`
  covers SIGINT/SIGTERM forwarding, wait-before-reject, structured signal details,
  preservation of pre-existing listeners, and no host exit/re-signal.
- New built fixtures under
  `packages/code-graph/test/fixtures/isolated-index-worker/` provide valid, invalid,
  duplicate-terminal, abnormal-exit, and PID-returning tasks. Fixtures are test build
  inputs, not package exports.
- New `packages/code-graph/test/infrastructure/isolated-index-worker/dist.spec.ts`
  builds/packs a publish-shaped Code Graph package, runs its public supervisor from a
  different CWD with a built task, confirms different PIDs and successful result, and
  verifies the worker file is shipped without a public export subpath.
- Updated `index-lock.spec.ts` covers all terminal-path release cases indirectly plus
  exact token/root handoff and unrelated-root acquisition. Updated provider tests prove
  child indexing bypasses only a matching parent lease and readers still fail busy.
- Updated Code Graph barrel tests compile/import the high-level function and error
  contracts and assert raw lock, IPC, child, and process-adapter names are absent.
- Updated SDK barrel tests assert `runIsolatedGraphIndex` and public types resolve from
  SDK alone, all existing health/result/version exports remain, and raw acquire/assert/
  path/token/IPC symbols are absent from runtime keys and `.d.ts` output.
- New `packages/cli/test/graph-index-task.spec.ts` covers configured exact-path context,
  explicit bootstrap roots, one `runIndexProjectGraph` call, force/exclusion forwarding,
  progress adaptation, unmodified results, and absence of direct Code Graph imports.
- Updated `packages/sdk/test/orchestration/run-index-project-graph.spec.ts` asserts
  `createIndexProjectGraph()` construction and its `execute()` input for explicit and
  transient providers, including selected workspaces, VCS, force, progress, and the
  one-retry recovery path. It proves SDK orchestration cannot bypass the Code Graph
  application use-case seam.
- Updated CLI command tests cover one SDK worker call, exact task URL/storage root/
  descriptor, text-only progress callback, unchanged text/JSON/TOON outputs,
  configured/bootstrap/no-config semantics, mutual exclusion before worker, code-3
  mapping for every typed failure family, per-file success errors, and absence of raw
  lock/fork/environment behavior.
- Updated CLI integration test builds CLI/SDK/Code Graph, runs
  `node packages/cli/dist/index.js graph index --path <fixture> --force`, validates
  output and different parent/task PIDs through a controlled fixture seam, and runs two
  concurrent commands to verify the second fails busy before another task starts.
- Static package tests inspect `packages/cli/package.json`, built imports, and generated
  declarations to prove CLI has no direct Code Graph dependency and worker/task child
  files are published but not publicly selectable.

Every isolated-worker verification scenario maps to the protocol, supervisor, signal,
lock/provider, dist, or barrel suites above. Every SDK composition scenario maps to SDK
barrel/declaration tests. Every CLI indexing scenario maps to command, task, package,
or integration tests. Existing command signature/output/error/docs/repair scenarios
remain in their current suites and must continue passing.

Run at minimum:

```sh
pnpm --filter @specd/code-graph test
pnpm --filter @specd/code-graph typecheck
pnpm --filter @specd/code-graph lint
pnpm --filter @specd/code-graph build
pnpm --filter @specd/sdk test
pnpm --filter @specd/sdk typecheck
pnpm --filter @specd/sdk lint
pnpm --filter @specd/sdk build
pnpm --filter @specd/cli test
pnpm --filter @specd/cli typecheck
pnpm --filter @specd/cli lint
pnpm --filter @specd/cli build
```

### Manual / E2E verification

1. Build the three packages, then run
   `node packages/cli/dist/index.js graph index --format text --force`; expect ordered
   progress, one unchanged summary, exit 0, and no remaining `graph/index.lock`.
2. Run the same command with `--format json` and `--format toon`; expect one parseable
   result without progress/protocol noise and all existing result fields.
3. Start a deliberately slow index, then start a second command for the same project;
   expect the second to show the existing retry-later busy message and exit 3 without a
   second task PID.
4. Send SIGINT and SIGTERM to the supervising CLI in separate runs; expect the child to
   terminate, the lock to disappear, and a subsequent run to start normally.
5. Install publish-shaped tarballs in a temporary project and run from a CWD outside
   the monorepo; success proves both Code Graph child and CLI task resolve from `dist`.
6. Inspect `@specd/sdk` declarations and CLI dependencies; any raw lock symbol, raw IPC
   type, worker child subpath, or CLI `@specd/code-graph` dependency is a failure.

Documentation markdown lint and repository lint rules apply. Public API JSDoc is part
of acceptance, and docs must describe ownership accurately without exposing internal
environment names or suggesting direct lock manipulation.

## Acceptance criteria

- Code Graph exclusively owns lock acquisition/release, fork, IPC, signals, handoff,
  exit classification, and cleanup for isolated graph indexing.
- SDK exposes the high-level worker and public types but no raw lock or protocol
  surface and contains no lock/process implementation.
- CLI imports the worker only from SDK, has no direct Code Graph dependency, and has no
  worker-mode environment branch or process infrastructure.
- The packaged CLI task reconstructs explicit state and invokes
  `runIndexProjectGraph` exactly once.
- All terminal paths clean up before promise settlement; one-root concurrency remains
  fail-fast and different roots remain independent.
- Built/published ESM output works outside the repository source tree.
- Existing CLI flags, output fields, busy message, per-file error behavior, repair
  diagnostics, and exit semantics pass regression tests.
- Code, tests, package metadata, generated declarations, and documentation contain no
  contradictory ownership statement.
- The public runner is composition-wired over an application port, concrete process
  infrastructure remains out of curated barrels, and ADR-0027 records the decision.
