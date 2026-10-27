# Verification: Isolated Graph Index Worker

## Requirements

### Requirement: High-level isolated execution API

#### Scenario: Successful task resolves without controlling the host

- **GIVEN** a valid storage root, trusted task module, and serializable input
- **WHEN** `runIsolatedGraphIndex` receives a successful terminal task result
- **THEN** it resolves with the same serializable result
- **AND** it does not call `process.exit()`
- **AND** it writes no CLI-formatted output

#### Scenario: Non-serializable input fails before child task execution

- **GIVEN** task input contains a function, symbol, or cyclic reference
- **WHEN** isolated execution is requested
- **THEN** it rejects with a typed validation or protocol error
- **AND** the task entrypoint is not invoked

### Requirement: Encapsulated index lock ownership

#### Scenario: Concurrent writer fails before fork

- **GIVEN** one isolated index run holds the lock for a storage root
- **WHEN** a second run targets the same storage root
- **THEN** the second run fails with the typed graph busy error
- **AND** no second child process is created
- **AND** the first run remains unaffected

#### Scenario: Every terminal path releases the lock exactly once

- **GIVEN** an instrumented lock release and child launcher
- **WHEN** each of success, task failure, fork failure, malformed IPC, premature exit,
  non-zero exit, signal exit, and simulated native crash is exercised
- **THEN** release is called exactly once for each run
- **AND** a subsequent run can acquire the same storage-root lock

#### Scenario: Initial IPC send failure settles without child exit

- **GIVEN** a launched child whose initial IPC `send` callback fails and which never
  emits `exit`
- **WHEN** the supervisor handles the startup failure
- **THEN** it rejects in bounded time with `GraphIndexWorkerStartError`
- **AND** it removes only its own listeners, tears down IPC, and releases the lease
  exactly once
- **AND** best-effort child termination cannot leave the host promise pending

#### Scenario: Caller receives no raw lock capability

- **WHEN** a host invokes `runIsolatedGraphIndex`
- **THEN** its input and result contain no lock path, token, release callback, or
  unlocked assertion

#### Scenario: Isolated run proceeds after a crashed previous run

- **GIVEN** `index.lock` left by a killed process
- **WHEN** `runIsolatedGraphIndex` starts for that storage root
- **THEN** acquisition recovers the stale lock through the lock helper and the child is forked
- **AND** the supervisor itself contains no pid inspection

### Requirement: Process isolation

#### Scenario: Task executes in a forked process

- **GIVEN** a task that returns its process identifier
- **WHEN** production isolated execution runs
- **THEN** the task PID differs from the supervising host PID
- **AND** the child was created with `node:child_process.fork`

#### Scenario: Native child crash does not terminate supervisor

- **GIVEN** a child fixture that terminates as a native crash would
- **WHEN** the fixture runs through the production supervisor
- **THEN** the host remains alive
- **AND** the operation reports a typed abnormal-exit failure
- **AND** the graph lock is released

#### Scenario: Result followed by abnormal exit is not success

- **GIVEN** a child emits a syntactically valid terminal result and then exits by signal
  or native-like crash
- **WHEN** the supervisor observes the exit
- **THEN** it rejects with the typed abnormal-exit failure rather than resolving the
  apparent result
- **AND** it releases the graph lock exactly once

#### Scenario: Test seam does not alter production isolation

- **WHEN** unit tests inject a fake process launcher or invoke the protocol seam
- **THEN** production construction still selects the real fork launcher by default
- **AND** no public in-process or worker-thread mode is exposed

### Requirement: Trusted injected task module

#### Scenario: Valid task receives payload and emits progress

- **GIVEN** a built task module implementing the documented asynchronous entrypoint
- **WHEN** the worker loads it with serializable input
- **THEN** the entrypoint receives that input unchanged
- **AND** progress emitted by the task reaches the worker protocol
- **AND** its returned result becomes the terminal result

#### Scenario: Invalid module contract is rejected

