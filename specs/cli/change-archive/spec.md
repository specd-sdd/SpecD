# Change Archive

## Purpose

Once a change is fully approved, its spec deltas need to be promoted into the permanent spec tree so they become the source of truth. `specd change archive <name>` finalises a change by merging its deltas into the permanent spec directories and moving the change to the archive.

## Requirements

### Requirement: Command signature

```
specd change archive <name> [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to archive
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Prerequisites

The change must be in `archivable` state. If the change is in any other state, the command exits with code 1 and prints an `error:` message to stderr naming the current state.

### Requirement: Behaviour

The command delegates to the `ArchiveChange` use case, which:

1. Merges all spec delta artifacts into the permanent spec directories
2. Moves the change directory to the archive location determined by `storage.archivePattern`
3. Records the archive operation in the change history

### Requirement: Post-archive hooks

After a successful archive, any `post:` hooks declared on the schema's `archivable` step or the project-level workflow are run. If a hook fails, the CLI exits with code 2.

### Requirement: Output on success

On success, output depends on `--format`:

- `text` (default): prints to stdout:

  ```
  archived change <name> → <archive-path>
  ```

- `json` or `toon`: outputs the following to stdout (encoded in the respective format):

  ```json
  { "result": "ok", "name": "<name>", "archivePath": "<archive-path>" }
  ```

where `<archive-path>` is the path to the archived change directory relative to the project root.

### Requirement: Error cases

- If the change does not exist, exits with code 1.
- If the change is not in `archivable` state, exits with code 1.
- If a delta merge fails (conflict or parse error), exits with code 1 and prints a descriptive error.

## Constraints

- Only changes in `archivable` state may be archived
- The archive path is determined by `storage.archivePattern` in `specd.yaml`

## Examples

```
specd change archive add-oauth-login
# → archived change add-oauth-login → .specd/archive/2026-02/add-oauth-login
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — archivable state, archive semantics
