# Tasks: hook-live-progress

## 1. Core progress contract

- [x] 1.1 Extend the hook runner port with progress callback types
      `packages/core/src/application/ports/hook-runner.ts`: `HookRunner`, `HookRunnerProgressEvent`, `OnHookRunnerProgress` — add the optional progress callback contract without changing the final `HookResult` return type
      Approach: define additive `output` and `heartbeat` event unions and update `run(command, variables, onProgress?)` to keep existing callers source-compatible
      (Req: Live progress reporting)

- [x] 1.2 Expand `RunStepHooks` progress events to include output and heartbeat
      `packages/core/src/application/use-cases/run-step-hooks.ts`: `HookProgressEvent`, `execute()`, `_executeHooks()` — relay shell progress while preserving final hook entries and fail-fast/fail-soft semantics
      Approach: map `HookRunner` progress into `hook-output` and `hook-heartbeat` events, keep `hook-start` and `hook-done`, and do not let observational events affect success/failure logic
      (Req: Runner progress relay, Req: Result shape)

- [x] 1.3 Propagate richer hook progress through transition events
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionProgressEvent`, hook-progress adapter inside `execute()` — include phase-aware output and heartbeat events for transition callers
      Approach: reuse one phase-decorating adapter so source.post and target.pre both emit the same hook event schema with `phase`
      (Req: Progress output, Req: Transition hook observability)

## 2. Streaming shell execution

- [x] 2.1 Replace buffered shell execution with streaming subprocess handling
      `packages/core/src/infrastructure/node/hook-runner.ts`: `NodeHookRunner.run()` — switch from `execFile(..., callback)` to streaming execution so progress exists before process exit
      Approach: use `spawn(shell, [shellFlag, expanded], { stdio: ['ignore', 'pipe', 'pipe'] })`, preserve current shell resolution and collect final stdout/stderr for `HookResult`
      (Req: Live progress reporting)

- [x] 2.2 Emit line-based stdout and stderr progress events
      `packages/core/src/infrastructure/node/hook-runner.ts`: `NodeHookRunner.run()` stream handlers — normalize chunked output into complete logical lines for downstream presenters
      Approach: maintain one line buffer per stream, emit `output` events on completed lines, and flush trailing partial lines before resolving
      (Req: Live progress reporting, scenario: runner streams stdout and stderr activity)

- [x] 2.3 Emit quiet-process heartbeats while the child is still alive
      `packages/core/src/infrastructure/node/hook-runner.ts`: heartbeat timer logic — make long-running silent hooks observable even with no new stdout/stderr
      Approach: start a `5000 ms` timer on spawn, emit `heartbeat` only after a quiet interval, and clear timers on `close` or `error`
      (Req: Live progress reporting, scenario: quiet hook still reports liveness)

## 3. Shared CLI hook presenter

- [x] 3.1 Create a shared hook-progress presenter helper
      `packages/cli/src/commands/change/_hook-progress-presenter.ts`: `createHookProgressPresenter()`, `HookProgressPresenter`, `HookPresenterEvent` — centralize all equivalent hook rendering decisions used by both commands
      Approach: store per-hook command, tail lines, elapsed time, combined arrival-ordered output, and final success/failure metadata behind one presenter API
      (Req: Shared hook progress presentation)

- [x] 3.2 Implement interactive text rendering that preserves history
      `packages/cli/src/commands/change/_hook-progress-presenter.ts`: text rendering branch — emit append-only progress lines that remain visible in order
      Approach: write `[running]`, `command:`, streamed output lines, deduplicated `[still running]` heartbeats, and `[done]/[failed]` completion markers to `stderr` without any TTY redraw path
      (Req: Text output format, Req: Progress output)

- [x] 3.3 Implement structured stdout stream emission for `json|toon`
      `packages/cli/src/commands/change/_hook-progress-presenter.ts`, `packages/cli/src/formatter.ts`: structured presenter and serializer path — keep machine-readable progress and terminal results in one stream protocol
      Approach: serialize each hook progress record as one line on stdout-compatible streams, reserve stderr for non-structured diagnostics, and emit terminal `complete` records through the command handlers
      (Req: Long-running hook observability, Req: JSON output format, Req: Shared hook progress presentation)

- [x] 3.4 Finalize success and failure blocks with different output retention rules
      `packages/cli/src/commands/change/_hook-progress-presenter.ts`: `finalizeHook()` — keep success concise and failures complete
      Approach: show the last 10 merged lines for successful hooks, but print the full combined output for failed hooks so failure context is never truncated away
      (Req: Text output format, Req: Post-hook failure warning)

## 4. Command integration

- [x] 4.1 Wire `change run-hooks` to the shared presenter
      `packages/cli/src/commands/change/run-hooks.ts`: command action handler — replace command-local `ok:`/`failed:` rendering with shared progress handling plus unchanged final exit semantics
      Approach: build the presenter up front, pass `onProgress` into `kernel.changes.runStepHooks.execute(...)`, finalize each executed hook in order, and keep exit code `2` for hook failures
      (Req: Delegates to RunStepHooks, Req: Exit code 2 on hook failure, Req: Shared hook progress presentation)

- [x] 4.2 Wire `change transition` hook events to the same presenter
      `packages/cli/src/commands/change/transition.ts`: progress renderer construction — route every `hook-*` transition event through the shared helper while keeping transition-only diagnostics separate
      Approach: replace the command-local hook renderer with a composition of transition-specific text diagnostics or structured `change-transition` stream records plus the shared hook presenter for hook events
      (Req: Hook execution, Req: Progress output, Req: Shared hook progress presentation)

- [x] 4.3 Preserve transition repair-guide and final result behavior
      `packages/cli/src/commands/change/transition.ts`: failure and success branches — ensure richer hook progress does not change transition repair semantics
      Approach: keep final stdout success payloads, keep `InvalidStateTransitionError` repair-guide flow, and keep hook-triggered transition failures on exit code `2` while preserving the transition command's repair-guide path
      (Req: Output on success, Req: Invalid transition error, Req: Post-hook failure warning)

## 5. Automated test coverage

- [x] 5.1 Add streaming and heartbeat tests for `NodeHookRunner`
      `packages/core/test/infrastructure/node/hook-runner.spec.ts`: new `run()` cases — verify incremental output emission, quiet heartbeats, and unchanged final `HookResult`
      Approach: run slow shell commands that print in stages, capture progress callback events, and assert final stdout/stderr still contain the complete buffered output
      (Req: Live progress reporting)

- [x] 5.2 Add `RunStepHooks` progress relay tests
      `packages/core/test/application/use-cases/run-step-hooks.spec.ts`: new progress-focused describe block — verify event ordering, quiet-hook liveness, and unchanged fail-fast/post-hook semantics
      Approach: use stub `HookRunner` implementations that invoke `onProgress` before returning `HookResult`, then assert `hook-start`, `hook-output`, `hook-heartbeat`, and `hook-done` sequences
      (Req: Runner progress relay, Req: Result shape)

- [x] 5.3 Add `TransitionChange` phase-aware hook progress tests
      `packages/core/test/application/use-cases/transition-change.spec.ts`: transition progress assertions — verify output and heartbeat events preserve `phase`
      Approach: stub `RunStepHooks` to emit richer progress events for source.post and target.pre, then assert the transition callback receives correctly decorated events before success or failure
      (Req: Progress output, Req: Transition hook observability)

- [x] 5.4 Add dedicated presenter unit tests
      `packages/cli/test/commands/_hook-progress-presenter.spec.ts`: new file — verify identical presentation rules for equivalent event streams from both commands
      Approach: drive the presenter directly with synthetic event sequences and assert append-only text output, full failed output, and single-line structured stream emission
      (Req: Shared hook progress presentation, Req: Long-running hook observability)

- [x] 5.5 Update CLI command tests for run-hooks and transition observability
      `packages/cli/test/commands/change-transition.spec.ts`, `packages/cli/test/commands/change.spec.ts` and any new `change-run-hooks` command test coverage — assert visible running state, preserved history, quiet-hook liveness, and stable final JSON stdout
      Approach: capture stdout/stderr separately, assert text progress appears on stderr before completion, structured progress plus terminal `complete` records appear on stdout for `json|toon`, and keep existing exit-code assertions
      (Req: Text output format, Req: JSON output format, Req: Output on success)

## 6. Documentation and verification

- [x] 6.1 Update hook-related CLI documentation
      `docs/`: hook execution documentation page(s) — explain live progress, shared rendering between `run-hooks` and `transition`, and stderr/stdout channel behavior for structured formats
      Approach: document the new text examples, note that `[running]` and `[still running]` indicate liveness, clarify that `text` uses stderr for progress and stdout for the summary, and that `json|toon` stream all records on stdout
      (Req: Shared hook progress presentation, Req: JSON output format)

- [x] 6.2 Run targeted core and CLI validation commands
      `packages/core`, `packages/cli`: tests and lint — verify the implementation against the scenarios added in this change
      Approach: run `pnpm --filter @specd/core test`, `pnpm --filter @specd/cli test`, `pnpm lint --filter @specd/core`, and `pnpm lint --filter @specd/cli`, then manually exercise one slow-output hook, one quiet hook, and one failing hook
      (Req: all modified verify scenarios)
