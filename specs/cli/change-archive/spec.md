# Change Archive

## Purpose

Once a change is fully approved, its spec deltas need to be promoted into the permanent spec tree so they become the source of truth. `specd changes archive <name>` is the canonical form and finalises a change by merging its deltas into the permanent spec directories and moving the change to the archive.

`specd change archive <name>` remains supported as an alias.

## Requirements

### Requirement: Command signature

```
specd changes archive <name> [--skip-hooks <phases>] [--allow-overlap] [--allow-out-of-scope] [--format text|json|toon]
```

Alias:

```
specd change archive <name> [--skip-hooks <phases>] [--allow-overlap] [--allow-out-of-scope] [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to archive
- `--skip-hooks <phases>` — optional; comma-separated list of archive hook phases to skip. Valid values: `pre`, `post`, `all`. When `all` is specified, all hook execution is skipped. When omitted, both phases execute.
- `--allow-overlap` — optional flag; permits archiving despite spec overlap with other active changes
- `--allow-out-of-scope` — optional flag; permits archiving when implementation links resolve outside the change scope (`impl.linksInScope`)
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Prerequisites

The change must be in `archivable` or `archiving` state (`archiving` is a retry after a failed archive commit). If the change is in any other state, the command exits with code 1 and prints an `error:` message to stderr naming the current state. The CLI delegates this guard to `ArchiveChange` (`assertArchivable`); it MUST NOT apply a second, narrower state table.

### Requirement: Behaviour

The command delegates to the `ArchiveChange` use case, which:

1. Merges all spec delta artifacts into the permanent spec directories
2. Moves the change directory to the archive location determined by `storage.archivePattern`
3. Records the archive operation in the change history

### Requirement: Hook execution

By default, the `ArchiveChange` use case executes `run:` hooks for the `archiving` workflow step (pre-hooks before file modifications, post-hooks after the archive). When `--skip-hooks` is passed with specific phases, only those phases are skipped. When `--skip-hooks all` is passed, all hook execution is skipped — the caller is responsible for invoking hooks via `specd change run-hooks`.

The CLI maps the `--skip-hooks` option to an archive hook-phase selector set on `ArchiveChangeInput`.

### Requirement: Check progress rendering

When `ArchiveChange` emits generic check progress events, the CLI MUST render them in text mode as:

```text
<label> (<id>)
  …optional check-progress lines…
✓ <label>
# or
✗ <label>: <reason>
```

Labels are gerund phrases from each check. The CLI MUST NOT print an `Executing:` prefix. Hooks MUST appear on this same bus (`Running pre hooks` / `Running post hooks`), not as a separate public progress contract.

### Requirement: Post-archive hooks

After a successful archive, if any post-archive hooks failed, the CLI exits with code 2 and reports the failures.

### Requirement: Output on success

On success, output depends on `--format`:

- `text` (default): prints to stdout:
  - The archive path line
  - If changes were invalidated due to overlap, a summary listing each invalidated change and the overlapping specs
  - The invalidated changes section is omitted when no changes were invalidated
- `json` or `toon`: MUST follow Requirement: JSON output on success (NDJSON `stream: "change-archive"` complete record). MUST NOT emit a second unwrapped `{ result: "ok" }` object after the stream.

### Requirement: Output on success (extended)

When archiving with `--allow-overlap`:

- Text mode includes an "invalidated N overlapping changes:" section listing each change and its overlapping specs
- JSON mode includes `invalidatedChanges` array with each entry's `name` and `specIds`

When no changes are invalidated, this section is omitted in text mode.

### Requirement: JSON output on success

When `--format json` or `toon` is specified, success MUST emit a terminal structured stream record with `stream: "change-archive"`, `event.type: "complete"`, and `event.result` containing `result: "ok"`, `name`, `archivePath`, and `invalidatedChanges`. Progress records on the same stream MUST precede that complete record. Callers MUST NOT require a second unwrapped JSON object after the stream.

### Requirement: Error cases

- If the change does not exist, exits with code 1.
- If the change is not in `archivable` or `archiving` state, exits with code 1.
- If a delta merge fails (conflict or parse error), exits with code 1 and prints a descriptive error.

## Constraints

- Only changes in `archivable` or `archiving` state may be archived
- The archive path is determined by `storage.archivePattern` in `specd.yaml`

## Examples

```
specd change archive add-oauth-login
specd change archive add-oauth-login --skip-hooks all
specd change archive add-oauth-login --skip-hooks pre
# → archived change add-oauth-login → .specd/archive/2026-02/add-oauth-login
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:change`](../../core/change/spec.md) — archivable state, archive semantics
- [`core:archive-change`](../../core/archive-change/spec.md) — archive hook phase selectors and hook delegation
- [`core:hook-execution-model`](../../core/hook-execution-model/spec.md) — `--skip-hooks` manual-control pattern
- [`cli:command-resource-naming`](../command-resource-naming/spec.md) — canonical plural naming and singular alias policy
- [`core:transition-checks`](../../core/transition-checks/spec.md) — generic check progress bus and gerund labels
