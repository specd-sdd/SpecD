# Change Transition

## Purpose

Changes must progress through a governed lifecycle so that validations, approval gates, requires enforcement, and hooks fire at the right time. `specd change transition <name> <step>` advances a change to the next lifecycle state, transparently routing through approval gates when enabled, enforcing workflow `requires`, and executing `run:` hooks at step boundaries by default.

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

### Requirement: Approval-gate routing

The CLI passes the `approvalsSpec` and `approvalsSignoff` flags from the loaded `SpecdConfig` to the `TransitionChange` use case. The use case then applies smart routing:

- When the change is in `ready` and `approvalsSpec: true`, `implementing` is silently routed to `pending-spec-approval`
- When the change is in `done` and `approvalsSignoff: true`, `archivable` is silently routed to `pending-signoff`

The user always specifies the logical target state; routing is transparent.

### Requirement: Hook execution

By default, the `TransitionChange` use case executes `run:` hooks at step boundaries in this order: source.post hooks (finishing the previous step), then target.pre hooks (preparing the new step), then the state transition. Both phases are fail-fast — a failure in either aborts the transition. When `--skip-hooks` is passed with specific phases, those hook phases are skipped. When `--skip-hooks all` is passed, all hook execution is skipped — the caller is responsible for invoking hooks via `specd change run-hooks`.

The CLI maps the `--skip-hooks` option to a `skipHookPhases` set on `TransitionChangeInput`.

### Requirement: Progress output

The CLI passes an `onProgress` callback to the use case that renders step-by-step feedback to stdout:

- `requires-check` → `✓ artifactId [complete]` or `✗ artifactId [status]`
- `hook-start` → spinner `⠋ phase › hookId: command`
- `hook-done` → `✓ hookId (exit 0)` or `✗ hookId (exit N)`
- `transitioned` → `✓ from → to`

Progress output is only rendered in `text` format. JSON and toon formats include progress data in the structured output.

### Requirement: Output on success

On success, output depends on `--format`:

- `text` (default): prints a single line to stdout:
- `json` or `toon`: outputs the following to stdout (encoded in the respective format):

where `<to>` is the effective target state after routing.

### Requirement: Post-hook failure warning

Since both hook phases (source.post and target.pre) are fail-fast, a hook failure causes the command to exit with code 1 and print an `error:` message to stderr. The previous `postHookFailures` warning (exit code 2) is removed — there are no post-transition hook failures to report.

### Requirement: Invalid transition error

If the transition is not valid from the current state, the command exits with code 1 and prints an `error:` message to stderr.

When the underlying `InvalidStateTransitionError` carries a structured reason explaining that the change is blocked on human approval or signoff, the command MUST surface that explanation in the stderr message rather than collapsing it to a generic invalid-transition message.

When `--next` is invoked from a state where no transition-driven next action exists, the stderr message MUST explain why the command cannot advance automatically from that state.

### Requirement: Incomplete tasks error

If transitioning `implementing → verifying` and any artifact has incomplete task items (matching `taskCompletionCheck.incompletePattern`), the command exits with code 1 and prints an `error:` message to stderr naming the blocking artifact.

### Requirement: Unsatisfied requires error

If the target workflow step has `requires` and any required artifact is not `complete` or `skipped`, the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- The user specifies the logical target state; the CLI never exposes the routing logic in its help text

## Examples

```
specd change transition add-login designing
specd change transition add-login --next
specd change transition add-login ready
specd change transition add-login implementing
specd change transition add-login --skip-hooks all
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — lifecycle states, approval gates, task completion check
- [`specs/core/transition-change/spec.md`](../../core/transition-change/spec.md) — requires enforcement, hook execution, skipHooks, progress
- [`specs/core/hook-execution-model/spec.md`](../../core/hook-execution-model/spec.md) — hook execution and skipping model
