# Isolated Graph Index Worker

## Purpose

Graph indexing executes CPU-heavy and native code that can block a host or terminate
its process, while the shared graph store permits only one indexing writer. This
capability provides a reusable, lock-aware child-process boundary that lets any trusted
host run a version-affine graph-index task without implementing lock files, process
supervision, signal handling, or IPC itself.

## Requirements

### Requirement: High-level isolated execution API

`@specd/code-graph` SHALL expose a high-level `runIsolatedGraphIndex` operation and its
host-facing input, progress, result, and typed error contracts from the curated public
entrypoint.

The operation input MUST contain:

- the graph storage root used to derive the shared index lock;
- the URL or absolute path of one trusted, installed task module;
- JSON-serializable task input;
- an optional progress callback.

The operation SHALL resolve with the task's JSON-serializable result after a successful
terminal child message. It MUST NOT call `process.exit()`, render output, interpret CLI
formats, or mutate host-global exit state.

### Requirement: Encapsulated index lock ownership

`runIsolatedGraphIndex` SHALL acquire the shared graph index lock for the supplied
storage root before creating a child process. A concurrent run for the same storage
root MUST fail with the graph's typed busy error before a second child is forked.

The supervisor SHALL own the lock for the complete child lifetime and SHALL release it
exactly once after every terminal path, including:

- successful task completion;
- task-reported failure;
- child creation failure;
- invalid or duplicate terminal IPC;
- child exit before a terminal message;
- non-zero child exit;
- signal-based child termination;
- a native child crash.

A failure of child creation, IPC-channel setup, or the initial `send` operation SHALL
also be a bounded terminal path even if the child never emits `exit`. The supervisor
MUST detach its listeners, tear down IPC, release the lease exactly once, and settle
with the typed startup failure after best-effort child termination.

Acquisition, release, lock-path construction, and direct unlocked assertions MUST remain
internal code-graph details. The public operation MUST NOT require callers to acquire,
release, inspect, or pass a lock token.

### Requirement: Process isolation

Production execution SHALL use `node:child_process.fork` to launch a dedicated graph
index worker entrypoint shipped by the same installed `@specd/code-graph` package.

The child process SHALL contain task execution, parser work, provider native code, and
any synchronous graph-store work performed by the injected task. A native crash in the
child MUST NOT terminate the supervising host process.

After reporting a successful terminal result, the child SHALL finish task-owned resource
cleanup and exit with code 0. A native crash or signal after an apparent result remains
an abnormal exit, not a successful run. Task and worker cleanup MUST address resource
lifecycle faults directly and MUST NOT call `process.exit()` to mask them.

Worker threads and in-process execution MUST NOT be offered as production isolation
modes. Tests MAY inject a process launcher or invoke the task/worker protocol through a
dedicated test seam without weakening the production default.

### Requirement: Trusted injected task module

The worker SHALL dynamically load exactly the task-module URL or absolute path supplied
programmatically by the host. The module MUST expose the documented asynchronous graph
index task entrypoint.

The task entrypoint SHALL receive:

- the JSON-serializable task input supplied by the host;
- a progress emitter that accepts JSON-serializable progress data;
- an activity announcer that accepts the item the task is about to process and an optional mandatory flag, as defined by Requirement: Activity and silence watchdog. A task that does not need it MAY ignore it.

The task entrypoint SHALL return one JSON-serializable result or throw one failure. The
worker MUST reject a missing entrypoint, non-callable entrypoint, non-serializable input,
progress value, or result as a typed task/protocol failure.

Task-module selection MUST NOT be exposed as an end-user CLI argument by this
capability. The operation assumes the calling host selected a trusted, installed,
version-affine module; it is not a sandbox for untrusted code.

### Requirement: Validated IPC lifecycle

Parent and child SHALL communicate through a tagged, runtime-validated IPC protocol.
The protocol MUST distinguish:

- zero or more progress messages;
- zero or more activity messages that announce the item the child is about to process;
- one successful terminal result;
- one task-reported terminal failure;
- malformed or unsupported protocol messages;
- child termination without a valid terminal message.

