# Drafts List

## Purpose

Shelved work is invisible to the active change list, so users need a dedicated view to see what has been parked. `specd drafts list` lists all changes currently in `drafts/`, sorted by `createdAt` ascending.

## Requirements

### Requirement: Command signature

```
specd drafts list [--format text|json|toon]
```

No positional arguments. The `--format` flag controls output encoding; defaults to `text`.

### Requirement: Output format — text

The command prints a human-readable table to stdout. Changes are sorted by `createdAt` ascending (oldest first).

The output has an inverse-video column header row `NAME  STATE  DATE  BY  REASON` above the data rows. Column widths are fixed at render time, computed from the widest value across all rows for each column (global, not per-group). The REASON column uses wrap overflow when its content exceeds the column width.

### Requirement: Output format — JSON

When `--format json` is passed, the command writes a JSON array to stdout:

```json
[
  {
    "name": "...",
    "state": "...",
    "draftedAt": "...",
    "draftedBy": { "name": "...", "email": "..." },
    "reason": "..."
  }
]
```

One object per drafted change, sorted by `createdAt` ascending. `reason` is omitted when not provided. `draftedBy` is omitted when not recorded.

### Requirement: Output format — toon

When `--format toon` is passed, the command writes the same data model as JSON encoded in Token-Oriented Object Notation (toon) to stdout.

### Requirement: Empty drafts

If there are no changes in `drafts/`, the command prints `no drafts` to stdout in text mode, or `[]` in JSON/toon mode, and exits with code 0.

### Requirement: Error cases

- If an I/O error occurs while reading `drafts/`, the command exits with code 3 and prints an `error:` message to stderr.

## Constraints

- Errors always go to stderr as plain text regardless of `--format`
- `--format` only affects stdout

## Examples

```
$ specd drafts list
  NAME             STATE      DATE        BY     REASON
  old-experiment   drafting   2024-01-05  alice  parked for later
  shelved-work     designing  2024-01-03  bob

$ specd drafts list --format json
[{"name":"old-experiment","state":"drafting","draftedAt":"2024-01-05T10:00:00.000Z","draftedBy":{"name":"alice","email":"alice@example.com"},"reason":"parked for later"}]
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:core/change`](../../core/change/spec.md) — drafting semantics
