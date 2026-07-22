# Discarded List

## Purpose

Discarded changes serve as an audit trail of abandoned work — without a listing command, users would have to inspect the filesystem directly. `specd discarded list` lists all discarded changes in `discarded/`, sorted by discard date descending (most recently discarded first).

## Requirements

### Requirement: Command signature

```
specd discarded list [--format text|json|toon] [--limit <n|all>] [--page <p>] [--after-key <iso>] [--after-id <name>] [--description] [--reason] [--superseded-by]
```

- `--format text|json|toon` — optional; output encoding, defaults to `text`
- `--limit <n|all>` — optional; maximum number of entries to return. When omitted, the CLI host defaults to `100`. When set to `all`, the CLI MUST NOT pass `limit` to the use case.
- `--page <p>` — optional; 1-based page number; MUST be paired with a numeric `--limit` (not `all`)
- `--after-key <iso>` — optional; exclusive keyset cursor — ISO-8601 `discardedAt` of the last seen row
- `--after-id <name>` — optional; tiebreak change `name` when `--after-key` collides; MUST accompany `--after-key`
- `--description` / `--reason` / `--superseded-by` — optional include flags

`--page` is mutually exclusive with `--after-key` / `--after-id`. `--page` with `--limit all` MUST be rejected. `--after-key` with `--limit all` is allowed.

### Requirement: Uses ListDiscarded read model

The command MUST invoke `ListDiscarded.execute()` with list options derived from the flags and treat each entry as a `DiscardedChangeListEntry`.

Discard metadata (`reason`, `discardedAt`, `discardedBy`, `supersededBy`, `description`) MUST be read from the list entry returned by the use case — not by scanning raw `Change` history in the command.

### Requirement: List options forwarding

The command MUST map CLI flags to list options as follows:

- When `--limit` is omitted → pass `limit: 100` (CLI host default)
- When `--limit` is a positive integer → pass that `limit`
- When `--limit all` → omit `limit` from the use-case input
- `--page`, `--after-key`, `--after-id` → `page` and `after: { key, id? }` when provided
- Include flags → set only when the corresponding CLI flag is present

The command MUST NOT re-sort, filter, or paginate results after the use case returns.

### Requirement: Output format — text

The command prints a human-readable table to stdout. Rows appear in canonical order as returned by the use case; the CLI MUST NOT re-sort.

When a numeric `--limit` is in effect (explicit or host default) and `meta.count < meta.total`, the command MUST print a trailing hint line:

```
showing <count> of <total> (use --limit/--page)
```

When `--limit all` was used, the command MUST NOT print a truncation hint.

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

If there are no discarded changes, the command prints `no discarded changes` to stdout in text mode, or `{"items":[],"meta":{"total":0,"count":0,"limit":100}}` in JSON/toon mode when the host default limit applies, or `{"items":[],"meta":{"total":0,"count":0,"limit":0}}` when `--limit all` was used. The process exits with code 0.

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