The protocol identifier MUST carry a version and MUST change whenever the set of message types or their fields changes. Parent and child ship in the same package, so a version mismatch SHALL be classified as a protocol failure.

Each run MUST accept at most one terminal message. A duplicate or late terminal message
SHALL be classified as a protocol failure and MUST NOT trigger a second result,
rejection, signal action, or lock release.

Raw IPC envelopes and child bootstrap commands MUST remain internal. The public surface
MAY expose presentation-neutral progress and failure value types required by hosts, but
MUST NOT require hosts to send, parse, or validate child-process messages.

### Requirement: Progress and result neutrality

The supervisor SHALL forward each valid progress value to the optional host callback in
arrival order without rendering or lossy transformation. Absence of a callback MUST NOT
change task execution.

The child and supervisor MUST NOT write normal progress or successful result data in
CLI-specific text, JSON, or TOON form. Delivery hosts own presentation.

### Requirement: Typed failure classification

The high-level operation SHALL preserve distinct typed failures for:

- graph index already busy;
- fork startup or IPC-channel creation failure;
- invalid task module or task contract;
- task-reported failure;
- malformed, unsupported, late, or duplicate IPC;
- non-zero exit or exit before a valid terminal result;
- signal-based termination.

Every failure produced after the child started SHALL carry a closed `cause` classification and structured diagnostics. The `cause` SHALL be one of `start-failed`, `task-contract`, `task-error`, `protocol`, `cancelled` (termination caused by a signal the supervisor forwarded), `native-crash` (termination by `SIGSEGV`, `SIGBUS`, `SIGILL`, or `SIGABRT`, or an abort exit), `resource-limit` (termination attributable to memory exhaustion, such as a fatal out-of-memory report in the captured error output or an operating-system kill after that evidence), or `exited` (any other exit without a valid terminal result). The classification SHALL use the exit code, the signal, and the captured output tails, and SHALL fall back to `exited` or the signal-derived cause when the evidence is insufficient.

The diagnostics SHALL include the last activity announced by the child (the active item and how long ago it was announced) and the captured standard output and standard error tails defined by Requirement: Child output capture.

Worker failure types MUST extend the package's `SpecdCodeGraphError` hierarchy, expose
stable upper-snake-case error codes, retain an actionable message, and include structured
exit code or signal details when applicable. Hosts MUST NOT need to parse stderr or
error-message text to distinguish these cases.

### Requirement: Child output capture

The supervisor SHALL capture the child's standard output and standard error instead of discarding them. It SHALL keep a bounded tail of each (the most recent output, no more than 16 KiB per stream, decoded as UTF-8 with invalid sequences replaced) and SHALL release the buffers when the run ends. Captured output MUST NOT be written to the host's standard streams and MUST NOT be forwarded as progress or as an event. It SHALL appear only in the diagnostics of a failure.

### Requirement: Activity and silence watchdog

The child task contract SHALL allow the task to announce the item it is about to process (for example the file path), marking the announcement as mandatory when the item is expected to be expensive. The child SHALL forward announcements as activity messages and SHALL bound their rate to at most four per second, except that mandatory announcements are always forwarded, so that the item being processed during a stall is never the one whose announcement was withheld. The supervisor SHALL record the latest announced item and the time of the latest message of any kind (progress, activity, or terminal).

The analysis a child performs is synchronous, so the watchdog MUST run in the supervisor and not in the child. When no message of any kind has arrived for 10 seconds, the supervisor SHALL deliver a `worker-silent` event naming the last announced item and the silent duration, and SHALL repeat it at most once per further 10 seconds of silence. The watchdog MUST NOT terminate the child and MUST NOT change task execution. A receiver that throws while handling an event, including the `stale-lock-recovered` event and the string warning receiver delivered while the lock is acquired and before any child exists, is a host failure, not a worker failure: it ends the run with a typed progress-handler error (`GraphIndexProgressHandlerError`) after terminating the child when one exists; the lock lease is released.

Both the activity announcements and the `worker-silent` event SHALL be delivered through the optional typed event receiver defined by Requirement: Typed worker events. The `worker-silent` event carries the last announced item and the silent duration; it carries no captured output.

