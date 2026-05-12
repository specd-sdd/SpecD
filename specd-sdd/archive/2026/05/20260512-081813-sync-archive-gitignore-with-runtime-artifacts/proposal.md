# Proposal: sync-archive-gitignore-with-runtime-artifacts

## Motivation

Archive runtime artifacts currently rely on an ignore rule that is created during project initialization, even though the archive index can be created or rebuilt later by normal archive operations. That coupling makes the archive directory brittle when it is moved, recreated, or otherwise loses its init-time `.gitignore` state.

## Current behaviour

Today `InitProject` creates `archive/.gitignore` with an entry for `.specd-index.jsonl`. The archive runtime then creates, appends, or rebuilds `.specd-index.jsonl` independently through `FsArchiveRepository`, but it does not own the ignore-file maintenance for that runtime artifact.

This leaves two gaps:

- archive ignore state depends on a one-time bootstrap step instead of the runtime behavior that actually produces the artifacts
- the archive-local `.staging` directory used during archive operations is not guaranteed to be ignored alongside `.specd-index.jsonl`

## Proposed solution

Make `FsArchiveRepository` responsible for keeping the archive-local `.gitignore` aligned with the runtime artifacts it creates. When `FsArchiveRepository` creates, appends, or rebuilds `.specd-index.jsonl`, it must also ensure that the archive directory has ignore entries for both `.specd-index.jsonl` and `.staging`.

`InitProject` does not need to carry this ignore-file guarantee. The authoritative behavior must live in `FsArchiveRepository` so the archive directory remains self-healing after relocation, recreation, or recovery.

## Specs affected

### New specs

- none

### Modified specs

- `core:storage`: clarify that fs-backed archive storage maintains archive-local ignore rules for runtime archive artifacts, including `.specd-index.jsonl` and `.staging`, as part of archive directory preparation and index maintenance behavior.
  - Depends on (added): none
- `core:init-project`: narrow the bootstrap responsibility so init no longer carries the primary behavioral guarantee for archive runtime ignore maintenance.
  - Depends on (added): none
- `core:archive-repository-port`: clarify that `FsArchiveRepository` owns archive-local ignore maintenance as part of archive index creation, append, and recovery behavior, keeping `.specd-index.jsonl` and `.staging` ignored.
  - Depends on (added): none

## Impact

Affected code is concentrated in fs-backed archive infrastructure and init-time filesystem setup:

- `packages/core/src/infrastructure/fs/archive-repository.ts`
- `packages/core/src/infrastructure/fs/config-writer.ts`
- tests covering archive repository behavior and init-project/config-writer side effects

Behaviorally, this changes when and where archive `.gitignore` entries are guaranteed, but it does not change archive directory naming, archive manifest structure, or the append-only archive model.

## Technical context

Investigation during discovery confirmed that `.specd-index.jsonl` is recreated by archive runtime code, not by config loading. In particular, `FsArchiveRepository.list()` calls `_ensureIndex()`, which triggers `reindex()` when the index file is missing, and `_appendIndex()` can also create the index file through append-on-missing behavior.

Relevant implementation points discussed:

- `packages/core/src/infrastructure/fs/archive-repository.ts` owns archive runtime behavior around `.specd-index.jsonl` and is the correct owner for archive-local `.gitignore` maintenance
- `packages/core/src/infrastructure/fs/config-writer.ts` currently adds `.specd-index.jsonl` to `archive/.gitignore` during init
- archive runtime already uses a `.staging` area while archiving, so that directory should be treated as an archive-local runtime artifact for ignore purposes as well

An alternative of leaving ignore maintenance only in `InitProject` was rejected because it does not keep archive ignore state correct after archive directory movement or recreation. Early discovery also ruled out treating this as a `core:config` concern; the relevant behavior lives in archive fs infrastructure and init writer behavior.

## Open questions

_none at proposal stage._
