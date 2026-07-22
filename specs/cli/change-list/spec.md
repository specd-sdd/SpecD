# Change List

## Purpose

Teams need a quick overview of all in-flight work to coordinate and avoid conflicts. `specd changes list` is the canonical form and lists all active changes in the project (those in `changes/`), sorted by creation date.

`specd change list` remains supported as an alias.

## Requirements

### Requirement: Command signature

```
specd changes list [--format text|json|toon] [--limit <n>] [--page <p>] [--after-key <iso>] [--after-id <name>] [--description]
```

Alias:

```
specd change list [--format text|json|toon] [--limit <n>] [--page <p>] [--after-key <iso>] [--after-id <name>] [--description]
```

- `--format text|json|toon` — optional; output format, defaults to `text`
- `--limit <n>` — optional; maximum number of entries to return; defaults to `100`
- `--page <p>` — optional; 1-based page number (uses `--limit`, defaulting to `100` when omitted)
- `--after-key <iso>` — optional; exclusive keyset cursor — ISO-8601 `createdAt` of the last seen row
- `--after-id <name>` — optional; tiebreak change `name` when `--after-key` collides; MUST accompany `--after-key`
- `--description` — optional; include the `description` field on each entry (maps to `includeDescription`)

`--page` is mutually exclusive with `--after-key` / `--after-id`.

### Requirement: List options forwarding

The command MUST map CLI flags to `ListOptions` and include flags as follows:

- `--limit`, `--page`, `--after-key`, `--after-id` → `limit`, `page`, and `after: { key, id? }` on the use-case input
- `--description` → `includeDescription: true`; when omitted, the CLI MUST NOT set include flags (defaults are port-side false)

The command MUST NOT re-sort, filter, or paginate results after the use case returns — it renders the `items` array and `meta` envelope as returned.

### Requirement: Output format

The command invokes `ListChanges.execute()` with list options derived from the flags and prints the returned `ListResult<ActiveChangeListEntry>` without re-sorting — canonical order (`createdAt` ascending) is owned by the repository layer.

In `text` mode, the command prints a human-readable table to stdout showing only active changes (in `changes/`).

The output has an inverse-video column header row `NAME  STATE  SPECS  SCHEMA` above the data rows. Column widths are fixed at render time, computed from the widest value across all rows for each column (global, not per-group).

Each data row shows:

```
  <name>  <state>  <specIds>  <schema-name>@<schema-version>
```

where `<specIds>` is a comma-separated list of the spec IDs on the change.

When `--description` is set and the entry includes a description, a dim indented description line is printed below the main row:

```
    <description>
```

Description sub-rows are NOT part of the column structure — they are printed outside the fixed-width grid.

When `meta.count < meta.total`, the command MUST print a trailing hint line after the table:

```
showing <count> of <total> (use --limit/--page)
```

In `json` or `toon` format, stdout is a paginated envelope:

```json
{
  "items": [
    {
      "name": "...",
      "state": "...",
      "specIds": ["..."],
      "schemaName": "...",
      "schemaVersion": 1,
      "createdAt": "...",
      "description": "..."
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

Optional fields (`description`) appear in `items` only when the corresponding include flag was set. `meta.after` is included when keyset pagination was used.

### Requirement: Empty output

If there are no active changes, the command prints `no changes` to stdout in `text` mode, or `{"items":[],"meta":{"total":0,"count":0,"limit":100}}` in `json`/`toon` mode. The process exits with code 0.

## Constraints

- Only active changes (in `changes/`) are listed; drafted and discarded changes have their own noun groups
- No filtering by state or workspace in v1

## Examples

```
$ specd change list
  NAME              STATE      SPECS                                SCHEMA
  add-oauth-login   designing  auth/oauth                           std@1
    Add OAuth2 login via Google
  update-billing    ready      billing/invoices, billing/payments   std@1

$ specd change list --format json
[{"name":"add-oauth-login","state":"designing","specIds":["auth/oauth"],"schema":{"name":"std","version":1},"description":"Add OAuth2 login via Google"}]
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:list-changes`](../../core/list-changes/spec.md) — paginated active change listing
- [`core:change-list-entry`](../../core/change-list-entry/spec.md) — `ActiveChangeListEntry` row shape
- [`cli:command-resource-naming`](../command-resource-naming/spec.md) — canonical plural naming and singular alias policy
