# Tasks: centralize-graph-index-worker

## 1. Internal lock lease and handoff

- [x] 1.1 Add the tokenized graph-index lock lease
      `packages/code-graph/src/infrastructure/index-lock.ts`: `GraphIndexLockLease` and
      `acquireGraphIndexLockLeaseByStoragePath()` — represent one normalized-root lock
      owner and expose idempotent internal release.
      Approach: create with `openSync(..., 'wx')`; write version-1 JSON containing the
      parent PID and `randomUUID()` token; verify the token before deletion.
      (Req: Encapsulated index lock ownership)
- [x] 1.2 Separate supervisor and direct-provider lock cleanup modes
      `packages/code-graph/src/infrastructure/index-lock.ts`: lease acquisition options
      — allow the supervisor lease to install only an exit safety handler while legacy
      provider-owned leases retain release-and-exit SIGINT/SIGTERM behavior.
      Approach: store exact installed handler references on the closure and remove only
      those references during idempotent release.
      (Req: Signal forwarding and cleanup, Resource cleanup)
- [x] 1.3 Add exact-root lock handoff environment creation
      `packages/code-graph/src/infrastructure/index-lock.ts`:
      `createGraphIndexLockHandoffEnv()` — produce internal root/token fields from a
      live lease without exporting them through a barrel.
      Approach: normalize the storage root once and return a frozen string record used
      only in the Code Graph fork options.
      (Req: Internal lock handoff)
- [x] 1.4 Add exact-root lock handoff verification
      `packages/code-graph/src/infrastructure/index-lock.ts`:
      `isGraphIndexLockHandoffForStoragePath()` — validate normalized root, version,
      PID, token, and current lock-file contents.
      Approach: return false on missing/malformed/mismatched data so normal acquisition
      remains the safe fallback; never delete a mismatched lock.
      (Req: Internal lock handoff)
- [x] 1.5 Preserve internal compatibility wrappers and busy behavior
      `packages/code-graph/src/infrastructure/index-lock.ts`:
      `acquireGraphIndexLock`, `acquireGraphIndexLockByStoragePath`, assert/path helpers,
      and `GRAPH_INDEX_LOCK_MESSAGE` — adapt them to the lease without changing the
      fail-fast `GraphBusyError` contract.
      Approach: wrappers return an idempotent release callback where existing internal
      callers require it; no stale-PID recovery or waiting is introduced.
      (Req: Encapsulated index lock ownership)
- [x] 1.6 Replace the provider's boolean lock bypass
      `packages/code-graph/src/composition/code-graph-provider.ts`:
      `CodeGraphProviderImpl.withIndexLock()` — remove
      `SPECD_GRAPH_INDEX_LOCK_HELD` and bypass acquisition only for a verified lease on
      `this.store.storagePath`.
      Approach: call the internal exact-root verifier; otherwise acquire/release the
      normal storage-path lock in `try/finally`.
      (Req: Internal lock handoff)
- [x] 1.7 Preserve reader-side lock assertions
      `packages/code-graph/src/composition/code-graph-provider.ts`:
      `CodeGraphProviderImpl.assertAvailable()` — retain fail-fast unlocked assertion
      before storage-generation checks.
      Approach: add/retain a focused regression assertion; do not apply child handoff
      to read operations.
      (Req: Encapsulated index lock ownership)

## 2. Public values, errors, and internal protocol

- [x] 2.1 Define the public JSON and task contracts
      `packages/code-graph/src/application/ports/isolated-graph-index-runner.ts`:
      `GraphIndexJsonPrimitive`, `GraphIndexJsonValue`,
      `GraphIndexTaskProgressEmitter`, and `GraphIndexTask` — add the exact generic
      signatures and complete JSDoc.
      Approach: leave generics unconstrained for ordinary typed result interfaces;
      enforce the documented JSON model at runtime.
      (Req: High-level isolated execution API, Trusted injected task module)
- [x] 2.2 Define the public isolated-run input and application port
      `packages/code-graph/src/application/ports/isolated-graph-index-runner.ts`:
      `RunIsolatedGraphIndexInput` and `IsolatedGraphIndexRunner.run()` — accept storage
      root, trusted task URL/path, task payload, and optional callback.
      Approach: use an interface with an explicit generic `run` method because the port
      has no invariant constructor fields; expose no Node, lock, process, environment,
      IPC, formatter, or host-exit type.
      (Req: High-level isolated execution API, Progress and result neutrality)
- [x] 2.3 Add JSON-value runtime validation
      `packages/code-graph/src/infrastructure/isolated-index-worker/json-value.ts`:
      `assertGraphIndexJsonValue()` and type guard — reject unsupported primitives,
      prototypes, non-finite numbers, symbol keys, and cycles.
      Approach: recurse through arrays/plain objects with a `WeakSet`; validate public
      input before lock/fork and validate every boundary payload.
      (Req: High-level isolated execution API, Trusted injected task module)
- [x] 2.4 Add worker start and task-contract errors
      `packages/code-graph/src/domain/errors/isolated-graph-index-errors.ts`:
      `GraphIndexWorkerStartError` and `GraphIndexTaskContractError` — add stable names,
      codes, messages, structured constructor fields, and JSDoc.
      Approach: extend `SpecdCodeGraphError`; preserve cause internally without making
      callers parse stderr.
      (Req: Typed failure classification)
