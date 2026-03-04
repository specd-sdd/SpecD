# Discarded List

## Overview

Defines the `specd discarded list` command, which lists all discarded changes in `discarded/`, sorted by discard date descending (most recently discarded first).

## Requirements

### Requirement: Command signature

```
specd discarded list [--format text|json|toon]
```

No positional arguments. The `--format` flag controls output encoding; defaults to `text`.

### Requirement: Output format — text

The command prints a human-readable table to stdout. Changes are sorted by discard date descending (most recently discarded first).

The output has an inverse-video column header row `NAME  DATE  BY  REASON` above the data rows. Column widths are fixed at render time, computed from the widest value across all rows for each column (global, not per-group). The REASON column uses wrap overflow capped at 60 characters.

### Requirement: Output format — JSON

When `--format json` is passed, the command writes a JSON array to stdout:

```json
[
  {
    "name": "...",
    "discardedAt": "...",
    "discardedBy": { "name": "...", "email": "..." },
    "reason": "...",
    "supersededBy": ["..."]
  }
]
```

One object per discarded change, sorted by discard date descending. `supersededBy` is omitted when empty. `discardedBy` is omitted when not recorded.

### Requirement: Output format — toon

When `--format toon` is passed, the command writes the same data model as JSON encoded in Token-Oriented Object Notation (toon) to stdout.

### Requirement: Empty discarded list

If there are no discarded changes, the command prints `no discarded changes` to stdout in text mode, or `[]` in JSON/toon mode, and exits with code 0.

### Requirement: Error cases

- If an I/O error occurs while reading `discarded/`, the command exits with code 3 and prints an `error:` message to stderr.

## Constraints

- Errors always go to stderr as plain text regardless of `--format`
- `--format` only affects stdout

## Examples

```
$ specd discarded list
  NAME            DATE        BY     REASON
  old-experiment  2024-01-10  alice  no longer needed
  bad-idea        2024-01-08  bob    duplicate effort

$ specd discarded list --format json
[{"name":"old-experiment","discardedAt":"2024-01-10T09:00:00.000Z","discardedBy":{"name":"alice","email":"alice@example.com"},"reason":"no longer needed"}]
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — discard semantics, storage locations
