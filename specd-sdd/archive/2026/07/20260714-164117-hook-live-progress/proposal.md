# Proposal: hook-live-progress

## Motivation

Long-running workflow hooks currently look silent until the subprocess exits, which makes both humans and agents infer that nothing is happening. This change is needed now because hook execution is already part of the lifecycle contract, but its current observability model breaks down for slow commands.

## Current behaviour

Today, `NodeHookRunner` buffers subprocess output and only returns `stdout` and `stderr` once the hook finishes. `RunStepHooks` exposes only `hook-start` and `hook-done` progress events, `change run-hooks` prints final per-hook status only, and `change transition` can show hook start/done progress but cannot surface live output or heartbeat-style liveness while a hook is still running.

## Proposed solution

Add a live hook progress model that streams execution visibility while preserving the final hook result contract. The change extends the hook runner and hook progress pipeline so long-running hooks can surface active command identity, recent output, and liveness signals, while CLI consumers render that information differently for human-oriented text output and agent-oriented structured formats. `specd change run-hooks` and `specd change transition` must share one hook-progress presentation model instead of drifting into separate renderers. In the final contract, `text` mode keeps human progress on `stderr` and the final summary on `stdout`, while `json|toon` emit all machine-readable records on `stdout` as a newline-delimited structured stream that ends with a terminal `complete` event.

## Specs affected

### New specs

None.

### Modified specs

- `core:hook-runner-port`: extend the hook runner contract so shell hook execution can expose live execution progress without losing the existing final `HookResult` semantics.
  - Depends on (added): none
  - Depends on (removed): none

- `core:run-step-hooks`: expand hook progress semantics beyond start/done so the use case can propagate output and liveness information from the runner to CLI consumers.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:change-run-hooks`: change the command contract from final-status-only reporting to progress-aware reporting for both text and structured formats while preserving hook-failure exit semantics.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:change-transition`: update transition progress reporting so hook execution remains observable during transitions and reconcile the command's documented hook-failure behaviour with the shared CLI hook conventions.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

Affected code areas include `packages/core/src/infrastructure/node/hook-runner.ts`, `packages/core/src/application/use-cases/run-step-hooks.ts`, `packages/cli/src/commands/change/run-hooks.ts`, and `packages/cli/src/commands/change/transition.ts`. The change also impacts hook-related unit tests in core and CLI-facing progress/output expectations, especially around long-running hooks, hook failure visibility, command exit behaviour, and the shared helper that keeps hook rendering aligned across both CLI entrypoints.

## Technical context

The current runner implementation uses `execFile(..., callback)` and only resolves once with buffered output, so the hook pipeline has no way to emit intermediate output. `RunStepHooks` already has an `onProgress` callback, but it previously emitted only `hook-start` and `hook-done`, which was enough for a spinner and not enough for sustained observability. The user also raised agent-compatibility as a first-class constraint: human-friendly streaming output and agent-safe structured progress must not be conflated into one noisy channel. Because `change run-hooks` and `change transition` consume the same hook event stream, the rendering rules should live in one shared helper rather than in two separate command-local implementations.

The expected output shape was discussed in more concrete terms. For human-oriented `text` mode, the desired behaviour is append-only progress that keeps previously executed hooks visible, shows which hook is currently running, shows the command being executed, and surfaces the latest output lines while the hook is still active. A lightweight status label such as `[running]` remains acceptable, but the visual treatment is secondary to preserving visible history and recent output. When a hook completes successfully, its recent output should remain visible as historical context while the next hook begins. When a hook fails, the full output for that hook should be shown rather than only a short summary. This explicitly rules out a UX that continually repaints the terminal and hides already executed hook history.

Illustrative `text` output examples discussed for this change:

```text
[running] test-core
  command: pnpm test --filter @specd/core
  | ✓ should validate schema names
  | running slow integration case...
[still running] test-core (42s)
```

```text
[failed] test-core
  command: pnpm test --filter @specd/core
  exit: 1
  full output:
    RUN  v3.2.1 /Users/monki/Documents/Proyectos/specd/packages/core
    ✓ should validate schema names
    × should stop on pre-hook failure
      AssertionError: expected 2 to equal 1
    Test Files  1 failed | 11 passed
    Tests       1 failed | 147 passed
```

The same conversation also established that human-facing output and agent-facing output should be treated as different contracts. A human-readable view can be richer and more narrative, but agent-oriented formats must remain structured and low-noise so long-running hooks do not appear stalled while also avoiding ANSI-heavy or partially rewritten terminal output. The agreed direction is therefore dual-path reporting: persistent, readable progress in `text`, and structured progress signals in `json|toon` emitted on `stdout` so an agent can detect that work is still happening even when the hook is quiet or slow.

The final structured direction also resolved the channel split: `stdout` is the sole machine-readable stream in `json|toon`, while `stderr` is reserved for text-mode progress and non-structured diagnostics. The final result is not emitted as a standalone object outside the stream; it is the terminal `complete` record in the same stream.

An illustrative structured progress shape for the final contract is:

```json
{"stream":"hook-progress","event":{"type":"hook-start","hookId":"test-core","command":"pnpm test --filter @specd/core"}}
{"stream":"hook-progress","event":{"type":"hook-output","hookId":"test-core","stream":"stdout","line":"running slow integration case..."}}
{"stream":"hook-progress","event":{"type":"hook-heartbeat","hookId":"test-core","elapsedMs":65000}}
{"stream":"hook-progress","event":{"type":"hook-done","hookId":"test-core","exitCode":0,"success":true}}
{"stream":"run-hooks","event":{"type":"complete","result":{"result":"ok","hooks":[{"id":"test-core","command":"pnpm test --filter @specd/core","exitCode":0,"success":true}]}}}
```

This captures the intended experience: visible active execution, preserved history in `text`, explicit liveness for long-running hooks, and a single structured stream for agent consumption.

This change is also expected to cover "liveness without output." Some hooks may spend long periods computing without writing lines, so the progress model needs a way to indicate that the subprocess is still alive even when there is no new stdout/stderr to show. That requirement matters for both terminal trust and agent behaviour: without a heartbeat or equivalent progress signal, the caller cannot distinguish "still running" from "hung" until process exit.

During context refresh, `cli:entrypoint` was confirmed to be semantically unchanged despite stale metadata, but it highlighted an important contract tension around hook-failure signaling. The final contract for this change resolves that tension by keeping hook-triggered failures aligned on exit code `2` across both `change run-hooks` and hook-bearing `change transition` flows, while preserving transition-specific repair-guide behavior and structured completion output.

## Open questions

None at proposal scope. Remaining implementation details such as heartbeat cadence and tail window size belong in `design.md`, but they must preserve the direction established here: live observability for long-running hooks, stable final results, and separate human-versus-agent consumption paths with a single structured `stdout` stream for `json|toon`.
