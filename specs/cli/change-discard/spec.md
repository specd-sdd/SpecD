# Change Discard

## Purpose

When a change is no longer viable, it should be explicitly abandoned rather than left rotting in the active list. `specd change discard <name> --reason <text>` permanently moves a change to `discarded/`, requiring a reason so the decision is auditable.

## Requirements

### Requirement: Command signature

```
specd change discard <name> --reason <text> [--force] [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to discard
- `--reason <text>` — required; a human-readable explanation for discarding the change
- `--force` — optional; bypasses the historical implementation guard when the change has previously reached `implementing`
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Behaviour

The command moves the change from `changes/` or `drafts/` to `discarded/` and appends a `discarded` event to history. This operation is irreversible.

If the change has ever reached `implementing`, the command SHALL fail by default because implementation may already exist and abandoning the workflow would risk leaving permanent specs and code out of sync. The operation MAY proceed only when `--force` is provided.

### Requirement: Output on success

On success, output depends on `--format`:

- `text` (default): prints a single line to stdout:
- `json` or `toon`: outputs the following to stdout (encoded in the respective format):

### Requirement: JSON output on success

When `--format json` succeeds:

- stdout is valid JSON with `result: "ok"` and `name: "<name>"`
- the process exits with code 0

### Requirement: Error cases

- If the change does not exist, the command exits with code 1 and prints an `error:` message.
- `--reason` is mandatory; omitting it is a CLI usage error (exit code 1).
- If the change has ever reached `implementing` and `--force` is not provided, the command exits with code 1 and prints an `error:` message explaining that implementation may already exist and discarding the change could leave specs and code out of sync.

## Constraints

- Discarding is irreversible — there is no undo command
- A change may be discarded from `changes/` or `drafts/`; it cannot be discarded from `discarded/` (already there) or from the archive
- Once a change has ever reached `implementing`, discarding requires `--force`
- The reason is stored in the `discarded` event and must be a non-empty string
- `--force` bypasses only the historical implementation guard; it does not make discarding reversible

## Examples

```
specd change discard old-experiment --reason "approach superseded by new-design"
specd change discard old-experiment --reason "discarding workflow state despite prior implementation" --force
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:change`](../../core/change/spec.md) — discard semantics, storage locations