- [x] 2.5 Add task-execution and protocol errors
      `packages/code-graph/src/domain/errors/isolated-graph-index-errors.ts`:
      `GraphIndexTaskExecutionError` and `GraphIndexWorkerProtocolError` — distinguish
      injected-task rejection from invalid/late/duplicate IPC.
      Approach: retain nullable task code on execution errors and use upper-snake-case
      package error codes.
      (Req: Typed failure classification, Validated IPC lifecycle)
- [x] 2.6 Add worker exit and signal errors
      `packages/code-graph/src/domain/errors/isolated-graph-index-errors.ts`:
      `GraphIndexWorkerExitError` and `GraphIndexWorkerSignalError` — retain nullable
      exit code and Node signal details.
      Approach: make parent-forwarded SIGINT/SIGTERM machine-distinct from unexpected
      termination and native-crash-like exit.
      (Req: Typed failure classification, Signal forwarding and cleanup)
- [x] 2.7 Add progress-handler error
      `packages/code-graph/src/domain/errors/isolated-graph-index-errors.ts`:
      `GraphIndexProgressHandlerError` — classify a throwing host callback without
      losing cleanup guarantees.
      Approach: capture the callback cause, terminate the active child, wait for exit,
      then reject after finalization.
      (Req: Progress and result neutrality, Resource cleanup)
- [x] 2.8 Define tagged protocol envelopes
      `packages/code-graph/src/infrastructure/isolated-index-worker/protocol.ts`:
      `StartMessage`, `ChildMessage`, `SerializedTaskError`, and protocol constant —
      implement the exact `specd.graph-index.v1` tags and fields.
      Approach: keep all envelope types file-internal to the runtime and out of both
      package barrels.
      (Req: Validated IPC lifecycle)
- [x] 2.9 Implement strict IPC validators
      `packages/code-graph/src/infrastructure/isolated-index-worker/protocol.ts`:
      start/child message validators — reject wrong versions, tags, categories,
      required-field types, extra fields, and invalid JSON payloads.
      Approach: accept `unknown`, use exact own-key sets, and return typed protocol
      failures rather than trusting Node IPC objects.
      (Req: Validated IPC lifecycle)
- [x] 2.10 Implement bounded task-error serialization
      `packages/code-graph/src/infrastructure/isolated-index-worker/protocol.ts`:
      `serializeTaskError()` — project unknown throws into explicit name, message,
      nullable code, and nullable stack.
      Approach: never rely on `JSON.stringify(Error)`; truncate every string field to
      64 KiB so the failure envelope remains bounded and serializable.
      (Req: Typed failure classification)

## 3. Parent supervisor

- [x] 3.1 Define the internal supervisor runtime seam
      `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`:
      `NodeIsolatedGraphIndexRunner`, `IsolatedGraphIndexRuntime`, and the runtime-driven
      execution method — implement the application runner port and inject fork, process
      listener surface, worker URL, and lock acquisition for tests.
      Approach: keep the seam unexported from package barrels; production wrapper
      constructs only the real runtime.
      (Req: Process isolation)
- [x] 3.2 Validate and normalize public supervisor input
      `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`:
      preflight path/data validation — normalize the root and task module before lock.
      Approach: accept only absolute strings or `file:` URLs, reject other schemes and
      relative paths, and validate JSON before any child task can execute.
      (Req: High-level isolated execution API, Trusted injected task module)
- [x] 3.3 Acquire the lease before child creation
      `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`:
      supervisor startup — acquire the exact storage-root lease before calling fork.
      Approach: propagate existing `GraphBusyError` unchanged and ensure a failed
      second acquisition cannot reach the launcher.
      (Req: Encapsulated index lock ownership)
- [x] 3.4 Fork the packaged worker with isolated stdio and IPC
      `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`:
      production launcher — call `child_process.fork` with JSON serialization,
      `['ignore','ignore','ignore','ipc']`, cloned environment, and internal handoff.
      Approach: resolve `isolated-index-worker-child.js` relative to `import.meta.url`;
      pass no CLI argv and expose no in-process/worker-thread branch.
      (Req: Process isolation, Published ESM worker entrypoint)
- [x] 3.5 Send one validated start envelope
      `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`:
      child startup — register listeners first and send one v1 message containing the
      normalized task href and validated input.
      Approach: map synchronous fork/send throws, `error`, or absent IPC to
      `GraphIndexWorkerStartError` and finalize once.
      (Req: Trusted injected task module, Validated IPC lifecycle)
- [x] 3.6 Implement ordered progress delivery
      `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`:
      message handler — forward valid progress synchronously in arrival order or ignore
      it when no callback exists.
      Approach: do not render or transform; map callback throws to the dedicated error,
      terminate the child, and wait for cleanup.
      (Req: Progress and result neutrality)
- [x] 3.7 Implement the one-terminal state machine
      `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`:
      message/exit arbitration — retain the first result/failure but wait for clean
      child exit before settling.
      Approach: duplicate terminal, late progress, malformed messages, or unsupported
      protocol record a protocol error and terminate/wait; settlement is guarded once.
      (Req: Validated IPC lifecycle)
