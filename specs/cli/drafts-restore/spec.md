# Drafts Restore

## Overview

Defines the `specd drafts restore <name>` command, which recovers a drafted change from `drafts/` back to `changes/`. This command replaces the former `specd change restore` command.

## Requirements

### Requirement: Command signature

```
specd drafts restore <name> [--format text|json|toon]
```

- `<name>` — required positional; the name of the drafted change to restore
- `--format` — controls output encoding; defaults to `text`

### Requirement: Behaviour

The command moves the change from `drafts/` to `changes/` and appends a `restored` event to history. The lifecycle state is preserved exactly as it was when the change was drafted.

### Requirement: Output on success — text

On success, the command prints a single line to stdout:

```
restored change <name>
```

### Requirement: Output on success — JSON and toon

When `--format json` is passed, the command writes a JSON object to stdout on success:

```json
{ "result": "ok", "name": "..." }
```

When `--format toon` is passed, the same data model is written in Token-Oriented Object Notation (toon).

### Requirement: Error cases

- If no change with the given name exists (in any location), the command exits with code 1 and prints an `error:` message to stderr.
- If the change exists but is not currently in `drafts/` (i.e. it is active or discarded), the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- Restoring does not affect lifecycle state
- A change may be drafted and restored multiple times; each cycle appends events to history
- Errors always go to stderr as plain text regardless of `--format`
- `--format` only affects stdout

## Examples

```
$ specd drafts restore old-experiment
restored change old-experiment

$ specd drafts restore old-experiment --format json
{"result":"ok","name":"old-experiment"}
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — restore semantics, storage locations
