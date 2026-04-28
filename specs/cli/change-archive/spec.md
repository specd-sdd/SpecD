# Change Archive

## Purpose

Once a change is fully approved, its spec deltas need to be promoted into the permanent spec tree so they become the source of truth. `specd changes archive <name>` is the canonical form and finalises a change by merging its deltas into the permanent spec directories and moving the change to the archive.

`specd change archive <name>` remains supported as an alias.

## Requirements

### Requirement: Command signature

```
specd changes archive <name> [--skip-hooks <phases>] [--allow-overlap] [--format text|json|toon]
```

Alias:

```
specd change archive <name> [--skip-hooks <phases>] [--allow-overlap] [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to archive
- `--skip-hooks <phases>` — optional; comma-separated list of archive hook phases to skip. Valid values: `pre`, `post`, `all`. When `all` is specified, all hook execution is skipped. When omitted, both phases execute.
- `--allow-overlap` — optional flag; permits archiving despite spec overlap with other active changes
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Prerequisites

The change must be in `archivable` state. If the change is in any other state, the command exits with code 1 and prints an `error:` message to stderr naming the current state.

### Requirement: Behaviour

The command delegates to the `ArchiveChange` use case, which:

1. Merges all spec delta artifacts into the permanent spec directories
2. Moves the change directory to the archive location determined by `storage.archivePattern`
3. Records the archive operation in the change history

### Requirement: Hook execution

By default, the `ArchiveChange` use case executes `run:` hooks for the `archiving` workflow step (pre-hooks before file modifications, post-hooks after the archive). When `--skip-hooks` is passed with specific phases, only those phases are skipped. When `--skip-hooks all` is passed, all hook execution is skipped — the caller is responsible for invoking hooks via `specd change run-hooks`.

The CLI maps the `--skip-hooks` option to an archive hook-phase selector set on `ArchiveChangeInput`.

### Requirement: Post-archive hooks

After a successful archive, if any post-archive hooks failed, the CLI exits with code 2 and reports the failures.

### Requirement: Output on success

On success, output depends on `--format`:

- `text` (default): prints to stdout: The invalidated changes section is omitted when no changes were invalidated.
  - The archive path line
  - If changes were invalidated due to overlap, a summary listing each invalidated change and the overlapping specs:
- `json` or `toon`: outputs the following to stdout (encoded in the respective format): where `<archive-path>` is the path to the archived change directory relative to the project root, and `invalidatedChanges` is the array from the `ArchiveChange` result (empty when no changes were invalidated).

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
specd change archive add-oauth-login --skip-hooks all
specd change archive add-oauth-login --skip-hooks pre
# → archived change add-oauth-login → .specd/archive/2026-02/add-oauth-login
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../../cli/entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:core/change`](../../core/change/spec.md) — archivable state, archive semantics
- [`core:core/archive-change`](../../core/archive-change/spec.md) — archive hook phase selectors and hook delegation
- [`core:core/hook-execution-model`](../../core/hook-execution-model/spec.md) — `--skip-hooks` manual-control pattern
- [`cli:cli/command-resource-naming`](../command-resource-naming/spec.md) — canonical plural naming and singular alias policy