- [x] 3.8 Classify exit paths with structured details
      `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`:
      exit handler — resolve only result plus code 0; map task terminal, no-terminal,
      non-zero, unexpected signal, and result-then-crash paths distinctly.
      Approach: parent-forwarded signals take precedence as
      `GraphIndexWorkerSignalError`; never parse stderr or call `process.exit`.
      (Req: Typed failure classification)
- [x] 3.9 Install scoped SIGINT/SIGTERM forwarding
      `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`:
      active-run signal handlers — forward the same signal once and await child exit.
      Approach: record the forwarded signal, do not exit/re-signal the host, and remove
      only the two exact listener references installed by this run.
      (Req: Signal forwarding and cleanup)
- [x] 3.10 Centralize idempotent supervisor finalization
      `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`:
      `finalize()` — detach owned child/signal listeners, disconnect IPC, clear the
      child reference, and release the lease before settling.
      Approach: one boolean/promise guard makes competing message/error/exit cleanup
      paths execute resources at most once.
      (Req: Encapsulated index lock ownership, Resource cleanup)
- [x] 3.11 Expose the production high-level wrapper
      `packages/code-graph/src/composition/run-isolated-graph-index.ts`:
      `runIsolatedGraphIndex()` — construct one concrete Node runner with the real
      runtime per invocation and return its typed generic result.
      Approach: composition is the only public layer importing infrastructure; the
      wrapper performs no output formatting, process exit, retry, queue, timeout, or
      host-global exit mutation.
      (Req: High-level isolated execution API)

## 4. Child runtime and Code Graph packaging

- [x] 4.1 Bootstrap one IPC start request in the child
      `packages/code-graph/src/infrastructure/isolated-index-worker/isolated-index-worker-child.ts`:
      process message lifecycle — require IPC and accept exactly one valid start
      envelope.
      Approach: invalid/multiple starts yield one protocol failure terminal; no CLI
      parsing or source-tree lookup is permitted.
      (Req: Validated IPC lifecycle)
- [x] 4.2 Load and validate the trusted task module
      `packages/code-graph/src/infrastructure/isolated-index-worker/isolated-index-worker-child.ts`:
      dynamic import — import the exact file URL and require callable named export
      `runGraphIndexTask`.
      Approach: missing/non-callable export or import failure produces one
      `task-contract` terminal before any provider is opened.
      (Req: Trusted injected task module)
- [x] 4.3 Execute the task with validated progress
      `packages/code-graph/src/infrastructure/isolated-index-worker/isolated-index-worker-child.ts`:
      task invocation — invoke once with unchanged input and an emitter that validates
      and sends each progress value.
      Approach: non-serializable progress is a protocol terminal; task throw/rejection
      is a task-execution terminal.
      (Req: Trusted injected task module, Progress and result neutrality)
- [x] 4.4 Validate and send one terminal result
      `packages/code-graph/src/infrastructure/isolated-index-worker/isolated-index-worker-child.ts`:
      completion path — validate the returned JSON value, send exactly one result, and
      disconnect cleanly.
      Approach: use a one-terminal guard, set `exitCode = 0`, never call `process.exit`,
      and use non-zero exit when IPC send/disconnect prevents terminal delivery.
      (Req: Validated IPC lifecycle, Resource cleanup)
- [x] 4.5 Add the worker to all Code Graph build variants
      `packages/code-graph/package.json`: build, build:dev, build:debug, and dev scripts
      — add the child source as a stable `tsup` ESM entry.
      Approach: emit it under `dist/`, include it through the existing `files` rule,
      and do not add an `exports` subpath.
      (Req: Published ESM worker entrypoint)
- [x] 4.6 Curate the Code Graph public barrel
      `packages/code-graph/src/public.ts`: named exports — add only the high-level
      composition function, application-port JSON/task/input types, and typed failures.
      Approach: explicitly omit raw lock, handoff, runtime seam, process adapter, child
      bootstrap, and IPC envelopes.
      (Req: High-level isolated execution API, Published ESM worker entrypoint)
- [x] 4.7 Align the Code Graph internal barrel
      `packages/code-graph/src/index.ts`: exports — retain raw lock helpers needed by
      internal provider/tests and add the curated worker surface without exporting raw
      protocol/child/runtime-seam symbols.
      Approach: preserve every existing composition/model/use-case export.
      (Req: Encapsulated index lock ownership)

## 5. SDK facade

- [x] 5.1 Re-export the high-level worker from SDK
      `packages/sdk/src/index.ts`: curated Code Graph re-export list — add
      `runIsolatedGraphIndex`, public worker value/task/input types, and typed errors.
      Approach: use explicit named exports from `@specd/code-graph`; add no SDK wrapper,
      child-process import, or lock call.
      (Req: High-level isolated execution API)
- [x] 5.2 Remove raw lock surface from SDK
      `packages/sdk/src/index.ts` and generated declarations: re-export list — remove or
      prevent `acquireGraphIndexLock`, `assertGraphIndexUnlocked`, lock paths,
      release/lease/token contracts, and raw IPC contracts.
      Approach: keep graph health, versions, results, provider types, and
      `runIndexProjectGraph` unchanged.
      (Req: Encapsulated index lock ownership)

