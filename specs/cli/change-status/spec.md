# Change Status

## Purpose

Users and agents need a quick way to see where a change stands — its lifecycle state and which artifacts are done, in progress, or missing. `specd change status <name>` reports the current lifecycle state and artifact statuses of a named change.

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

lifecycle:
  transitions:  <available1>, <available2>, ...    ← only availableTransitions
  next artifact: <artifactId>                      ← omitted when null
  approvals:     spec=on|off  signoff=on|off
  path:          <changePath>
```

The `description:` line is omitted when no description is set on the change.

Each artifact line shows the artifact type ID and its effective status (`missing`, `in-progress`, `complete`, or `skipped`). Artifacts are listed in schema-declared order.

The `lifecycle:` section is always present. The `transitions:` line shows only `availableTransitions` (transitions that would succeed now). It is omitted when the list is empty. The `next artifact:` line is omitted when `nextArtifact` is `null`.

If there are blockers, they are shown after the lifecycle section:

```
blockers:
  → <transition>: <reason> — <blocking1>, <blocking2>, ...
```

The `blockers:` section is omitted when there are no blockers.

In `json` or `toon` mode, the output is:

```json
{
  "name": "...",
  "state": "...",
  "specIds": ["..."],
  "schema": { "name": "...", "version": 1 },
  "description": "...",
  "artifacts": [{ "type": "...", "effectiveStatus": "..." }],
  "lifecycle": {
    "validTransitions": ["..."],
    "availableTransitions": ["..."],
    "blockers": [{ "transition": "...", "reason": "requires", "blocking": ["..."] }],
    "approvals": { "spec": false, "signoff": false },
    "nextArtifact": "...",
    "changePath": "...",
    "schemaInfo": { "name": "...", "version": 1 }
  }
}
```

`description` is omitted from the JSON object when not set. The `lifecycle` object is always present. `nextArtifact` is `null` (not omitted) when all artifacts are done.

### Requirement: Schema version warning

If the change's recorded `schemaName`/`schemaVersion` differs from the currently active schema, the command prints a warning to stderr:

```
warning: change was created with schema <recorded> but active schema is <current>
```

The command still exits with code 0.

The CLI command MUST NOT resolve the schema independently. It SHALL compare `change.schemaName`/`change.schemaVersion` against `lifecycle.schemaInfo` from the `GetStatusResult`. If `lifecycle.schemaInfo` is `null` (schema resolution failed), the warning is skipped.

### Requirement: Change not found

If no change with the given name exists, the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- The output includes all artifacts declared by the schema, not only those present on disk
- `effectiveStatus` reflects dependency cascading — an artifact may be `in-progress` because a dependency is incomplete even if its own hash matches
- The CLI command is a pure serializer — all lifecycle computation is performed by the `GetStatus` use case in `@specd/core`
- The CLI command MUST NOT call `SchemaRegistry`, `config show`, or any other use case to compute lifecycle data — it serializes what `GetStatus` returns

## Examples

```
$ specd change status add-oauth-login
change:      add-oauth-login
state:       designing
specs:       auth/oauth
description: Add OAuth2 login via Google

artifacts:
  proposal   complete
  specs      in-progress
  verify     missing
  design     missing
  tasks      missing

lifecycle:
  next artifact: specs
  approvals:     spec=off  signoff=off
  path:          .specd/changes/20260310-140000-add-oauth-login

blockers:
  → ready: requires — specs, verify, design, tasks
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — Change entity, artifact status derivation
- [`specs/core/get-status/spec.md`](../../core/get-status/spec.md) — `GetStatusResult` with lifecycle context
