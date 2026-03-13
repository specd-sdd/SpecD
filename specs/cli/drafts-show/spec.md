# Drafts Show

## Purpose

Before restoring a drafted change, users need to inspect its metadata to confirm it is the right one. `specd drafts show <name>` displays basic metadata — name, state, specs, and schema — for a single change in `drafts/`.

## Requirements

### Requirement: Command signature

```
specd drafts show <name> [--format text|json|toon]
```

- `<name>` — required positional; the name of the drafted change to show
- `--format` — controls output encoding; defaults to `text`

### Requirement: Output format — text

The command prints metadata for the change to stdout:

```
name:    <name>
state:   <state>
specs:   <specId>, ...
schema:  <schema-name>@<version>
```

### Requirement: Output format — JSON

When `--format json` is passed, the command writes a single JSON object to stdout:

```json
{"name":"...","state":"...","specIds":[...],"schema":{"name":"...","version":N}}
```

### Requirement: Output format — toon

When `--format toon` is passed, the command writes the same data model as JSON encoded in Token-Oriented Object Notation (toon) to stdout.

### Requirement: Error cases

- If no change with the given name exists in `drafts/`, the command exits with code 1 and prints an `error:` message to stderr.
- If a change with the given name exists but is not in `drafts/` (i.e. it is active in `changes/` or in `discarded/`), the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- Errors always go to stderr as plain text regardless of `--format`
- `--format` only affects stdout
- Only changes currently in `drafts/` are shown by this command

## Examples

```
$ specd drafts show old-experiment
name:    old-experiment
state:   drafting
specs:   auth/legacy
schema:  schema-std@1

$ specd drafts show old-experiment --format json
{"name":"old-experiment","state":"drafting","specIds":["auth/legacy"],"schema":{"name":"schema-std","version":1}}
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — Change entity, drafting semantics
