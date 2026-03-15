# Change Archive

## Purpose

Once a change is fully approved, its spec deltas need to be promoted into the permanent spec tree so they become the source of truth. `specd change archive <name>` finalises a change by merging its deltas into the permanent spec directories and moving the change to the archive.

## Requirements

### Requirement: Command signature

```
specd change archive <name> [--no-hooks] [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to archive
- `--no-hooks` — optional flag; skips `run:` hook execution, allowing the caller to manage hooks separately via `specd change run-hooks`
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Prerequisites

The change must be in `archivable` state. If the change is in any other state, the command exits with code 1 and prints an `error:` message to stderr naming the current state.

### Requirement: Behaviour

The command delegates to the `ArchiveChange` use case, which:

1. Merges all spec delta artifacts into the permanent spec directories
2. Moves the change directory to the archive location determined by `storage.archivePattern`
3. Records the archive operation in the change history

### Requirement: Hook execution

By default, the `ArchiveChange` use case executes `run:` hooks for the `archiving` workflow step (pre-hooks before file modifications, post-hooks after the archive). When `--no-hooks` is passed, hook execution is skipped — the caller is responsible for invoking hooks via `specd change run-hooks`.

### Requirement: Post-archive hooks

After a successful archive, if any post-archive hooks failed, the CLI exits with code 2 and reports the failures.

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
specd change archive add-oauth-login --no-hooks
# → archived change add-oauth-login → .specd/archive/2026-02/add-oauth-login
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — archivable state, archive semantics
- [`specs/core/archive-change/spec.md`](../../core/archive-change/spec.md) — skipHooks, hook delegation
- [`specs/core/hook-execution-model/spec.md`](../../core/hook-execution-model/spec.md) — --no-hooks pattern