## 6. Packaged CLI graph-index task

- [x] 6.1 Define serializable CLI task descriptors
      `packages/cli/src/graph-index-task.ts`:
      `CliGraphIndexContextDescriptor`, `CliGraphIndexTaskInput`, and
      `CliGraphIndexProgress` — add exact configured/bootstrap discriminated unions.
      Approach: configured stores one absolute config file path; bootstrap stores
      explicit project/VCS roots; include only force and optional exclusions.
      (Req: Trusted injected task module)
- [x] 6.2 Reconstruct configured SDK context in the task
      `packages/cli/src/graph-index-task.ts`: configured branch of
      `runGraphIndexTask` — call `openSpecdHost` with the exact config path and
      `buildCliKernelOptions()`.
      Approach: bind the returned config/kernel/provider factory; do not discover a
      different project or preserve parent object identity.
      (Req: Trusted injected task module)
- [x] 6.3 Reconstruct explicit bootstrap SDK context in the task
      `packages/cli/src/graph-index-task.ts`: bootstrap branch of
      `runGraphIndexTask` — create bootstrap config from exact roots and call
      `createSdkContext` with CLI kernel options.
      Approach: never perform config discovery or substitute configured state.
      (Req: Trusted injected task module)
- [x] 6.4 Invoke SDK project indexing exactly once
      `packages/cli/src/graph-index-task.ts`: `runGraphIndexTask` — call
      `runIndexProjectGraph` once with force/exclusions and adapt progress to
      `{ percent, phase }`.
      Approach: return `RunIndexProjectGraphResult` unchanged; import no Commander,
      formatter, process, IPC, lock, or `@specd/code-graph` module.
      (Req: Progress and result neutrality)
- [x] 6.5 Publish the CLI task as a separate ESM build entry
      `packages/cli/package.json`: build, build:dev, build:debug, and dev scripts — add
      `src/graph-index-task.ts` so `dist/graph-index-task.js` is shipped.
      Approach: keep it out of CLI options and package subpath exports; the command
      selects it with a module-relative URL.
      (Req: Published ESM worker entrypoint)

## 7. CLI command migration and package boundary

- [x] 7.1 Delete CLI-owned process and lock supervision
      `packages/cli/src/commands/graph/index-graph.ts`: imports, `runIndexWorker`, signal
      closures, spawn options, and environment branches — remove them completely.
      Approach: the file must contain no `node:child_process`, raw lock, worker env, or
      cleanup implementation after the edit.
      (Req: Encapsulated index lock ownership, Process isolation)
- [x] 7.2 Serialize configured and bootstrap command context
      `packages/cli/src/commands/graph/index-graph.ts`: action handler — derive the exact
      discriminated task descriptor from `resolveGraphCliContext`.
      Approach: require non-null configured `configFilePath`; preserve explicit
      bootstrap roots; treat impossible missing fields as code-1 CLI validation.
      (Req: Trusted injected task module)
- [x] 7.3 Delegate one isolated run through SDK
      `packages/cli/src/commands/graph/index-graph.ts`: action handler — invoke SDK
      `runIsolatedGraphIndex` exactly once with `context.config.configPath`,
      `new URL('./graph-index-task.js', import.meta.url)`, descriptor, and index input.
      Approach: pass force/exclusions unchanged and provide a progress callback only
      for text mode.
      (Req: High-level isolated execution API, Progress and result neutrality)
- [x] 7.4 Preserve CLI result and failure presentation
      `packages/cli/src/commands/graph/index-graph.ts`: action handler and
      `formatTextIndexResult()` — keep current success fields, text summary,
      JSON/TOON output, per-file code-0 errors, and fatal code-3 mapping.
      Approach: render only in the parent; use typed worker error messages through the
      existing `cliError` path and emit no protocol traffic.
      (Req: Typed failure classification, Progress and result neutrality)
- [x] 7.5 Remove the CLI direct Code Graph dependency
      `packages/cli/package.json`: dependencies — delete `@specd/code-graph` after all
      command/task/test imports use SDK only.
      Approach: verify source and built output contain no direct Code Graph runtime
      import; preserve all unrelated dependencies.
      (Req: Encapsulated index lock ownership)

## 8. Code Graph verification suites

- [x] 8.1 Test JSON and protocol validation
      `packages/code-graph/test/infrastructure/isolated-index-worker/protocol.spec.ts`:
      new suite — cover accepted JSON and every rejected value/envelope/version/field.
      Approach: include cyclic, function, symbol, bigint, NaN/Infinity, class instance,
      extra-key, unknown-tag, and bounded-error fixtures.
      (Req: Trusted injected task module, Validated IPC lifecycle)
- [x] 8.2 Test successful supervisor behavior and progress order
      `packages/code-graph/test/infrastructure/isolated-index-worker/supervisor.spec.ts`:
      runtime-seam cases — assert different child boundary abstraction, unchanged
      result, A/B/C progress, absent callback behavior, no output, and no host exit.
      Approach: drive deterministic fake child events and assert cleanup occurs before
      promise settlement.
      (Req: High-level isolated execution API, Process isolation, Progress and result neutrality)
