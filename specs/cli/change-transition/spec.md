# Change Transition

## Purpose

Changes must progress through a governed lifecycle so that validations, in-place approval checks, requires enforcement, and hooks fire at the right time. `specd change transition <name> <step>` advances a change to a requested lifecycle state (or `--next` for Core-resolved happy-path next). Failed spec/signoff checks leave the change in `ready` / `done`. The CLI enforces workflow `requires` via Core and executes `run:` hooks at step boundaries by default.

Because transitions may trigger long-running hooks, the command must also keep hook execution observable while those hooks are in flight.

## Requirements

### Requirement: Command signature

The command SHALL be invoked as `specd change transition <name> [step] [--next]`.
`<name>` is required. Exactly one of `<step>` or `--next` MUST be provided: passing both SHALL fail with `<step> and --next are mutually exclusive`, and passing neither SHALL fail with `either <step> or --next is required`, both as CLI usage errors (exit code 1) without calling `TransitionChange`.

The command MUST accept a `--skip-checks <ids>` option accepting a comma-separated list of check IDs.
The command MUST maintain backward compatibility with legacy flags by translating them into `skipChecks`:

- `--allow-out-of-scope` appends `impl.linksInScope` to `skipChecks`.
- `--allow-overlap` appends `spec.overlap` to `skipChecks`.

The CLI adapter MUST pass the compiled `skipChecks` array directly to `TransitionChangeInput.skipChecks`.

The `--help` JSON output schema MUST list the fields of the structured failure record, including `error`, `hint`, `state`, `validity`, `verification`, blocker `bypassFlag`, and `nextAction.intent`, `nextAction.action`, and `nextAction.guidance` alongside `command`. Blocker entries MUST list `code`, `message`, `label`, `checkId`, `details`, `action`, and `bypassFlag`, and the `nextAction` shape MUST list `command`, `intent`, `action`, `guidance`, `actionType`, and `reason`, with no raw `isSkippable`.

### Requirement: Next-transition resolution

When the command is invoked with `--next`, it SHALL pass `to: 'next'` to `TransitionChange.execute`. The CLI MUST NOT resolve the target itself through a local from→to table.

Core resolves `'next'` to the closest subsequent enabled step via `nextWorkflowStep`. Disabled steps are absent from the active pipeline and are therefore skipped. An enabled optional step remains the `'next'` target; `--next` SHALL NOT evaluate optional-step shortcut policy or bypass that step merely because its `step-skip` checks pass.

Optional-step shortcut recommendation belongs to `GetStatus.nextAction`: callers that want the recommended shortcut use the explicit target projected there. `--next` remains a deterministic one-hop operation over the enabled topology.

When Core rejects `to: 'next'` (no happy-path hop: `archivable`, `archiving`), the command MUST exit with code 1 and print an explanatory `error:` message to stderr. From a legacy parking state, `next` resolves to its delivery edge (`implementing` or `archivable`) and the bound approval check decides whether it proceeds.

### Requirement: CLI-rendered transition error hints

When `HappyPathNextUnavailableError` (`HAPPY_PATH_NEXT_UNAVAILABLE`) or a skippable `impl.linksInScope` failure is surfaced by `change transition`, the command SHALL use the centralized CLI hint-resolution helper (`change.transition` context) to render `--next` context and the generic bypass hint `Retry with --skip-checks <id> if an exception is granted` (with `<id>` replaced by the failing check id, for example `impl.linksInScope`), rather than relying on CLI flags embedded in `@specd/core` messages. The hint MUST be identical in form for every skippable check; it MUST NOT add check-specific variants. The `deps.consistent` hint (re-run dependency extraction or update the change dependencies) applies only when the blocker is not skippable; a skippable `deps.consistent` blocker receives the generic bypass hint instead. The hint MUST NOT add check-specific variants beyond that and MUST NOT mention the `--allow-out-of-scope` alias (which keeps working as input).

### Requirement: Validity-aware transition guidance

Before resolving `next`, and when a requested transition fails after fresh reconciliation, the command SHALL consume the canonical `GetStatus` or `TransitionChange` result rather than reconstructing gate or verification rules. When rendering the repair guide in text mode, the CLI SHALL project `--skip-checks <checkId>` bypass hints from `blocker.isSkippable` and `blocker.checkId`, and SHALL project `nextAction.command` from Core's `nextAction.intent` (and optional `action`) via the centralized CLI guidance presenter.

If reconciliation committed an automatic return, output SHALL show the new state, invalidated evidence, reason, and current next action. Required stale spec approval in a state after `ready` routes through `designing` and `ready`, while in `ready` the change stays and consent is renewed there; stale sign-off alone routes to `done`; stale verification at required boundaries recommends the verification skill in place. Earlier-phase stale verification remains context and MUST NOT cause the CLI to suggest verification prematurely.

The CLI MUST NOT retry the original transition automatically after recovery, choose an alternate transition, expose verification-attempt restart flags, or accept `verifying → verifying`. Entry to `verifying` reports readiness checks without claiming baseline capture. Exit to `done` reports `verification.current` through the generic check output. A failure does not claim verification completion or transition success; it reports the actual reconciled state and in-place verification guidance. Transitions never start or complete an attempt.

