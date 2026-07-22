# Archive List

## Purpose

Teams need a way to review past work without digging through the archive directory by hand. The `specd archive list` command lists all archived changes from the directory configured by `storage.archivePath`, sorted by archive date descending (most recent first).

## Requirements

### Requirement: Command signature

```
specd archive list [--format text|json|toon] [--limit <n>] [--page <p>] [--after-key <iso>] [--after-id <name>] [--archived-by]
```

- `--format` — controls output encoding; defaults to `text`
- `--limit <n>` — maximum number of entries to return; defaults to `100`
- `--page <p>` — 1-based page number (uses `--limit`, defaulting to `100` when omitted)
- `--after-key <iso>` — exclusive keyset cursor — ISO-8601 `archivedAt` of the last seen row
- `--after-id <name>` — tiebreak change `name` when `--after-key` collides; MUST accompany `--after-key`
- `--archived-by` — optional; include `archivedBy` on each entry (`includeArchivedBy`)

`--page` is mutually exclusive with `--after-key` / `--after-id`.

### Requirement: List options forwarding

The command MUST invoke `ListArchived.execute()` and map CLI flags to list options:

- `--limit`, `--page`, `--after-key`, `--after-id` → `limit`, `page`, and `after: { key, id? }`
- `--archived-by` → `includeArchivedBy: true`

When `--archived-by` is omitted, the CLI MUST NOT set include flags. The command MUST NOT re-sort or paginate after the use case returns.

### Requirement: Output format — text

The command prints a human-readable table to stdout. Rows appear in canonical order (`archivedAt` descending — most recently archived first) as returned by the use case; the CLI MUST NOT re-sort.

The output has an inverse-video column header row `NAME  DATE` above the data rows. When `--archived-by` is set, an `BY` column is appended. Column widths are fixed at render time, computed from the widest value across all rows for each column (global, not per-group).

When `meta.count < meta.total`, the command MUST print a trailing hint line:

```
showing <count> of <total> (use --limit/--page)
```

### Requirement: Output format — JSON

When `--format json` is passed, the command writes a JSON object to stdout containing the list and metadata:

```json
{
  "items": [
    {
      "name": "...",
      "archivedName": "...",
      "archivedAt": "...",
      "specIds": ["..."],
      "schemaName": "...",
      "schemaVersion": 1,
      "archivedBy": { "name": "...", "email": "..." }
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

One object per archived change in canonical order as returned by the use case. `archivedBy` appears only when `--archived-by` was set and the entry includes it. List entries MUST NOT include `artifacts` — artifact detail belongs on `get`.

The command MUST NOT read every archived change `manifest.json` to produce this listing; it MUST rely on the archive list index via `ListArchived`.

### Requirement: Output format — toon

When `--format toon` is passed, the command writes the same data model as JSON encoded in Token-Oriented Object Notation (toon) to stdout.

### Requirement: Empty archive

If there are no archived changes, the command prints `no archived changes` to stdout in text mode, or `{"items":[],"meta":{"total":0,"count":0,"limit":100}}` (or equivalent empty paginated envelope) in JSON/toon mode, and exits with code 0.

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
{"items":[{"name":"add-oauth-login","archivedName":"20240115-120000-add-oauth-login","archivedAt":"2024-01-15T12:00:00.000Z","specIds":["default:auth/login"],"schemaName":"default","schemaVersion":1}],"meta":{"total":2,"count":2,"limit":100,"page":1}}

$ specd archive list --archived-by --format json
{"items":[{"name":"add-oauth-login","archivedName":"20240115-120000-add-oauth-login","archivedAt":"2024-01-15T12:00:00.000Z","specIds":["default:auth/login"],"schemaName":"default","schemaVersion":1,"archivedBy":{"name":"alice","email":"alice@example.com"}}],"meta":{"total":2,"count":2,"limit":100,"page":1}}
```

The JSON examples use the `{ items, meta }` envelope, never a bare array. Entries never include `workspace` or `artifacts` — those are not part of `ArchiveListEntry`. `archivedBy` appears only when `--archived-by` is passed.

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:list-archived`](../../core/list-archived/spec.md) — paginated archive listing
- [`core:archived-change-index-entry`](../../core/archived-change-index-entry/spec.md) — `ArchiveListEntry` row shape
