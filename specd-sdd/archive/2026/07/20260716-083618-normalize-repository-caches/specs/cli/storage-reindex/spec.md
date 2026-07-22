# Storage Reindex

## Purpose

Filesystem list indexes under `{configPath}/tmp/fs-cache/` can become stale after manual edits, external sync, or cache invalidation. Operators and agents need a single CLI entry point to force a full rebuild of those indexes without knowing cache file layout or JSONL wire shapes. `specd storage reindex` invokes repository port `reindex*` methods only — the CLI never reads or writes cache files directly.

## Requirements

### Requirement: Command signature

```
specd storage reindex [--changes] [--specs] [--archive] [--format text|json|toon]
```

- `--changes` — optional; rebuild change list indexes (active, drafts, and discarded) via `ChangeRepository.reindex()`
- `--specs` — optional; rebuild spec list indexes for every configured workspace via each workspace `SpecRepository.reindex()`
- `--archive` — optional; rebuild the archive list index via `ArchiveRepository.reindex()`
- `--format text|json|toon` — optional; output format, defaults to `text`

When **no** resource flag is set, the command MUST rebuild **all** FS list indexes: `ChangeRepository.reindex()`, `SpecRepository.reindex()` for every configured workspace, and `ArchiveRepository.reindex()`.

When one or more resource flags are set, the command MUST rebuild only the selected targets. Flags are combinable (for example `--changes --specs` rebuilds change and spec indexes but not archive).

### Requirement: Port delegation

The command MUST obtain repository instances through the normal composition/kernel wiring used by other storage commands.

The command MUST invoke only these port surfaces:

- `ChangeRepository.reindex()` when `--changes` is selected or when rebuilding all
- `SpecRepository.reindex()` for each configured workspace when `--specs` is selected or when rebuilding all
- `ArchiveRepository.reindex()` when `--archive` is selected or when rebuilding all

The CLI MUST NOT:

- read or write files under `{configPath}/tmp/fs-cache/` directly
- parse or emit JSONL index wire shapes
- call per-bucket change methods (`reindexActive`, `reindexDrafts`, `reindexDiscarded`) in v1 — those remain port-only for programmatic use

### Requirement: Output format

In `text` mode (default), after all selected reindex operations complete successfully, the command prints one summary line per rebuilt target to stdout:

```
reindexed changes
reindexed specs (default)
reindexed specs (billing)
reindexed archive
```

Workspace lines use the configured workspace name. When rebuilding all with no flags, every applicable line MUST appear.

In `json` or `toon` mode, stdout is an object listing what was rebuilt:

```json
{
  "reindexed": {
    "changes": true,
    "specs": ["default", "billing"],
    "archive": true
  }
}
```

Omitted keys reflect targets that were not rebuilt. An empty `specs` array means no workspace spec indexes were rebuilt.

### Requirement: Error cases

If any selected `reindex()` call throws or rejects, the command exits with code 3 and prints an `error:` message to stderr. Partial rebuilds completed before the failure are not rolled back; stderr SHOULD indicate which target failed when the underlying error permits.

If the project has no configured workspaces and `--specs` is selected (or all targets are rebuilt), spec reindex is a no-op and produces no spec workspace lines.

## Constraints

- Reindex is a write-side maintenance operation; it does not list or count entries
- The command requires a valid `specd.yaml` and uses standard config discovery from [`cli:entrypoint`](../entrypoint/spec.md)
- Errors always go to stderr as plain text regardless of `--format`
- `--format` only affects stdout

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:change-repository-port`](../../core/change-repository-port/spec.md) — `reindex()` for change buckets
- [`core:spec-repository-port`](../../core/spec-repository-port/spec.md) — `reindex()` per workspace
- [`core:archive-repository-port`](../../core/archive-repository-port/spec.md) — `reindex()` for archive list index
- [`core:storage`](../../core/storage/spec.md) — fs-cache layout and reindex semantics
- [`core:composition`](../../core/composition/spec.md) — repository factory wiring
