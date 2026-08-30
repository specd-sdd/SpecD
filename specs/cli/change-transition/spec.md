# Change Transition

## Purpose

Changes must progress through a governed lifecycle so that validations, in-place approval checks, requires enforcement, and hooks fire at the right time. `specd change transition <name> <step>` advances a change to a requested lifecycle state (or `--next` for Core-resolved happy-path next). Failed spec/signoff checks leave the change in `ready` / `done`. The CLI enforces workflow `requires` via Core and executes `run:` hooks at step boundaries by default.

Because transitions may trigger long-running hooks, the command must also keep hook execution observable while those hooks are in flight.

## Requirements

### Requirement: Command signature

```
specd changes transition <name> <step> [--skip-hooks <phases>] [--allow-out-of-scope] [--format text|json|toon]
specd changes transition <name> --next [--skip-hooks <phases>] [--allow-out-of-scope] [--format text|json|toon]
```

Alias:

```
specd change transition <name> <step> [--skip-hooks <phases>] [--allow-out-of-scope] [--format text|json|toon]
specd change transition <name> --next [--skip-hooks <phases>] [--allow-out-of-scope] [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to transition
- `<step>` — required positional when `--next` is not used; the target lifecycle state (e.g. `designing`, `ready`, `implementing`, `verifying`, `done`, `archivable`, `pending-spec-approval`, `spec-approved`, `pending-signoff`, `signed-off`)
- `--next` — optional flag; the CLI MUST pass `to: 'next'` to `TransitionChange.execute`. Mutually exclusive with `<step>`
- `--skip-hooks <phases>` — optional; comma-separated list of hook phases to skip. Valid values: `source.pre`, `source.post`, `target.pre`, `target.post`, `all`. When `all` is specified, all hook phases are skipped. When omitted, all applicable hooks execute. Skip applies to effects only.
- `--allow-out-of-scope` — optional flag; when set, the CLI MUST pass `allowOutOfScope: true` to `TransitionChange.execute`. That skippable flag applies only to `impl.linksInScope`. It MUST NOT bypass `impl.filesResolved`. When the flag is omitted, the CLI MUST NOT set `allowOutOfScope` on the execute input
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Next-transition resolution

When `--next` is used, the CLI MUST call `TransitionChange.execute` with `to: 'next'`. Core MUST resolve the happy-path next lifecycle state (see [`core:transition-change`](../../core/transition-change/spec.md)). The CLI MUST NOT maintain a from→to routing table and MUST NOT treat `GetStatus.nextAction` as that resolution.

After Core resolves `next` to a concrete state, the command MUST execute the normal `TransitionChange` flow for that state. Approval-gate checks, requires enforcement, hook execution, and error handling remain unchanged.

When Core rejects `to: 'next'` (no happy-path hop: at least `pending-spec-approval`, `pending-signoff`, `archivable`, `archiving`), the command MUST exit with code 1 and print an explanatory `error:` message to stderr.

### Requirement: Delegates refresh policy to TransitionChange

The command MUST NOT call `RefreshImplementationTracking` or `ImplementationDetector` directly.

Pre-transition status reads MUST call `GetStatus` with `refreshImplementationTracking: false` because `TransitionChange` performs the refresh.

`TransitionChange` MUST be invoked with default `refreshImplementationTrackingBefore` behaviour unless a future CLI flag explicitly opts out.

When rendering a repair guide after a failed transition, the command MUST call `GetStatus` with `refreshImplementationTracking: false` and MUST NOT trigger a second refresh solely for diagnostics.

### Requirement: Approval-gate routing

The CLI MUST NOT pass approval gate flags to `TransitionChange.execute`. Gate state is baked into the kernel's `TransitionChange` instance from `config.approvals` at kernel construction.

The CLI MUST NOT rewrite `implementing` to `pending-spec-approval` or `archivable` to `pending-signoff`. The user specifies the delivery target; failed `approval.spec` / `approval.signoff` stay in `ready` / `done`.

### Requirement: Hook execution

By default, the `TransitionChange` use case executes `run:` hooks at step boundaries in this order: source.post hooks (finishing the previous step), then target.pre hooks (preparing the new step), then the state transition. Both phases are fail-fast — a failure in either aborts the transition. When `--skip-hooks` is passed with specific phases, those hook phases are skipped. When `--skip-hooks all` is passed, all hook execution is skipped — the caller is responsible for invoking hooks via `specd change run-hooks`.

The CLI maps the `--skip-hooks` option to a `skipHookPhases` set on `TransitionChangeInput`.

### Requirement: Progress output

The CLI passes an `onProgress` callback to the use case that renders generic **check** progress in `text` format and preserves structured progress for machine-oriented formats.

Predicate and effect checks share one bus: `check-start`, optional `check-progress`, `check-done`. Hooks MUST appear on that bus (`Running pre hooks` / `Running post hooks`). The CLI MUST NOT emit `stream: "hook-progress"` from `change transition`. `run-hooks` MAY keep `_hook-progress-presenter` until a later change remaps it.

In `json` and `toon`, progress MUST be emitted on stdout as newline-delimited structured stream records with `stream: "change-transition"` for check and transition lifecycle events.

### Requirement: Transition hook observability

When transition hook execution exposes progress information, the command MUST surface that progress during the transition instead of appearing silent until the hook exits.

This applies even when the transition ultimately fails before the lifecycle state changes.

### Requirement: Shared hook progress presentation

`change transition` MUST use the generic check-progress presenter. `change run-hooks` MAY keep the hook-progress presenter until it is remapped onto the check bus. The two commands MUST NOT advertise the same public JSON `stream` name.

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

When the transition fails with `InvalidStateTransitionError` (or another repair-guide error), the command MUST render a **Repair Guide** in text mode **on stderr** (not stdout):

```
error: cannot transition to <step>
! <CODE> — <label>: <message>

