# Change Transition

## Purpose

Changes must progress through a governed lifecycle so that validations and approval gates fire at the right time. `specd change transition <name> <step>` advances a change to the next lifecycle state, transparently routing through approval gates when enabled. Workflow hooks are not executed by this command — `instruction:` hooks are injected into the agent context by `CompileContext`, and `run:` hooks are invoked by the agent via separate CLI calls or external hook mechanisms.

## Requirements

### Requirement: Command signature

```
specd change transition <name> <step> [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to transition
- `<step>` — required positional; the target lifecycle state (e.g. `designing`, `ready`, `implementing`, `verifying`, `done`, `archivable`, `pending-spec-approval`, `spec-approved`, `pending-signoff`, `signed-off`)
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Approval-gate routing

The CLI passes the `approvalsSpec` and `approvalsSignoff` flags from the loaded `SpecdConfig` to the `TransitionChange` use case. The use case then applies smart routing:

- When the change is in `ready` and `approvalsSpec: true`, `implementing` is silently routed to `pending-spec-approval`
- When the change is in `done` and `approvalsSignoff: true`, `archivable` is silently routed to `pending-signoff`

The user always specifies the logical target state; routing is transparent.

### Requirement: Output on success

On success, output depends on `--format`:

- `text` (default): prints a single line to stdout:

  ```
  transitioned <name>: <from> → <to>
  ```

- `json` or `toon`: outputs the following to stdout (encoded in the respective format):

  ```json
  { "result": "ok", "name": "<name>", "from": "<from>", "to": "<to>" }
  ```

where `<to>` is the effective target state after routing.

### Requirement: Invalid transition error

If the transition is not valid from the current state, the command exits with code 1 and prints an `error:` message to stderr.

### Requirement: Incomplete tasks error

If transitioning `implementing → verifying` and any artifact has incomplete task items (matching `taskCompletionCheck.incompletePattern`), the command exits with code 1 and prints an `error:` message to stderr naming the blocking artifact.

## Constraints

- The user specifies the logical target state; the CLI never exposes the routing logic in its help text

## Examples

```
specd change transition add-login designing
specd change transition add-login ready
specd change transition add-login implementing
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — lifecycle states, approval gates, task completion check