### Requirement: Typed worker events

`RunIsolatedGraphIndexInput` SHALL accept an optional `onEvent` receiver in addition to the unchanged `onProgress` and `onWarning` receivers. It SHALL be called with presentation-neutral, JSON-serializable events that carry a stable `kind` identifier and structured fields, never display sentences. The kinds SHALL be `activity` (the announced item), `worker-silent` (the last announced item and the silent duration in milliseconds), and `stale-lock-recovered` (the recovery that `onWarning` also reports as text). Events SHALL be delivered in arrival order, and the absence of the receiver MUST NOT change task execution.

### Requirement: Child runtime options

The supervisor SHALL start the child in a runtime in which the garbage-collection request used by the indexer's parser-resource lifecycle is available, through a fork execution argument and not by modifying runtime flags after startup. The supervisor SHALL preserve the execution arguments it needs for the published ESM entrypoint and MUST NOT remove arguments supplied by the host runtime.

### Requirement: Signal forwarding and cleanup

While a child is active, the supervisor SHALL install parent `SIGINT` and `SIGTERM`
handlers that forward the same signal to that child. It SHALL remove only the handlers
it installed after the run terminates.

After forwarding a signal, the supervisor SHALL wait for child termination, release the
lock, and report a typed signal-derived terminal failure to the host. It MUST NOT exit
or re-signal the host process directly.

### Requirement: Index lease release on exit

The process that holds the index lease MUST release it on process exit. On Windows it MUST also release the lease on `SIGBREAK`. Releasing the lease on `SIGTERM` remains required where that signal is delivered. Failure to deliver `SIGTERM` MUST NOT leave the lease held after the process has exited.

### Requirement: Internal lock handoff

The child SHALL receive a code-graph-owned internal indication that its supervisor holds
the shared index lock. Code-graph provider indexing invoked inside that child MUST use
this indication to avoid reacquiring the same lock.

The indication MUST NOT be a caller-managed public token or part of the SDK/CLI API. It
MUST be scoped to the forked child environment and MUST NOT disable lock acquisition for
unrelated processes or storage roots.

### Requirement: Published ESM worker entrypoint

The code-graph build SHALL emit the child entrypoint as a stable ESM file under the
published `dist/` contents. `runIsolatedGraphIndex` SHALL resolve that entrypoint
relative to its own installed module location rather than the repository root, current
working directory, or TypeScript source tree.

Package verification MUST demonstrate that the public supervisor can fork the emitted
worker from built/publish-shaped output and dynamically import a built injected task
module.

Built integration verification MUST include a forced project index that receives a
terminal result, completes child cleanup, and exits cleanly with code 0.

### Requirement: Resource cleanup

The supervisor SHALL make listener removal, child reference cleanup, IPC teardown, and
lock release idempotent. Cleanup MUST complete before the returned promise settles.

The supervisor MUST detach no listener it did not install and MUST leave no lock file,
live child, or open IPC channel after a terminal outcome.

## Constraints

- Only a child process provides the required native-crash containment.
- The capability MUST NOT depend on `@specd/sdk`, `@specd/cli`, Commander, or a delivery
  output formatter.
- Inputs, progress values, results, and IPC payloads MUST be JSON-serializable and
  runtime-validated at the process boundary.
- Direct lock helpers and raw IPC DTOs MUST remain internal package implementation
  details.
- The capability MUST NOT implement queueing, lock waiting, automatic retry, scheduled indexing, or background indexing. It MUST NOT implement stale-lock detection or PID recovery itself: acquiring the lock through the lock helper of `code-graph:staleness-detection` recovers a dead owner's lock, and the supervisor only consumes the outcome (acquired or typed busy error).

## Spec Dependencies

- [`code-graph:sqlite-graph-store`](../sqlite-graph-store/spec.md) — index lease and graph persistence layout that the worker must release

## ADRs

- [ADR-0027: Code Graph-owned isolated index worker](../../../docs/adr/0027-code-graph-owned-index-worker.md)
