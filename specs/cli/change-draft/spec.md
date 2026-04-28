# Change Draft

## Purpose

Sometimes work needs to be paused without losing progress or polluting the active change list. `specd changes draft <name> [--reason <text>]` is the canonical form and shelves an active change to `drafts/` without affecting its lifecycle state, keeping it recoverable at any time via `specd drafts restore`.

`specd change draft <name> ...` remains supported as an alias.

## Requirements

### Requirement: Command signature

```
specd changes draft <name> [--reason <text>] [--force] [--format text|json|toon]
```

Alias:

```
specd change draft <name> [--reason <text>] [--force] [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to shelve
- `--reason <text>` — optional; a human-readable explanation for shelving the change
- `--force` — optional; bypasses the historical implementation guard when the change has previously reached `implementing`
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Behaviour

The command moves the change from `changes/` to `drafts/` and appends a `drafted` event to history. The lifecycle state is preserved. The change can be recovered at any time using `specd drafts restore`.

If the change has ever reached `implementing`, the command SHALL fail by default because implementation may already exist and shelving the workflow would risk leaving permanent specs and code out of sync. The operation MAY proceed only when `--force` is provided.

### Requirement: Output on success

On success, output depends on `--format`:

- `text` (default): prints a single line to stdout:
- `json` or `toon`: outputs the following to stdout (encoded in the respective format):

### Requirement: Error cases

- If the change does not exist, the command exits with code 1 and prints an `error:` message to stderr.
- If the change is already in `drafts/`, the command exits with code 1 and prints an `error:` message to stderr.
- If the change has ever reached `implementing` and `--force` is not provided, the command exits with code 1 and prints an `error:` message explaining that implementation may already exist and shelving the change could leave specs and code out of sync.

## Constraints

- Drafting does not affect lifecycle state
- A change may be drafted before archiving, but once it has ever reached `implementing` the operation requires `--force`
- `--reason` is stored in the `drafted` event but not printed on success
- `--force` bypasses only the historical implementation guard; it does not change lifecycle semantics

## Examples

```
specd change draft old-experiment
specd change draft my-change --reason "pausing to prioritise another change"
specd change draft my-change --reason "intentional rollback of workflow only" --force
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:core/change`](../../core/change/spec.md) — drafting semantics, storage locations
- [`cli:cli/command-resource-naming`](../command-resource-naming/spec.md) — canonical plural naming and singular alias policy