repair guide:
  target:  <targetStep>
  command: <command>
  reason:  <reason>
```

When a blocker has no check `label`, the line is `! <CODE>: <message>`.

The repair guide uses the `nextAction` data from the `GetStatusResult`. Those values MUST reflect transition-check evaluation (for example `implementing` with complete tasks recommends the verify skill, not `/specd-implement`). The `! <CODE>` line uses the blocker codes identified in the `GetStatus` spec (e.g., `INCOMPLETE_ARTIFACT`, `ARTIFACT_DRIFT`, `INCOMPLETE_TASKS`, `DEPS_INCONSISTENT`) and, when present, the check gerund `label`.

`HookFailedError` MUST NOT render a Repair Guide. It MUST exit with code 2 after the check bus shows `✗` for the failing effect.

When `format` is `json` or `toon`, the command MUST keep failure reporting on stdout as part of the structured stream by emitting a terminal `stream: "change-transition"` record with `event.type: "complete"` and `event.result` containing `result: "failure"`, `name`, `from`, `to`, `blockers`, and `nextAction`.

When the underlying `InvalidStateTransitionError` carries a structured reason explaining that the change is blocked on human approval or signoff, the command MUST surface that explanation in the stderr message rather than collapsing it to a generic invalid-transition message.

When `--next` is invoked from a state where Core rejects `to: 'next'`, the stderr message MUST explain why the command cannot advance automatically from that state.

### Requirement: Incomplete tasks error

If transitioning toward a step whose `workflow.taskCompletion` predicate fails (typically `implementing → verifying`) and any gated artifact has incomplete task items, the command exits with code 1 and prints an `error:` message to stderr naming the blocking artifact. Status for that same change MUST already have omitted `verifying` from `availableTransitions`.

### Requirement: Check progress rendering

When `TransitionChange` emits generic check progress events, the CLI MUST render them in text mode as:

```text
<label> (<id>)
  …optional check-progress lines…
✓ <label>
# or
✗ <label>: <reason>
```

Labels are gerund phrases from each check. The CLI MUST NOT print an `Executing:` prefix. Hooks MUST appear on this same bus (`Running pre hooks` / `Running post hooks`), not as a separate public progress contract.

### Requirement: Unsatisfied requires error

If the target workflow step has `requires` and any required artifact is not `complete` or `skipped`, the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- The user specifies the logical target state; the CLI never exposes the routing logic in its help text
- Repair-guide blockers and next-action data are projected from core lifecycle diagnostics (`TransitionChange` failure plus `GetStatus` check evaluation), not recomputed in the CLI layer
- `HookFailedError` is not a repair-guide error
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
- [`core:transition-checks`](../../core/transition-checks/spec.md) — check progress bus; no pending rewrite
