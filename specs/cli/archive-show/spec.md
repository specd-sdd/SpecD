# Archive Show

## Purpose

When reviewing archived work, users need to inspect a specific change without restoring it. The `specd archive show <name>` command displays basic metadata for a single archived change.

## Requirements

### Requirement: Command signature

```
specd archive show <name> [--format text|json|toon]
```

- `<name>` — required positional; the name of the archived change to show
- `--format` — controls output encoding; defaults to `text`

### Requirement: Output format — text

The command prints read-only details for the archived change to stdout:

```
name:        <name>
description: <description>      # omitted when null/empty
state:       <lifecycle-state>
archivedAt:  <iso-timestamp>
archivedBy:  <name <email>>     # omitted when not recorded
specs:       <specId>, ...
schema:      <schema-name>@<version>
artifacts:   <artifactType>, ...
```

The `state` field MUST be derived from the archived `manifest.json` lifecycle state at load time. It MUST NOT be hardcoded to `archivable`.

### Requirement: Output format — JSON

When `--format json` is passed, the command writes a single JSON object to stdout:

```json
{
  "name": "...",
  "description": "...",
  "state": "...",
  "archivedAt": "...",
  "archivedBy": { "name": "...", "email": "..." },
  "specIds": [...],
  "schema": { "name": "...", "version": N },
  "artifacts": ["..."]
}
```

`description` and `archivedBy` are omitted when not recorded. `artifacts` is an array of artifact type IDs present at archive time.

### Requirement: Output format — toon

When `--format toon` is passed, the command writes the same data model as JSON encoded in Token-Oriented Object Notation (toon) to stdout.

### Requirement: Error cases

- If no change with the given name exists in the archive directory, the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- Errors always go to stderr as plain text regardless of `--format`
- `--format` only affects stdout

## Examples

```
$ specd archive show add-oauth-login
name:    add-oauth-login
state:   archivable
specs:   auth/oauth
schema:  schema-std@1

$ specd archive show add-oauth-login --format json
{"name":"add-oauth-login","state":"archivable","specIds":["auth/oauth"],"schema":{"name":"schema-std","version":1}}
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:get-archived-change`](../../core/get-archived-change/spec.md) — archived change read model lookup
- `core:archived-change-index-entry` — artifacts and archive metadata surfaced from index/detail models
