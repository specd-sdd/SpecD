# Archive List

## Overview

Defines the `specd archive list` command, which lists all archived changes in the archive directory configured by `storage.archivePath`, sorted by archive date descending (most recent first).

## Requirements

### Requirement: Command signature

```
specd archive list [--format text|json|toon]
```

No positional arguments. The `--format` flag controls output encoding; defaults to `text`.

### Requirement: Output format — text

The command prints a human-readable table to stdout. Changes are sorted by archive date descending (most recently archived first).

The output has an inverse-video column header row `NAME  DATE` above the data rows. Column widths are fixed at render time, computed from the widest value across all rows for each column (global, not per-group).

### Requirement: Output format — JSON

When `--format json` is passed, the command writes a JSON array to stdout:

```json
[
  {
    "name": "...",
    "archivedName": "...",
    "workspace": "...",
    "archivedAt": "...",
    "archivedBy": { "name": "...", "email": "..." },
    "artifacts": ["..."]
  }
]
```

One object per archived change, sorted by archive date descending. `archivedBy` is omitted when not recorded. `artifacts` is an array of artifact type IDs.

### Requirement: Output format — toon

When `--format toon` is passed, the command writes the same data model as JSON encoded in Token-Oriented Object Notation (toon) to stdout.

### Requirement: Empty archive

If there are no archived changes, the command prints `no archived changes` to stdout in text mode, or `[]` in JSON/toon mode, and exits with code 0.

### Requirement: Error cases

- If an I/O error occurs while reading the archive directory, the command exits with code 3 and prints an `error:` message to stderr.

## Constraints

- The archive path is determined by `storage.archivePath` in `specd.yaml`
- Errors always go to stderr as plain text regardless of `--format`
- `--format` only affects stdout

## Examples

```
$ specd archive list
  NAME             DATE
  add-oauth-login  2024-01-15
  update-billing   2024-01-10

$ specd archive list --format json
[{"name":"add-oauth-login","archivedName":"20240115-120000-add-oauth-login","workspace":"default","archivedAt":"2024-01-15T12:00:00.000Z","archivedBy":{"name":"alice","email":"alice@example.com"},"artifacts":["spec"]}]
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — archive semantics, archivable state
