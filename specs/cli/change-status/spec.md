# Change Status

## Overview

Defines the `specd change status <name>` command, which reports the current lifecycle state and artifact statuses of a named change.

## Requirements

### Requirement: Command signature

```
specd change status <name> [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to inspect
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Output format

In `text` mode (default), the command prints a structured summary to stdout:

```
change:      <name>
state:       <state>
specs:       <specId>, <specId>, ...
description: <description>            ← only if set

artifacts:
  <type>  <effectiveStatus>
  ...
```

The `description:` line is omitted when no description is set on the change.

Each artifact line shows the artifact type ID and its effective status (`missing`, `in-progress`, `complete`, or `skipped`). Artifacts are listed in schema-declared order.

In `json` or `toon` mode, the output is:

```json
{"name":"...","state":"...","specIds":[...],"schema":{"name":"...","version":N},"description":"...","artifacts":[{"type":"...","effectiveStatus":"..."}]}
```

`description` is omitted from the JSON object when not set.

### Requirement: Schema version warning

If the change's recorded `schemaName`/`schemaVersion` differs from the currently active schema, the command prints a warning to stderr:

```
warning: change was created with schema <recorded> but active schema is <current>
```

The command still exits with code 0.

### Requirement: Change not found

If no change with the given name exists, the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- The output includes all artifacts declared by the schema, not only those present on disk
- `effectiveStatus` reflects dependency cascading — an artifact may be `in-progress` because a dependency is incomplete even if its own hash matches

## Examples

```
$ specd change status add-oauth-login
change:      add-oauth-login
state:       designing
specs:       auth/oauth
description: Add OAuth2 login via Google

artifacts:
  proposal   complete
  spec       in-progress
  tasks      missing
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — Change entity, artifact status derivation
