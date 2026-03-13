# Change Draft

## Purpose

Sometimes work needs to be paused without losing progress or polluting the active change list. `specd change draft <name> [--reason <text>]` shelves an active change to `drafts/` without affecting its lifecycle state, keeping it recoverable at any time via `specd drafts restore`.

## Requirements

### Requirement: Command signature

```
specd change draft <name> [--reason <text>] [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to shelve
- `--reason <text>` — optional; a human-readable explanation for shelving the change
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Behaviour

The command moves the change from `changes/` to `drafts/` and appends a `drafted` event to history. The lifecycle state is preserved. The change can be recovered at any time using `specd change restore`.

### Requirement: Output on success

On success, output depends on `--format`:

- `text` (default): prints a single line to stdout:

  ```
  drafted change <name>
  ```

- `json` or `toon`: outputs the following to stdout (encoded in the respective format):

  ```json
  { "result": "ok", "name": "<name>" }
  ```

### Requirement: Error cases

- If the change does not exist, the command exits with code 1 and prints an `error:` message to stderr.
- If the change is already in `drafts/`, the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- Drafting does not affect lifecycle state
- A change may be drafted at any point before archiving
- `--reason` is stored in the `drafted` event but not printed on success

## Examples

```
specd change draft old-experiment
specd change draft my-change --reason "pausing to prioritise another change"
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — drafting semantics, storage locations
