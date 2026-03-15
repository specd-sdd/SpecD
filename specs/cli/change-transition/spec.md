# Change Transition

## Purpose

Changes must progress through a governed lifecycle so that validations, approval gates, requires enforcement, and hooks fire at the right time. `specd change transition <name> <step>` advances a change to the next lifecycle state, transparently routing through approval gates when enabled, enforcing workflow `requires`, and executing `run:` hooks at step boundaries by default.

## Requirements

### Requirement: Command signature

```
specd change transition <name> <step> [--no-hooks] [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to transition
- `<step>` — required positional; the target lifecycle state (e.g. `designing`, `ready`, `implementing`, `verifying`, `done`, `archivable`, `pending-spec-approval`, `spec-approved`, `pending-signoff`, `signed-off`)
- `--no-hooks` — optional flag; skips `run:` hook execution, allowing the caller to manage hooks separately via `specd change run-hooks`
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Approval-gate routing

The CLI passes the `approvalsSpec` and `approvalsSignoff` flags from the loaded `SpecdConfig` to the `TransitionChange` use case. The use case then applies smart routing:

- When the change is in `ready` and `approvalsSpec: true`, `implementing` is silently routed to `pending-spec-approval`
- When the change is in `done` and `approvalsSignoff: true`, `archivable` is silently routed to `pending-signoff`

The user always specifies the logical target state; routing is transparent.

### Requirement: Hook execution

By default, the `TransitionChange` use case executes `run:` hooks for the target workflow step (pre-hooks before the state change, post-hooks after). When `--no-hooks` is passed, hook execution is skipped — the caller is responsible for invoking hooks via `specd change run-hooks`.

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

  ```
  transitioned <name>: <from> → <to>
  ```

- `json` or `toon`: outputs the following to stdout (encoded in the respective format):

  ```json
  { "result": "ok", "name": "<name>", "from": "<from>", "to": "<to>", "postHookFailures": [] }
  ```

where `<to>` is the effective target state after routing.

### Requirement: Post-hook failure warning

If any post-hooks failed, the CLI reports them as warnings. In `text` format, prints `warning: post-hook(s) failed: <commands>`. In structured formats, includes `postHookFailures` in the output. The command exits with code 2 if post-hooks failed.

### Requirement: Invalid transition error

If the transition is not valid from the current state, the command exits with code 1 and prints an `error:` message to stderr.

### Requirement: Incomplete tasks error

If transitioning `implementing → verifying` and any artifact has incomplete task items (matching `taskCompletionCheck.incompletePattern`), the command exits with code 1 and prints an `error:` message to stderr naming the blocking artifact.

### Requirement: Unsatisfied requires error

If the target workflow step has `requires` and any required artifact is not `complete` or `skipped`, the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- The user specifies the logical target state; the CLI never exposes the routing logic in its help text

## Examples

```
specd change transition add-login designing
specd change transition add-login ready
specd change transition add-login implementing
specd change transition add-login implementing --no-hooks
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — lifecycle states, approval gates, task completion check
- [`specs/core/transition-change/spec.md`](../../core/transition-change/spec.md) — requires enforcement, hook execution, skipHooks, progress
- [`specs/core/hook-execution-model/spec.md`](../../core/hook-execution-model/spec.md) — --no-hooks pattern