- [x] 8.3 Test busy-before-fork and release coverage
      `packages/code-graph/test/infrastructure/isolated-index-worker/supervisor.spec.ts`:
      lock cases — assert concurrent same-root failure creates no child and every
      terminal family releases once so a subsequent run acquires.
      Approach: parameterize success, task, fork, IPC, premature/non-zero/signal, and
      crash-like paths with instrumented acquire/release counters.
      (Req: Encapsulated index lock ownership, Resource cleanup)
- [x] 8.4 Test terminal and exit arbitration
      `packages/code-graph/test/infrastructure/isolated-index-worker/supervisor.spec.ts`:
      protocol/exit cases — cover malformed, duplicate, late, result-then-crash, code-0
      without terminal, non-zero, unexpected signal, and callback throw.
      Approach: assert exact error subclass/code/details and at-most-once settlement.
      (Req: Validated IPC lifecycle, Typed failure classification)
- [x] 8.5 Test scoped signal forwarding
      `packages/code-graph/test/infrastructure/isolated-index-worker/signals.spec.ts`:
      SIGINT/SIGTERM cases — assert same-signal child kill, wait-before-reject,
      structured details, preserved pre-existing listeners, and no host exit.
      Approach: use an injected process event emitter and compare exact listener
      identities before/after cleanup.
      (Req: Signal forwarding and cleanup)
- [x] 8.6 Test lock lease and handoff invariants
      `packages/code-graph/test/infrastructure/index-lock.spec.ts`: lease/handoff cases
      — cover JSON contents, token-checked idempotent release, exact root, mismatched
      token, malformed file, unrelated root, and current busy message.
      Approach: isolate each case in a temporary storage root and restore environment
      fields after every test.
      (Req: Encapsulated index lock ownership, Internal lock handoff)
