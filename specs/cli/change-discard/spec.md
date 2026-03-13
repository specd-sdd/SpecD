# Change Discard

## Purpose

When a change is no longer viable, it should be explicitly abandoned rather than left rotting in the active list. `specd change discard <name> --reason <text>` permanently moves a change to `discarded/`, requiring a reason so the decision is auditable.

## Requirements

### Requirement: Command signature

```
specd change discard <name> --reason <text> [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to discard
- `--reason <text>` — required; a human-readable explanation for discarding the change
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Behaviour

The command moves the change from `changes/` or `drafts/` to `discarded/` and appends a `discarded` event to history. This operation is irreversible.

### Requirement: Output on success

On success, output depends on `--format`:

- `text` (default): prints a single line to stdout:

  ```
  discarded change <name>
  ```

- `json` or `toon`: outputs the following to stdout (encoded in the respective format):

  ```json
  { "result": "ok", "name": "<name>" }
  ```

### Requirement: Error cases

- If the change does not exist, the command exits with code 1 and prints an `error:` message.
- `--reason` is mandatory; omitting it is a CLI usage error (exit code 1).

## Constraints

- Discarding is irreversible — there is no undo command
- A change may be discarded from `changes/` or `drafts/`; it cannot be discarded from `discarded/` (already there) or from the archive
- The reason is stored in the `discarded` event and must be a non-empty string

## Examples

```
specd change discard old-experiment --reason "approach superseded by new-design"
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — discard semantics, storage locations