- **GIVEN** a module that is missing the task export or exports a non-callable value
- **WHEN** the child loads the module
- **THEN** the run reports a typed invalid-task failure
- **AND** no graph provider is opened by that module

#### Scenario: Non-serializable task output is rejected

- **WHEN** a task emits non-serializable progress or returns a non-serializable result
- **THEN** the worker reports a typed protocol failure
- **AND** no successful terminal result is delivered

#### Scenario: The task receives an activity announcer

- **GIVEN** a trusted task module that declares the third parameter
- **WHEN** the worker invokes its entrypoint
- **THEN** it receives the input, the progress emitter and an announcer function
- **AND** a task that declares only two parameters still runs

### Requirement: Validated IPC lifecycle

#### Scenario: Progress order precedes one terminal result

- **GIVEN** a task emits progress values A, B, and C before returning
- **WHEN** the parent consumes the IPC stream
- **THEN** the callback observes A, B, and C in that order
- **AND** exactly one successful terminal result settles the operation

#### Scenario: Malformed message is rejected

- **WHEN** a child fixture sends an unknown tag or an envelope with invalid fields
- **THEN** the parent reports a typed protocol failure
- **AND** it does not forward the value as progress or result

#### Scenario: Duplicate terminal message cannot settle twice

- **GIVEN** a child fixture sends two terminal messages
- **WHEN** the parent receives the second terminal message
- **THEN** the run is classified as a protocol violation
- **AND** result settlement and cleanup occur at most once

#### Scenario: Clean exit without terminal message is still failure

- **WHEN** the child exits with code 0 before sending a terminal result or error
- **THEN** the operation reports a typed premature-exit or protocol failure

#### Scenario: Activity messages are accepted before the terminal result

- **GIVEN** a child that sends activity messages, progress messages, and then one result
- **WHEN** the supervisor receives them
- **THEN** the run resolves with the result
- **AND** the activity messages are not treated as progress values

#### Scenario: A protocol version mismatch is a protocol failure

- **GIVEN** a child message that carries a protocol identifier different from the supervisor's
- **WHEN** the supervisor validates it
- **THEN** the run fails with a protocol failure and no result is accepted

#### Scenario: An activity message with extra fields is rejected

- **GIVEN** an activity message with an unknown field
- **WHEN** the supervisor validates it
- **THEN** it is classified as a malformed message

### Requirement: Progress and result neutrality

#### Scenario: Missing progress callback does not affect execution

- **GIVEN** no progress callback was supplied
- **WHEN** a task emits progress and returns successfully
- **THEN** the task completes with the same result
- **AND** progress values are safely ignored by the public operation

#### Scenario: Runtime does not render delivery formats

- **WHEN** progress and a successful result traverse the worker runtime
- **THEN** the runtime emits no text, JSON, or TOON representation to normal output
- **AND** the host receives presentation-neutral values

### Requirement: Typed failure classification

#### Scenario: Failure classes remain machine distinguishable

- **WHEN** busy, fork startup, invalid task, task throw, invalid IPC, non-zero exit,
  premature exit, and signal termination fixtures are executed
- **THEN** each rejects with the documented `SpecdCodeGraphError` subclass
- **AND** each exposes a stable upper-snake-case code
- **AND** no classification requires matching error-message text

#### Scenario: Exit details are preserved

- **WHEN** a child exits with a non-zero code or signal
- **THEN** the typed failure exposes the applicable exit code or signal
- **AND** its message gives an actionable host-facing explanation

#### Scenario: A segmentation fault is a native crash

- **GIVEN** a child that terminates by `SIGSEGV`
- **WHEN** the supervisor classifies the failure
- **THEN** the `cause` is `native-crash` and the signal is exposed as structured data

#### Scenario: A forwarded signal is a cancellation

- **GIVEN** a parent `SIGINT` that the supervisor forwarded to the child
- **WHEN** the child terminates
- **THEN** the `cause` is `cancelled`

#### Scenario: A fatal out-of-memory report is a resource limit

