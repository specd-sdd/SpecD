# Change Skip Artifact

## Overview

Defines the `specd change skip-artifact <name> <artifact-id> [--reason <text>]` command, which explicitly marks an optional artifact as skipped when an agent or human decides not to produce it.

## Requirements

### Requirement: Command signature

```
specd change skip-artifact <name> <artifact-id> [--reason <text>] [--format text|json|toon]
```

- `<name>` — required positional; the name of the change
- `<artifact-id>` — required positional; the artifact type ID to mark as skipped (e.g. `proposal`)
- `--reason <text>` — optional; a human-readable explanation for skipping the artifact
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Behaviour

The command invokes the `SkipArtifact` use case, which calls `Artifact.markSkipped()` on the named artifact and appends an `artifact-skipped` event to the change history. The `validatedHash` is set to the sentinel `"__skipped__"`, transitioning the artifact's effective status to `skipped`.

This command is the only permitted path through which an artifact reaches `skipped` status. An agent must call this command explicitly when it decides not to produce an optional artifact — it cannot simply omit the file.

### Requirement: Optional artifacts only

Only artifacts declared as `optional: true` in the schema may be skipped. Attempting to skip a non-optional artifact exits with code 1 and prints an `error:` message to stderr.

### Requirement: Output on success

On success, output depends on `--format`:

- `text` (default): prints to stdout:

  ```
  skipped artifact <artifact-id> on <name>
  ```

- `json` or `toon`: outputs (encoded in the respective format):

  ```json
  { "result": "ok", "name": "<name>", "artifactId": "<artifact-id>" }
  ```

### Requirement: Error cases

- If the change does not exist, exits with code 1.
- If the artifact ID is not declared in the active schema, exits with code 1.
- If the artifact is not `optional: true`, exits with code 1.

## Constraints

- `Artifact.markSkipped()` may only be called from this use case — no other code path may set `validatedHash` to the sentinel
- Skipping satisfies the artifact's dependency in `requires` chains — downstream artifacts treat it as resolved
- If the artifact was previously `complete`, skipping it clears `validatedHash` and sets the sentinel; if an approval was active, the change is invalidated per the standard invalidation rules

## Examples

```
specd change skip-artifact add-oauth-login proposal --reason "scope too small to need a proposal"
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — artifact skipped semantics, optional artifacts, sentinel value
