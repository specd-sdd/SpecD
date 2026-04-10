# Change List

## Purpose

Teams need a quick overview of all in-flight work to coordinate and avoid conflicts. `specd change list` lists all active changes in the project (those in `changes/`), sorted by creation date.

## Requirements

### Requirement: Command signature

```
specd change list [--format text|json|toon]
```

- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Output format

The command prints a human-readable table to stdout showing only active changes (in `changes/`). Changes are sorted by `createdAt` ascending (oldest first).

The output has an inverse-video column header row `NAME  STATE  SPECS  SCHEMA` above the data rows. Column widths are fixed at render time, computed from the widest value across all rows for each column (global, not per-group).

Each data row shows:

```
  <name>  <state>  <specIds>  <schema-name>@<schema-version>
```

where `<specIds>` is a comma-separated list of the spec IDs on the change.

When a description is set on the change, a dim indented description line is printed below the main row:

```
    <description>
```

Description sub-rows are NOT part of the column structure — they are printed outside the fixed-width grid.

In `json` or `toon` format, the output is an array of objects:

```json
[{"name":"...","state":"...","specIds":[...],"schema":{"name":"...","version":N},"description":"..."}]
```

`description` is omitted from the JSON object when not set.

### Requirement: Empty output

If there are no active changes, the command prints `no changes` to stdout in `text` mode, or `[]` as valid JSON in `json`/`toon` mode. The process exits with code 0.

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

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:core/change`](../../core/change/spec.md) — Change entity, states, storage locations