- **GIVEN** a child that exits after printing a fatal out-of-memory report to standard error
- **WHEN** the supervisor classifies the failure
- **THEN** the `cause` is `resource-limit`

#### Scenario: Insufficient evidence falls back to a generic cause

- **GIVEN** a child that exits with code 1 and no recognisable output
- **WHEN** the supervisor classifies the failure
- **THEN** the `cause` is `exited`

#### Scenario: Diagnostics identify the last activity and the output tails

- **GIVEN** a child that announced `src/a.ts` four seconds ago and then crashed after writing to standard error
- **WHEN** the failure is built
- **THEN** the diagnostics contain the item `src/a.ts`, an elapsed time of about four seconds, and the standard error tail

### Requirement: Child output capture

#### Scenario: Output is captured and not forwarded

- **GIVEN** a child that writes to standard output and standard error
- **WHEN** the run ends
- **THEN** the host's own standard streams received none of it
- **AND** the captured tails are available only through failure diagnostics

#### Scenario: Only a bounded tail is kept

- **GIVEN** a child that writes 1 MiB to standard error
- **WHEN** the failure is built
- **THEN** the tail holds the most recent output and no more than 16 KiB

#### Scenario: Invalid UTF-8 is replaced

- **GIVEN** a child that writes bytes that are not valid UTF-8
- **WHEN** the tail is decoded
- **THEN** the invalid sequences are replaced and decoding does not throw

#### Scenario: Buffers are released at the end of the run

- **GIVEN** a completed run
- **WHEN** the supervisor cleanup has finished
- **THEN** no capture listener or buffer remains attached to the child

### Requirement: Activity and silence watchdog

#### Scenario: Activity announcements are rate limited

- **GIVEN** a task that announces five hundred ordinary items within one second
- **WHEN** the child forwards them
- **THEN** at most four activity messages reach the supervisor

#### Scenario: Mandatory announcements are never withheld

- **GIVEN** a task that announces many ordinary items and then one mandatory item within the same second
- **WHEN** the child forwards them
- **THEN** the mandatory item reaches the supervisor and becomes the last announced item

#### Scenario: Silence produces a warning naming the last item

- **GIVEN** a child that announced `src/big.ts` and then sent no message for ten seconds (controlled clock)
- **WHEN** the silence threshold elapses
- **THEN** the supervisor delivers a `worker-silent` event with the item `src/big.ts` and the silent duration

#### Scenario: The warning repeats at most once per threshold

- **GIVEN** a child that stays silent for thirty seconds
- **WHEN** the clock advances
- **THEN** no more than one `worker-silent` event is delivered per further ten seconds

#### Scenario: Any message resets the silence

- **GIVEN** a child that sends a progress message every five seconds
- **WHEN** a minute passes
- **THEN** no `worker-silent` event is delivered

#### Scenario: The watchdog never terminates the child

- **GIVEN** a child that is silent for several minutes
- **WHEN** the watchdog fires repeatedly
- **THEN** the child keeps running and the run outcome is decided only by the child or by a signal

#### Scenario: The watchdog works while the child is blocked

- **GIVEN** a child whose task blocks synchronously for longer than the threshold
- **WHEN** the threshold elapses
- **THEN** the supervisor still delivers the `worker-silent` event

### Requirement: Typed worker events

#### Scenario: Events are delivered in arrival order with stable kinds

- **GIVEN** an `onEvent` receiver and a run that produces activity, a silence, and a stale-lock recovery
- **WHEN** the run proceeds
- **THEN** the receiver gets `activity`, `worker-silent`, and `stale-lock-recovered` events in arrival order
- **AND** each has a `kind` and structured fields and no display sentence is required

#### Scenario: The stale-lock recovery is also reported as text

- **GIVEN** a stale lock that the supervisor recovers
- **WHEN** the run starts
- **THEN** `onWarning` still receives its text message
- **AND** `onEvent` receives the typed equivalent

#### Scenario: No receiver changes nothing

- **GIVEN** a run without `onEvent`
- **WHEN** it completes
- **THEN** it behaves exactly as a run with a receiver

