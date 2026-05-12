# Proposal: archive-post-phase

## Motivation

After `ArchiveChange` moves a change from `changes/` to `archive/`, post-archive operations fail with `CHANGE_NOT_FOUND`. This breaks `change archive` itself (post-hooks fail), `change hook-instruction <name> archiving --phase post`, and `change run-hooks <name> archiving --phase post`. The archive succeeds but the error obscures success and prevents post-archive workflows.

## Current behaviour

1. `ArchiveChange.execute()` merges deltas, calls `archiveRepository.archive()` which moves the change directory
2. `ArchiveChange` then calls `RunStepHooks.execute({ name, step: 'archiving', phase: 'post' })`
3. `RunStepHooks` calls `ChangeRepository.get(name)` → `null` (change was moved)
4. Throws `ChangeNotFoundError` — CLI reports error despite successful archive
5. Same failure for `GetHookInstructions` called via CLI after archiving

Both use cases need `change.name`, `change.workspaces[0]`, and `ChangeRepository.changePath(change)` for template variable expansion. After archiving, the change is an `ArchivedChange` in `ArchiveRepository` — a different type in a different location.

## Proposed solution

Add `ArchiveRepository` as a fallback lookup in `RunStepHooks` and `GetHookInstructions`. When `ChangeRepository.get(name)` returns `null`, try `ArchiveRepository.get(name)`. If found, use the archived change's properties and resolve the path via a new `ArchiveRepository.archivePath(archivedChange)` method.

Additionally, add `archivePath(archivedChange)` to the `ArchiveRepository` port to expose the filesystem path for archived changes — mirroring `ChangeRepository.changePath(change)`.

## Specs affected

### New specs

_(none)_

### Modified specs

- `core:core/run-step-hooks`: Add `ArchiveRepository` port to constructor. In "Change lookup", fall back to `ArchiveRepository.get()` when `ChangeRepository` returns null. Build template variables from `ArchivedChange` properties and `ArchiveRepository.archivePath()`.
- `core:core/get-hook-instructions`: Same fallback pattern — add `ArchiveRepository` port, fallback lookup, and path resolution for archived changes.
- `core:core/archive-repository-port`: Add `archivePath(archivedChange): string` abstract method — returns the absolute filesystem path for an archived change's directory. Mirrors `ChangeRepository.changePath(change)` for active changes.

## Impact

- **Ports**: `ArchiveRepository` gains `archivePath(archivedChange): string` method
- **Use cases**: `RunStepHooks` and `GetHookInstructions` gain `ArchiveRepository` constructor parameter and fallback lookup logic
- **Kernel composition**: Both use cases need `ArchiveRepository` injected at composition time
- **CLI**: No changes — the commands already delegate to the use cases
- **No breaking changes** — `ArchiveRepository` is extended, not modified; existing callers are unaffected

## Open questions

_(none)_
