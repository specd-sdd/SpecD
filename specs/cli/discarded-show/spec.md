# Discarded Show

## Purpose

When reviewing past decisions, users need to see why a change was abandoned — not just that it was. `specd discarded show <name>` displays basic metadata for a single discarded change, including the recorded discard reason.

## Requirements

### Requirement: Command signature

```
specd discarded show <name> [--format text|json|toon]
```

- `<name>` — required positional; the name of the discarded change to show
- `--format` — controls output encoding; defaults to `text`

### Requirement: Output format — text

The command prints metadata for the change to stdout:

```
name:    <name>
specs:   <specId>, ...
schema:  <schema-name>@<version>
reason:  <discard reason>
```

The `reason` value comes from the `discarded` event in the change history.

### Requirement: Output format — JSON

When `--format json` is passed, the command writes a single JSON object to stdout:

```json
{"name":"...","specIds":[...],"schema":{"name":"...","version":N},"reason":"..."}
```

### Requirement: Output format — toon

When `--format toon` is passed, the command writes the same data model as JSON encoded in Token-Oriented Object Notation (toon) to stdout.

### Requirement: Error cases

- If no change with the given name exists in `discarded/`, the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- The `reason` field is sourced from the `discarded` event recorded when `specd change discard` was run
- Errors always go to stderr as plain text regardless of `--format`
- `--format` only affects stdout

## Examples

```
$ specd discarded show old-experiment
name:    old-experiment
specs:   auth/legacy
schema:  schema-std@1
reason:  approach superseded by new-design

$ specd discarded show old-experiment --format json
{"name":"old-experiment","specIds":["auth/legacy"],"schema":{"name":"schema-std","version":1},"reason":"approach superseded by new-design"}
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:core/change`](../../core/change/spec.md) — discard semantics, discarded event, storage locations
