# Discarded List

## Purpose

Discarded changes serve as an audit trail of abandoned work — without a listing command, users would have to inspect the filesystem directly. `specd discarded list` lists all discarded changes in `discarded/`, sorted by discard date descending (most recently discarded first).

## Requirements

### Requirement: Command signature

```
specd discarded list [--format text|json|toon] [--limit <n>] [--page <p>] [--after-key <iso>] [--after-id <name>] [--description] [--reason] [--superseded-by]
```

- `--format text|json|toon` — optional; output encoding, defaults to `text`
- `--limit <n>` — optional; maximum number of entries to return; defaults to `100`
- `--page <p>` — optional; 1-based page number (uses `--limit`, defaulting to `100` when omitted)
- `--after-key <iso>` — optional; exclusive keyset cursor — ISO-8601 `discardedAt` of the last seen row
- `--after-id <name>` — optional; tiebreak change `name` when `--after-key` collides; MUST accompany `--after-key`
- `--description` — optional; include `description` (`includeDescription`)
- `--reason` — optional; include discard `reason` (`includeReason`)
- `--superseded-by` — optional; include `supersededBy` (`includeSupersededBy`)

`--page` is mutually exclusive with `--after-key` / `--after-id`.

No positional arguments.

### Requirement: Uses ListDiscarded read model

The command MUST invoke `ListDiscarded.execute()` with list options derived from the flags and treat each entry as a `DiscardedChangeListEntry`.

Discard metadata (`reason`, `discardedAt`, `discardedBy`, `supersededBy`, `description`) MUST be read from the list entry returned by the use case — not by scanning raw `Change` history in the command.

### Requirement: List options forwarding

The command MUST map CLI flags to list options:

- `--limit`, `--page`, `--after-key`, `--after-id` → `limit`, `page`, and `after: { key, id? }`
- `--description` → `includeDescription: true`
- `--reason` → `includeReason: true`
- `--superseded-by` → `includeSupersededBy: true`

When include flags are omitted, the CLI MUST NOT set them. The command MUST NOT re-sort or paginate after the use case returns.

### Requirement: Output format — text

The command prints a human-readable table to stdout. Rows appear in canonical order (`discardedAt` descending — most recently discarded first) as returned by the use case; the CLI MUST NOT re-sort.

The output has an inverse-video column header row. Base columns are always `NAME  DATE  BY`. When `--reason` is set, `REASON` is appended. When `--superseded-by` is set and an entry has superseded targets, the row includes a `→ <names>` segment after the reason column (or in place of reason when reason is omitted). Column widths are fixed at render time, computed from the widest value across all rows for each column (global, not per-group). The REASON column uses wrap overflow capped at 60 characters.

When `--description` is set and an entry includes a description, a dim indented description line is printed below the main row.

When `meta.count < meta.total`, the command MUST print a trailing hint line:

```
showing <count> of <total> (use --limit/--page)
```

### Requirement: Output format — JSON

When `--format json` is passed, the command writes a paginated envelope to stdout:

```json
{
  "items": [
    {
      "name": "...",
      "createdAt": "...",
      "state": "...",
      "specIds": ["..."],
      "schemaName": "...",
      "schemaVersion": 1,
      "discardedAt": "...",
      "discardedBy": { "name": "...", "email": "..." },
      "description": "...",
      "reason": "...",
      "supersededBy": ["..."]
    }
  ],
  "meta": {
    "total": 125,
    "count": 100,
    "limit": 100,
    "page": 1
  }
}
```

Optional fields appear only when present on the entry and when the matching include flag was set. `supersededBy` is omitted when empty even when `--superseded-by` is set.

### Requirement: Output format — toon

When `--format toon` is passed, the command writes the same `{ items, meta }` data model as JSON encoded in Token-Oriented Object Notation (toon) to stdout.

### Requirement: Empty discarded list

If there are no discarded changes, the command prints `no discarded changes` to stdout in text mode, or `{"items":[],"meta":{"total":0,"count":0,"limit":100}}` in JSON/toon mode, and exits with code 0.

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

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:list-discarded`](../../core/list-discarded/spec.md) — paginated discarded change listing
- [`core:change-list-entry`](../../core/change-list-entry/spec.md) — `DiscardedChangeListEntry` row shape
- [`cli:command-resource-naming`](../command-resource-naming/spec.md) — canonical plural naming