- [x] 8.7 Test provider lock handoff and reader asymmetry
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`: provider cases
      — prove indexing skips reacquisition only for matching lease and reads still fail
      while the parent lease exists.
      Approach: include a second storage root to prove handoff cannot disable unrelated
      locking.
      (Req: Internal lock handoff)
- [x] 8.8 Add worker task/process fixtures
      `packages/code-graph/test/fixtures/isolated-index-worker/`: fixture modules — add
      valid PID/progress/result, invalid contract, non-serializable output,
      duplicate-terminal, clean-no-terminal, and abnormal-exit behaviors.
      Approach: build fixtures as ESM and keep them out of package exports.
      (Req: Process isolation, Trusted injected task module)
- [x] 8.9 Verify publish-shaped ESM worker resolution
      `packages/code-graph/test/infrastructure/isolated-index-worker/dist.spec.ts`: built
      package test — execute public supervisor from another CWD with a built task and
      assert child PID differs.
      Approach: inspect published files/exports, require the child in `dist`, and assert
      no child public subpath or source/loader dependency.
      (Req: Published ESM worker entrypoint)
- [x] 8.10 Verify the curated Code Graph barrel
      `packages/code-graph/test/barrel.spec.ts`: export tests — assert high-level worker
      and errors are available and raw lock/handoff/IPC/process/child symbols are not.
      Approach: combine runtime key checks with compile-time type imports and generated
      declaration inspection.
      (Req: High-level isolated execution API, Encapsulated index lock ownership)
- [x] 8.11 Run the existing Code Graph blast-radius regressions
      `packages/code-graph/test/application/use-cases/` and
      `packages/code-graph/test/composition/`: existing suites — confirm provider,
      workspace indexing, staleness, fingerprint, and lifecycle behavior remains green.
      Approach: change fixtures only where the removed boolean handoff was an internal
      test assumption; do not weaken assertions.
      (Req: Internal lock handoff)

## 9. SDK and CLI verification suites

- [x] 9.1 Verify SDK worker exports and raw-lock absence
      `packages/sdk/test/barrel.spec.ts`: SDK barrel cases — assert the high-level worker
      and existing health/result/version exports, and reject acquire/assert/path/token/
      IPC symbols in runtime and declarations.
      Approach: demonstrate a host can type the isolated call with only `@specd/sdk`.
      (Req: High-level isolated execution API, Encapsulated index lock ownership)
- [x] 9.2 Test configured CLI task reconstruction
      `packages/cli/test/graph-index-task.spec.ts`: configured case — assert exact config
      path, CLI kernel options, equivalent provider context, and one indexing call.
      Approach: mock SDK composition boundaries but execute the real task function.
      (Req: Trusted injected task module)
- [x] 9.3 Test bootstrap CLI task reconstruction
      `packages/cli/test/graph-index-task.spec.ts`: bootstrap case — assert exact
      project/VCS roots, no discovery, force/exclusion forwarding, progress adaptation,
      and unchanged result.
      Approach: reject any configured-host substitution and direct Code Graph import.
      (Req: Trusted injected task module, Progress and result neutrality)
- [x] 9.4 Test command delegation and context descriptors
      `packages/cli/test/commands/graph-index.spec.ts`: command cases — assert one SDK
      isolated call with exact storage root/task URL/configured-or-bootstrap descriptor
      and unchanged force/exclusions.
      Approach: mock only `runIsolatedGraphIndex`; remove fork, lock, host-context, and
      no-worker environment setup.
      (Req: High-level isolated execution API)
- [x] 9.5 Test text-only progress and output compatibility
      `packages/cli/test/commands/graph-index.spec.ts`: presentation cases — invoke the
      passed callback for text and assert existing summary; assert JSON/TOON omit the
      callback and contain one unchanged structured result.
      Approach: include per-file errors as a successful code-0 result.
      (Req: Progress and result neutrality)
- [x] 9.6 Test command validation and typed failure mapping
      `packages/cli/test/commands/graph-index.spec.ts`: failure cases — retain mutual
      exclusion/context code 1 and map busy/start/contract/task/protocol/exit/signal
      worker errors to presentation-safe code 3.
      Approach: assert no worker call on validation failure and no message-text parsing
      for classification.
      (Req: Typed failure classification)
- [x] 9.7 Test the production command has no isolation bypass
      `packages/cli/test/commands/graph-index.spec.ts`: source/package inspection —
      assert removed worker environment names, child-process imports, raw lock imports,
      and direct Code Graph dependency.
      Approach: use explicit SDK mocks/runtime seams; never set a production no-worker
      variable.
      (Req: Process isolation)
- [x] 9.8 Convert CLI integration to built isolated execution
      `packages/cli/test/commands/graph-index-integration.spec.ts`: end-to-end bootstrap
      case — build/run publish-shaped CLI rather than importing source with an in-process
      bypass.
      Approach: verify `--path --force`, output, task completion, and absent lock using
      the real Code Graph child and packaged CLI task.
      (Req: Process isolation, Published ESM worker entrypoint)
- [x] 9.9 Add concurrent CLI integration coverage
      `packages/cli/test/commands/graph-index-integration.spec.ts`: same-root race case
      — hold the first task, invoke a second command, and assert busy code 3 before a
      second task starts.
      Approach: coordinate with a deterministic fixture marker and release the first
      process in `finally`.
      (Req: Encapsulated index lock ownership)

## 10. Documentation

- [x] 10.1 Document the public Code Graph worker service
      `docs/code-graph/services.md`: lock-management section — replace public raw-lock
      examples with `runIsolatedGraphIndex`, task trust boundary, JSON contract, typed
      failures, and the statement that lock details are internal.
      Approach: show host-facing SDK/Code Graph usage without internal environment or
      IPC examples.
      (Req: High-level isolated execution API, Encapsulated index lock ownership)
- [x] 10.2 Correct Code Graph use-case ownership
      `docs/code-graph/use-cases.md`: `IndexProjectGraph` consumers/ownership text —
      describe Code Graph-owned worker/lock and SDK-composed injected task.
      Approach: remove the claim that CLI retains lock acquisition and subprocess
      isolation.
      (Req: Process isolation)
- [x] 10.3 Document the SDK facade boundary
      `docs/sdk/index.md`: CLI mapping and re-export sections — add
      `runIsolatedGraphIndex`, retain `runIndexProjectGraph`, and state that raw lock/
      IPC primitives are not SDK APIs.
      Approach: distinguish parent supervisor call from child task orchestration.
      (Req: High-level isolated execution API)
- [x] 10.4 Update CLI graph-index lifecycle documentation
      `docs/cli/cli-reference.md`: graph-index worker and shared-lock paragraphs — state
      Code Graph ownership, scoped signal forwarding, unchanged busy semantics, and no
      public in-process mode.
      Approach: remove all three legacy environment variable names while preserving
      flags, output schema, repair, and reader behavior.
      (Req: Signal forwarding and cleanup, Internal lock handoff)
- [x] 10.5 Record the cross-package worker decision in ADR-0027
      `docs/adr/0027-code-graph-owned-index-worker.md`: new MADR — document context,
      drivers, considered Code Graph/SDK/CLI/separate-package options, chosen ownership,
      consequences, and automated/manual confirmation.
      Approach: include required frontmatter, `### Confirmation`, and `### Spec` links
      to `code-graph:isolated-index-worker`, `code-graph:composition`,
      `sdk:composition`, and `cli:graph-index`; link the producing ADR from the new spec.
      (Req: High-level isolated execution API, Process isolation)

## 11. Validation and end-to-end acceptance

- [x] 11.1 Run Code Graph unit, type, lint, and build validation
      `packages/code-graph`: package checks — run test, typecheck, lint, and build.
      Approach: require the worker child in `dist`, passing barrel/declaration checks,
      and no regression in the CRITICAL lock/provider blast radius.
      (Req: Resource cleanup, Published ESM worker entrypoint)
- [x] 11.2 Run SDK unit, type, lint, and build validation
      `packages/sdk`: package checks — run test, typecheck, lint, and build.
      Approach: inspect generated declarations for the high-level surface and absence
      of every raw lock/protocol contract.
      (Req: High-level isolated execution API, Encapsulated index lock ownership)
- [x] 11.3 Run CLI unit, type, lint, and build validation
      `packages/cli`: package checks — run test, typecheck, lint, and build.
      Approach: require the packaged graph-index task in `dist` and no direct
      Code Graph dependency/import.
      (Req: Process isolation, Trusted injected task module)