### Requirement: Child runtime options

#### Scenario: The child can request a garbage collection

- **GIVEN** a run started through the supervisor
- **WHEN** code in the child asks for the garbage-collection request
- **THEN** the request is available

#### Scenario: Host execution arguments are preserved

- **GIVEN** a host runtime started with its own execution arguments
- **WHEN** the supervisor forks the child
- **THEN** those arguments are not removed from the child's execution arguments

### Requirement: Signal forwarding and cleanup

#### Scenario: SIGINT is forwarded and reported

- **GIVEN** an active isolated child
- **WHEN** the parent receives `SIGINT`
- **THEN** the same signal is sent to that child
- **AND** the supervisor waits for child termination
- **AND** it releases the lock before reporting a typed signal failure
- **AND** it does not exit or re-signal the host process

#### Scenario: SIGTERM handlers are scoped to one run

- **GIVEN** pre-existing process signal listeners and one active isolated run
- **WHEN** the child terminates after forwarded `SIGTERM`
- **THEN** only listeners installed by that run are removed
- **AND** all pre-existing listeners remain registered

### Requirement: Index lease release on exit

#### Scenario: Process exit releases the lease

- **GIVEN** the worker holds the index lease
- **WHEN** the process exits
- **THEN** the lease is released

#### Scenario: SIGBREAK releases the lease on Windows

- **GIVEN** the worker is running on Windows and holds the index lease
- **WHEN** the process receives `SIGBREAK`
- **THEN** the lease is released

### Requirement: Internal lock handoff

#### Scenario: Child indexing does not reacquire parent lock

- **GIVEN** the supervisor owns the storage-root lock
- **WHEN** the injected child task opens the provider for indexing
- **THEN** code-graph recognizes the internal parent-lock handoff
- **AND** provider indexing proceeds without a second lock acquisition

#### Scenario: Handoff cannot disable unrelated locking

- **GIVEN** the internal handoff applies to one forked child and storage root
- **WHEN** another process or another storage root starts indexing
- **THEN** normal lock acquisition still occurs for that run
- **AND** no public SDK or CLI input can forge a lock token

### Requirement: Published ESM worker entrypoint

#### Scenario: Built package can fork its own worker

- **GIVEN** publish-shaped `@specd/code-graph` ESM output outside the source tree
- **AND** a built trusted task module
- **WHEN** the public supervisor runs from that installed output
- **THEN** it resolves and forks the emitted child relative to its own module
- **AND** the child imports the task and returns its result
- **AND** resolution does not depend on CWD or repository source paths

#### Scenario: Forced built index exits cleanly after terminal result

- **GIVEN** a built CLI task and a project graph requiring a forced rebuild
- **WHEN** the public supervisor executes the task through its built child entrypoint
- **THEN** the task result is delivered once and the child exits with code 0
- **AND** no post-result signal or native crash is reported
- **AND** no graph lock remains after the operation resolves

#### Scenario: Subprocess native parser teardown exits cleanly after terminal result

- **GIVEN** a built task fixture that parses and retains many native AST roots before release
- **WHEN** the isolated worker executes the task and returns its terminal result
- **THEN** the child process exits with code 0
- **AND** no native finalizer crash or abnormal signal termination occurs during process teardown

#### Scenario: Worker entry is not a public task-selection subpath

- **WHEN** package exports are inspected
- **THEN** the child file is present in published contents
- **AND** no public package export invites hosts to execute or select it directly

### Requirement: Resource cleanup

#### Scenario: Successful run leaves no process resources

- **WHEN** an isolated task completes successfully
- **THEN** the child and IPC channel are closed
- **AND** installed signal and exit listeners are removed
- **AND** the lock file is absent before the promise resolves

#### Scenario: Cleanup remains idempotent under competing terminal events

- **GIVEN** a terminal message and child exit occur in close succession
- **WHEN** both paths request cleanup
- **THEN** child cleanup, listener removal, IPC teardown, and lock release each occur
  at most once
- **AND** no listener installed by another component is removed
