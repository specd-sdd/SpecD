# Change Transition

## Purpose

Changes must progress through a governed lifecycle so that validations, approval gates, requires enforcement, and hooks fire at the right time. `specd change transition <name> <step>` advances a change to the next lifecycle state, transparently routing through approval gates when enabled, enforcing workflow `requires`, and executing `run:` hooks at step boundaries by default.

Because transitions may trigger long-running hooks, the command must also keep hook execution observable while those hooks are in flight.

## Requirements

### Requirement: Command signature

```
specd change transition <name> <step> [--skip-hooks <phases>] [--format text|json|toon]
specd change transition <name> --next [--skip-hooks <phases>] [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to transition
- `<step>` — required positional when `--next` is not used; the target lifecycle state (e.g. `designing`, `ready`, `implementing`, `verifying`, `done`, `archivable`, `pending-spec-approval`, `spec-approved`, `pending-signoff`, `signed-off`)
- `--next` — optional flag; resolves the next logical lifecycle target from the change's current state and is mutually exclusive with `<step>`
- `--skip-hooks <phases>` — optional; comma-separated list of hook phases to skip. Valid values: `source.pre`, `source.post`, `target.pre`, `target.post`, `all`. When `all` is specified, all hook phases are skipped. When omitted, all applicable hooks execute.
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Next-transition resolution

When `--next` is used, the CLI MUST load the current change state and resolve the same logical forward target a human would normally choose for the next workflow step:

- `drafting` → `designing`
- `designing` → `ready`
- `ready` → `implementing`
- `spec-approved` → `implementing`
- `implementing` → `verifying`
- `verifying` → `done`
- `done` → `archivable`

After resolving the target, the command MUST execute the normal `TransitionChange` flow for that resolved state. Approval-gate routing, requires enforcement, hook execution, and error handling remain unchanged.

`--next` is unavailable when the current state does not have a transition-driven next action through `change transition`. In those cases, the command MUST exit with code 1 and print an explanatory `error:` message to stderr instead of inventing a synthetic transition target. This includes at least:

- `pending-spec-approval` — waiting for human spec approval
- `pending-signoff` — waiting for human signoff
- `archivable` — the next action is archive execution, not another lifecycle transition

### Requirement: Delegates refresh policy to TransitionChange

The command MUST NOT call `RefreshImplementationTracking` or `ImplementationDetector` directly.

Pre-transition status reads MUST call `GetStatus` with `refreshImplementationTracking: false` because `TransitionChange` performs the refresh.

`TransitionChange` MUST be invoked with default `refreshImplementationTrackingBefore` behaviour unless a future CLI flag explicitly opts out.

When rendering a repair guide after a failed transition, the command MUST call `GetStatus` with `refreshImplementationTracking: false` and MUST NOT trigger a second refresh solely for diagnostics.

### Requirement: Approval-gate routing

The CLI MUST NOT pass approval gate flags to `TransitionChange.execute`. Approval routing uses gate state baked into the kernel's `TransitionChange` instance from `config.approvals` at kernel construction.

The use case, via `LifecycleEngine`, applies smart routing:

- When the change is in `ready` and `config.approvals.spec` is `true`, `implementing` is silently routed to `pending-spec-approval`
- When the change is in `done` and `config.approvals.signoff` is `true`, `archivable` is silently routed to `pending-signoff`

The user always specifies the logical target state; routing is transparent, and the CLI must not duplicate routing logic beyond choosing the requested target or `--next` target.

### Requirement: Hook execution

By default, the `TransitionChange` use case executes `run:` hooks at step boundaries in this order: source.post hooks (finishing the previous step), then target.pre hooks (preparing the new step), then the state transition. Both phases are fail-fast — a failure in either aborts the transition. When `--skip-hooks` is passed with specific phases, those hook phases are skipped. When `--skip-hooks all` is passed, all hook execution is skipped — the caller is responsible for invoking hooks via `specd change run-hooks`.

The CLI maps the `--skip-hooks` option to a `skipHookPhases` set on `TransitionChangeInput`.

### Requirement: Progress output

The CLI passes an `onProgress` callback to the use case that renders step-by-step feedback in `text` format and preserves structured progress for machine-oriented formats.

For hook execution during a transition, progress output MUST allow the caller to observe:

- hook start
- the active hook ID and command
- recent hook output while the hook is still running
- liveness signals when the hook remains active without new output
- hook completion

In `text` mode, the active hook MAY use a lightweight running label, but that label is only a visual aid and MUST NOT be the only signal that work is still progressing.

Progress output for previously completed hooks MUST remain understandable instead of being fully overwritten by the currently running hook.

In `json` and `toon`, progress MUST be emitted on stdout as newline-delimited structured stream records. Hook lifecycle events use `stream: "hook-progress"`. Transition lifecycle events such as `requires-check` and `transitioned` use `stream: "change-transition"`.

### Requirement: Transition hook observability

When transition hook execution exposes progress information, the command MUST surface that progress during the transition instead of appearing silent until the hook exits.

This applies even when the transition ultimately fails before the lifecycle state changes.

### Requirement: Shared hook progress presentation

The command MUST use the same hook progress presentation model as `specd change run-hooks` for equivalent hook events.

The CLI implementation MUST centralize that presentation logic in a shared helper so the two commands do not drift in:

- running-status labels
- recent-output tail rendering
- liveness signalling
- failed-hook full-output rendering

### Requirement: Output on success

On success, output depends on `--format`.

In `text` (default), the command prints a final human-readable confirmation to stdout after progress reporting completes.

In `json` and `toon`, the command MUST emit one terminal stdout stream record with:

- `stream: "change-transition"`
- `event.type: "complete"`
- `event.result` containing `result`, `name`, `from`, and `to`

The final result MUST remain part of the same structured stream as the in-flight progress records rather than appearing as a standalone object outside the stream.

### Requirement: Post-hook failure warning

Since both hook phases (source.post and target.pre) are fail-fast, a hook failure causes the command to exit with code 2 and print an `error:` message to stderr. Richer progress reporting does not introduce a separate post-transition hook warning state.

If hook progress was rendered before the failure, the failure output MUST still leave the caller with enough visible context to understand which hook was active and what output preceded the error.

### Requirement: Invalid transition error

If the transition is not valid from the current state, the command exits with code 1 and prints an `error:` message to stderr.

When the transition fails (e.g. `InvalidStateTransitionError`, `HookFailedError`), the command MUST render a **Repair Guide** in text mode:

```
error: cannot transition to <step>
! <CODE>: <message>