- [x] 11.4 Manually verify text and structured success output
      built CLI: `graph index --format text|json|toon --force` — confirm ordered text
      progress, unchanged results, parseable structured output without protocol noise,
      exit 0, and no residual lock.
      Approach: run through `node packages/cli/dist/index.js` from a real repository.
      (Req: Progress and result neutrality, Resource cleanup)
- [x] 11.5 Manually verify same-root concurrency
      built CLI: two overlapping graph-index commands — confirm the second reports the
      existing retry-later message, exits 3, and starts no second task process.
      Approach: keep the first index active long enough to inspect the lock and process
      list, then allow it to finish normally.
      (Req: Encapsulated index lock ownership)
- [x] 11.6 Manually verify signal cleanup
      built CLI: active runs receiving SIGINT and SIGTERM — confirm child termination,
      typed host failure mapping, lock deletion, and successful subsequent indexing.
      Approach: exercise each signal separately and verify the supervising process does
      not leave listeners, child, IPC, or lock resources.
      (Req: Signal forwarding and cleanup, Resource cleanup)
- [x] 11.7 Verify publish-shaped resolution outside the monorepo CWD
      packed Code Graph/SDK/CLI artifacts: temporary installation — run graph index and
      confirm both worker and task resolve solely from installed `dist` files.
      Approach: inspect package exports to ensure the child/task have no public
      selection subpath and no TypeScript loader/source path is needed.
      (Req: Published ESM worker entrypoint)
- [x] 11.8 Run final package-boundary and documentation audit
      repository source, manifests, generated declarations, and docs — confirm one
      ownership story and no SDK/CLI raw lock usage or export.
      Approach: search for legacy environment names, raw lock imports, contradictory
      CLI ownership statements, and CLI `@specd/code-graph` dependency; any match must
      be justified as internal Code Graph test/implementation only.
      (Req: Encapsulated index lock ownership, Process isolation)

## 12. Corrective lifecycle and compliance closure

- [x] 12.1 Settle initial IPC-send failures without waiting indefinitely for child exit
      `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts` and
      `packages/code-graph/test/infrastructure/isolated-index-worker/supervisor.spec.ts`:
      make the failed initial `send` callback a bounded terminal path and test a child
      that never emits `exit`.
      Approach: preserve best-effort termination while finalizing IPC, listeners, and the
      lease exactly once before rejecting `GraphIndexWorkerStartError`.
      (Req: Encapsulated index lock ownership, Resource cleanup)
- [x] 12.2 Replace force-driven physical SQLite recreation with logical full reindex
      `packages/code-graph/src/composition/code-graph-provider.ts`, indexer inputs, and
      SQLite lifecycle tests: make `force` clear healthy contents and bypass incremental
      reuse without close/remove/reopen.
      Approach: keep physical recreation out of provider `index({ force: true })`; prove
      every selected file is reconsidered and worker shutdown needs no `process.exit()`.
      (Req: CodeGraphProvider facade, Supports forced logical reindex)
- [x] 12.3 Add built-worker terminal and fixture regressions
      `packages/code-graph/test/infrastructure/isolated-index-worker/`: execute every
      built task fixture through the public supervisor, including send failure without
      exit, result-then-abnormal-exit, and forced index clean exit.
      Approach: run from publish-shaped output/CWD and assert result, typed failure,
      cleanup, and single-release outcomes.
      (Req: Validated IPC lifecycle, Published ESM worker entrypoint)
- [x] 12.4 Strengthen SDK declaration and package-surface checks
      `packages/sdk/test/barrel.spec.ts` and a publish-shaped TypeScript consumer:
      compile-import every worker contract/error and reject lock, lease, release, token,
      and raw IPC declarations.
      Approach: confirm the intended `src/domain` and internal-`shared` root-barrel
      rules against built `dist` metadata.
      (Req: High-level isolated execution API)
- [x] 12.5 Add real-child structured CLI regressions
      `packages/cli/test/commands/graph-index-integration.spec.ts`: run built
      `--format json`, `--format toon`, and `--force` indexing through the packaged
      child task.
      Approach: assert one parseable final structured result, no protocol/progress
      leakage, exit 0 after force, and no residual lock.
      (Req: Progress and result neutrality, Process isolation)
- [x] 12.6 Re-run focused and package validation
      `packages/code-graph`, `packages/sdk`, and `packages/cli`: run focused regressions,
      test, lint, typecheck, and build after the corrective wave.
      Approach: record the force-path command and prove no unresolved lint/type errors.
      (Req: Resource cleanup, Published ESM worker entrypoint)

## 13. Force-only typed storage recovery follow-up

- [x] 13.1 Add typed recoverable-open and closed-recreate errors
      `packages/code-graph/src/domain/errors/` and public barrels: define
      `GraphStorageRecoveryRequiredError` and `GraphStoreRecreateRequiresClosedError`.
      Approach: map only corruption and non-migratable schema open failures to the first
      type; export both from the curated Code Graph and SDK surfaces with stable codes.
      (Req: Connection lifecycle, CodeGraphProvider facade)
- [x] 13.2 Enforce closed-only physical recreation in GraphStore and SQLite
      `packages/code-graph/src/domain/ports/graph-store.ts`, SQLite store/database and
      worker-client lifecycle tests: reject recreation while open, remove storage only
      after close, rotate generation, and leave it closed.
      Approach: ensure partial `open()` failure closes handles before throwing; never
      translate permission/configuration/native/I/O failures into deletion authority.
      (Req: Store recreation, Destructive recreation)