When `TransitionChange` fails with `ReconciledOperationBlockedError` (reconciliation committed an automatic return before the requested edge could run), the command MUST render it as a repair guide, never as an invalid-edge error line. The text output SHALL show the committed state, the committed blockers projected through the CLI blocker projection (label, `checkId`, action, `bypassFlag`; never raw `isSkippable`), and the projected next action (the `command:` or `guidance:` line plus the reason). In json and toon modes the failure record SHALL carry `state`, `automaticReturn`, the projected blockers and the projected `nextAction` (`intent`, `action`, `command`, `guidance`).

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

The command MUST catch `CheckPredicateFailedError` for every failed check (built-in, plugin, or schema-embedded) and map it onto the CLI Text Repair Guide. There are no check-specific error classes to handle.
When this error is caught:

- The CLI SHALL render the failure message, the failed check's own diagnostic code taken from the caught error (even when the fresh status no longer carries that blocker), the check's gerund label, and the attempted transition (`from` / `to`) as context.
- The CLI SHALL render check-specific context by `checkId` and `code` from `details` through the CLI presenter (for example the blocking artifact and its blocking parent for `workflow.requires`, the task counts for `workflow.taskCompletion`, every mismatch for `deps.consistent`, the affected specs for `workspace.readOnly`).
- If the failed check result declared an `action`, the Repair Guide MUST present the command projected from it by the guidance presenter under the `command:` field. When the action has no command mapping (an unknown kind, or only `guidance`), the Repair Guide MUST print the action's host-neutral guidance on a separate `guidance:` line and MUST NOT place guidance prose under `command:`. In that case, if the fresh status `nextAction` projects a command, the Repair Guide MUST print BOTH the check action's `guidance:` line AND the next-action command under `command:`; the next-action command MUST NOT replace or suppress the check's guidance line.
- If the failed check allows bypass (`skippable: true`), the Repair Guide MUST suggest the exact bypass syntax: `Retry with --skip-checks <id> if an exception is granted`. In text mode, every skippable blocker listed in the repair guide MUST get its own `bypass:` line (one per skippable blocker), matching the per-blocker `bypassFlag` carried in json and toon output.
- If the check is mandatory (`skippable: false`), no bypass option SHALL be offered.
- When the command fails with `CheckNotSkippableError`, the repair guide MUST render the CLI hint resolved for that code and the offending `checkId` (for a `hook.*` check, the `--skip-hooks` hint) in text mode and in the `hint` field of json and toon output.
- In json and toon modes the failure record MUST carry an `error` object with `code`, `message` and, when known, `checkId`, so machine consumers can tell why the transition failed even when the fresh status no longer carries the blocker; a skippable `CheckPredicateFailedError` MUST also produce the bypass `hint`.
- In json and toon modes, the structured failure blockers MUST be projected through the CLI blocker projection (`label`, `checkId`, `details`, `action`, `bypassFlag`), never spread raw from Core, so raw `isSkippable` is never emitted.
- When reading the fresh status fails while rendering a repair guide, the command MUST NOT mask the original transition error: it prints only that original error through the standard error path (text, json and toon) and renders no repair guide and no structured repair record (no projected blockers, `nextAction` or validity fields); the exit code stays 1.

### Requirement: Incomplete tasks error

If transitioning toward a step whose `workflow.taskCompletion` predicate fails (typically `implementing → verifying`) and any gated artifact has incomplete task items, the command exits with code 1 and prints an `error:` message to stderr naming the blocking artifact and the task counts from the check `details`. Status for that same change MUST already have omitted `verifying` from `availableTransitions`.

### Requirement: Check progress rendering

When `TransitionChange` emits generic check progress events, the CLI MUST render them in text mode as:

```text
<label> (<id>)
  …optional check-progress lines…
✓ <label>
# or
✗ <label>: <reason>
# or
⊘ <label> (skipped: <reason>)
```

Labels are gerund phrases from each check. The CLI MUST NOT print an `Executing:` prefix. Hooks MUST appear on this same bus (`Running pre hooks` / `Running post hooks`), not as a separate public progress contract.

A `check-done` with `outcome: 'skip'` MUST be rendered with the skipped marker and its reason (for example `--skip-hooks`, `--skip-checks`, or "not applicable"), never with the passed marker `✓`. In particular, when `--skip-hooks` disables a hook phase, that phase MUST render as skipped.

When Core re-evaluates predicates after hooks, the CLI SHALL render that second pass only if at least one hook phase actually ran, and SHALL label it as a re-check (for example a `Re-checking after hooks` heading). When no hook ran, the re-evaluation MUST NOT be printed as a duplicate check list.

### Requirement: Unsatisfied requires error

If the target workflow step has `requires` and any required artifact is not `complete` or `skipped`, the `workflow.requires` check fails, the command exits with code 1, and prints an `error:` message to stderr naming the blocking artifact (and its blocking parent when `details.blockedBy` is present).

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
- [`core:lifecycle-engine`](../../core/lifecycle-engine/spec.md) — lifecycle evaluation and available transition routing