repair guide:
  target:  <targetStep>
  command: <command>
  reason:  <reason>
```

The repair guide uses the `nextAction` data from the `GetStatusResult`. The `! <CODE>` line uses the blocker codes identified in the `GetStatus` spec (e.g., `MISSING_ARTIFACT`, `ARTIFACT_DRIFT`).

When `format` is `json` or `toon`, the command MUST keep failure reporting on stdout as part of the structured stream by emitting a terminal `stream: "change-transition"` record with `event.type: "complete"` and `event.result` containing `result: "failure"`, `name`, `from`, `to`, `blockers`, and `nextAction`.

When the underlying `InvalidStateTransitionError` carries a structured reason explaining that the change is blocked on human approval or signoff, the command MUST surface that explanation in the stderr message rather than collapsing it to a generic invalid-transition message.

When `--next` is invoked from a state where no transition-driven next action exists, the stderr message MUST explain why the command cannot advance automatically from that state.

### Requirement: Incomplete tasks error

If transitioning `implementing → verifying` and any artifact has incomplete task items (matching `taskCompletionCheck.incompletePattern`), the command exits with code 1 and prints an `error:` message to stderr naming the blocking artifact.

### Requirement: Unsatisfied requires error

If the target workflow step has `requires` and any required artifact is not `complete` or `skipped`, the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- The user specifies the logical target state; the CLI never exposes the routing logic in its help text
- Repair-guide blockers and next-action data are projected from core lifecycle diagnostics (`TransitionChange` failure plus `GetStatus`), not recomputed in the CLI layer
- In `text`, progress is rendered to stderr and the final human-readable confirmation remains on stdout
- In `json` and `toon`, machine-readable progress and the terminal `complete` record are emitted on stdout; stderr is reserved for non-structured diagnostics

## Examples

```
specd change transition add-login designing
specd change transition add-login --next
specd change transition add-login ready
specd change transition add-login implementing
specd change transition add-login --skip-hooks all
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — CLI config discovery, exit codes, and output conventions
- [`core:change`](../../core/change/spec.md) — change lifecycle state model
- [`core:transition-change`](../../core/transition-change/spec.md) — transition execution and default refresh orchestration
- [`core:hook-execution-model`](../../core/hook-execution-model/spec.md) — hook ordering and failure semantics
- [`core:get-status`](../../core/get-status/spec.md) — pre-transition and repair-guide status reads