- [x] 13.3 Add generic one-retry open recovery to SDK lifecycle helper
      `packages/sdk/src/composition/with-open-graph-provider.ts` and unit tests: add
      `recoverOpenFailure(error, provider): Promise<boolean>`.
      Approach: close after the first open failure, invoke callback on the closed
      provider, retry parameterless `open()` once only after `true`, and preserve the
      original failure/afterClose ordering otherwise.
      (Req: withOpenGraphProvider signature, Error propagation)
- [x] 13.4 Wire force-only recovery in SDK project indexing
      `packages/sdk/src/orchestration/run-index-project-graph.ts` and tests: select the
      recovery callback only for transient `force` runs and the typed storage error.
      Approach: callback calls `provider.recreate()` then returns true; explicit
      providers, false force, recovery errors, and second open errors never retry.
      (Req: runIndexProjectGraph orchestration, Repair lifecycle passthrough)
- [x] 13.5 Update CLI, real-child, and documentation regressions
      CLI force tests, Code Graph/SDK tests, `docs/code-graph/services.md`,
      `docs/code-graph/use-cases.md`, `docs/sdk/index.md`, and `docs/cli/cli-reference.md`:
      document and verify logical force plus typed force-only recovery.
      Approach: run healthy force twice and corrupted-schema force once with bounded
      child exit/lock assertions; prove normal reads and non-recoverable open errors do
      not delete storage.
      (Req: Command signature, Visible incompatibility repair, Published ESM worker entrypoint)

## 14. Full-verification compliance follow-up

- [x] 14.1 Remove the specialized SDK open escape hatch
      `packages/sdk/src/composition/with-open-graph-provider.ts`: remove `TOpen`,
      `WithOpenGraphProviderOptions.open`, and the callback open-result argument.
      Approach: invoke parameterless `provider.open()` for both attempts and retain
      only `beforeOpen`, `afterClose`, and `recoverOpenFailure` lifecycle options.
      (Req: withOpenGraphProvider signature)
- [x] 14.2 Guarantee final cleanup after terminal recovery failures
      `packages/sdk/src/composition/with-open-graph-provider.ts`: recovery callback and
      retry-open catch paths — close defensively before notifying `afterClose`.
      Approach: share a best-effort final-close path that preserves the primary error,
      never calls recovery twice, and never attempts a third open.
      (Req: Error propagation)
- [x] 14.3 Replace obsolete lifecycle tests and cover terminal cleanup
      `packages/sdk/test/composition/with-open-graph-provider.spec.ts`: remove custom-open
      expectations and add recovery-throw/retry-open-failure ordering assertions.
      Approach: assert final close precedes exactly one `afterClose`, primary error is
      preserved, and open/recovery invocation counts remain bounded.
      (Req: withOpenGraphProvider signature, Error propagation)
- [x] 14.4 Cover corrupt and ordinary SQLite open failures
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: add
      invalid-database bytes and a non-recoverable open failure regression.
      Approach: assert only corrupt storage yields typed recovery authority; ordinary
      failures preserve identity, data/generation, and never recreate.
      (Req: Connection lifecycle, Destructive recreation)
- [x] 14.5 Re-run full validation and real forced indexing
      SDK, Code Graph, CLI, and repository hooks: run focused tests, lint, typecheck,
      global tests, and a packaged `graph index --force` command.
      Approach: require clean child exit, no lock residue, one retry maximum, and zero
      unresolved lint/type errors before verification resumes.
      (Req: Error propagation, Visible incompatibility repair)

## 15. Full-verification architecture and scenario follow-up

- [x] 15.1 Delegate prepared SDK indexing through the Code Graph use case
      `packages/sdk/src/orchestration/run-index-project-graph.ts`:
      `runIndexProjectGraph` / local indexing closure — replace direct `provider.index()`
      invocation with one `createIndexProjectGraph().execute()` call for both explicit
      and transient providers.
      Approach: construct the use case after project input preparation; pass the
      already-open provider, selected workspaces, VCS, graph config, force, and progress
      unchanged; retain SDK-only full-rebuild result decoration and force-only recovery.
      (Req: runIndexProjectGraph orchestration, Result passthrough)
- [x] 15.2 Assert the prepared-provider use-case seam
      `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`:
      `createIndexProjectGraph` mock — assert construction and `execute()` input for
      transient and explicit provider paths.
      Approach: make the existing mocked factory observable; prove `provider.index()`
      is not the SDK orchestration seam, and retain force-recovery one-retry assertions.
      (Req: runIndexProjectGraph orchestration, Repair lifecycle passthrough)
- [x] 15.3 Re-run corrected lifecycle and force verification
      SDK orchestration tests, Code Graph store tests, repository hooks, and packaged
      `graph index --force`: confirm the new delegation and closed-only recreation
      scenarios without regressions.
      Approach: run focused SDK and SQLite suites, global lint/typecheck/tests, and one
      real forced child-process index with clean exit and zero index errors.
      (Req: runIndexProjectGraph orchestration, Destructive recreation, Store recreation)
