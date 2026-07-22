# Drafts List

## Purpose

Shelved work is invisible to the active change list, so users need a dedicated view to see what has been parked. `specd drafts list` lists all changes currently in `drafts/`, sorted by `createdAt` ascending.

## Requirements

### Requirement: Command signature

```
specd drafts list [--format text|json|toon] [--limit <n>] [--page <p>] [--after-key <iso>] [--after-id <name>] [--description] [--reason]
```

Alias:

```
specd draft list [--format text|json|toon] [--limit <n>] [--page <p>] [--after-key <iso>] [--after-id <name>] [--description] [--reason]
```

- `--format text|json|toon` — optional; output encoding, defaults to `text`
- `--limit <n>` — optional; maximum number of entries to return; defaults to `100`
- `--page <p>` — optional; 1-based page number (uses `--limit`, defaulting to `100` when omitted)
- `--after-key <iso>` — optional; exclusive keyset cursor — ISO-8601 `draftedAt` of the last seen row
- `--after-id <name>` — optional; tiebreak change `name` when `--after-key` collides; MUST accompany `--after-key`
- `--description` — optional; include `description` (`includeDescription`)
- `--reason` — optional; include draft `reason` (`includeReason`)

`--page` is mutually exclusive with `--after-key` / `--after-id`.

No positional arguments.

### Requirement: Uses ListDrafts read model

The command MUST invoke `ListDrafts.execute()` with list options derived from the flags and treat each entry as a `DraftedChangeListEntry`.

The command MUST read `draftedAt`, `draftedBy`, and optional `reason` / `description` from the list entry returned by the use case — not by scanning raw `Change` history in the command.

The command MUST NOT assume entries are mutable `Change` instances or full drafted views.

### Requirement: List options forwarding

The command MUST map CLI flags to list options:

- `--limit`, `--page`, `--after-key`, `--after-id` → `limit`, `page`, and `after: { key, id? }`
- `--description` → `includeDescription: true`
- `--reason` → `includeReason: true`

When include flags are omitted, the CLI MUST NOT set them. The command MUST NOT re-sort or paginate after the use case returns.

### Requirement: Output format — text

The command prints a human-readable table to stdout. Rows appear in canonical order (`draftedAt` descending — most recently drafted first) as returned by the use case; the CLI MUST NOT re-sort.

The output has an inverse-video column header row. Base columns are always `NAME  STATE  DATE  BY`. When `--reason` is set, `REASON` is appended. Column widths are fixed at render time, computed from the widest value across all rows for each column (global, not per-group). The REASON column uses wrap overflow when its content exceeds the column width.

When `--description` is set and an entry includes a description, a dim indented description line is printed below the main row (same convention as active change list).

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
      "state": "...",
      "createdAt": "...",
      "specIds": ["..."],
      "schemaName": "...",
      "schemaVersion": 1,
      "draftedAt": "...",
      "draftedBy": { "name": "...", "email": "..." },
      "description": "...",
      "reason": "..."
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

Optional fields (`description`, `reason`, `draftedBy`) appear only when present on the entry and when the matching include flag was set (`--description`, `--reason`). Entries are in canonical order as returned by the use case.

### Requirement: Output format — toon

When `--format toon` is passed, the command writes the same `{ items, meta }` data model as JSON encoded in Token-Oriented Object Notation (toon) to stdout.

### Requirement: Empty drafts

If there are no changes in `drafts/`, the command prints `no drafts` to stdout in text mode, or `{"items":[],"meta":{"total":0,"count":0,"limit":100}}` in JSON/toon mode, and exits with code 0.

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

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:list-drafts`](../../core/list-drafts/spec.md) — paginated drafted change listing
- [`core:change-list-entry`](../../core/change-list-entry/spec.md) — `DraftedChangeListEntry` row shape
- [`cli:command-resource-naming`](../command-resource-naming/spec.md) — canonical plural naming and singular alias policy
