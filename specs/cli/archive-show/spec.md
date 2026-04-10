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

The command prints metadata for the change to stdout:

```
name:    <name>
state:   archivable
specs:   <specId>, ...
schema:  <schema-name>@<version>
```

The `state` field is always `archivable` for archived changes.

### Requirement: Output format — JSON

When `--format json` is passed, the command writes a single JSON object to stdout:

```json
{"name":"...","state":"archivable","specIds":[...],"schema":{"name":"...","version":N}}
```

### Requirement: Output format — toon

When `--format toon` is passed, the command writes the same data model as JSON encoded in Token-Oriented Object Notation (toon) to stdout.

### Requirement: Error cases

- If no change with the given name exists in the archive directory, the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- Errors always go to stderr as plain text regardless of `--format`
- `--format` only affects stdout
- The `state` field is always `archivable` for all changes returned by this command

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

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:core/change`](../../core/change/spec.md) — archive semantics, archivable state
