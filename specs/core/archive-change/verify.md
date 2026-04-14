# Verification: ArchiveChange

## Requirements

### Requirement: Archivable guard

#### Scenario: Change not in archivable state

- **GIVEN** a change that is not in `archivable` state
- **WHEN** `ArchiveChange.execute` is called
- **THEN** `InvalidStateTransitionError` is thrown from inside `ChangeRepository.mutate(input.name, fn)`
- **AND** no hooks are executed and no files are modified

#### Scenario: Change in archivable state transitions to archiving

- **GIVEN** the change is in `archivable` state
- **WHEN** `ArchiveChange.execute` is called
- **THEN** the archivable guard passes inside the serialized mutation callback
- **AND** the change transitions to `archiving` via `change.transition('archiving', actor)`
- **AND** the updated manifest is persisted before pre-archive hooks execute
- **AND** execution proceeds to pre-archive hooks using the change returned by that mutation

### Requirement: ReadOnly workspace guard

#### Scenario: Archive rejected when change contains readOnly specs

- **GIVEN** a change in `archivable` state with `specIds` including `platform:auth/tokens`
- **AND** the `platform` workspace has `readOnly` ownership
- **WHEN** `ArchiveChange.execute` is called
- **THEN** `ReadOnlyWorkspaceError` is thrown
- **AND** the error message lists the affected specs and workspaces
- **AND** no hooks are executed and no spec files are written

#### Scenario: Archive proceeds when all specs are in owned workspaces

- **GIVEN** a change in `archivable` state with all `specIds` in `owned` workspaces
- **WHEN** `ArchiveChange.execute` is called
- **THEN** the readOnly guard passes and execution proceeds to hooks

#### Scenario: Archive proceeds when specs are in shared workspaces

- **GIVEN** a change in `archivable` state with `specIds` in `shared` workspaces
- **WHEN** `ArchiveChange.execute` is called
- **THEN** the readOnly guard passes and execution proceeds to hooks

#### Scenario: Guard runs after archivable check and state transition

- **GIVEN** a change that is not in `archivable` state
- **WHEN** `ArchiveChange.execute` is called
- **THEN** `InvalidStateTransitionError` is thrown (from `assertArchivable`)
- **AND** the readOnly guard is never reached

### Requirement: Overlap guard

#### Scenario: Archive blocked when other changes target same specs

- **GIVEN** a change `alpha` in `archivable` state targeting `core:core/config`
- **AND** another active change `beta` also targets `core:core/config`
- **WHEN** `ArchiveChange.execute({ name: 'alpha' })` is called without `allowOverlap`
- **THEN** `SpecOverlapError` is thrown
- **AND** the error message includes `core:core/config` and `beta`
- **AND** no files are modified and no hooks are executed

#### Scenario: Archive with allowOverlap invalidates overlapping changes

- **GIVEN** a change `alpha` in `archivable` state targeting `core:core/config` and `core:core/kernel`
- **AND** another active change `beta` targeting `core:core/config` in `implementing` state
- **AND** another active change `gamma` targeting `core:core/kernel` in `ready` state
- **WHEN** `ArchiveChange.execute({ name: 'alpha', allowOverlap: true })` is called
- **THEN** the archive proceeds normally
- **AND** `beta` is invalidated to `designing` with cause `'spec-overlap-conflict'`
- **AND** `gamma` is invalidated to `designing` with cause `'spec-overlap-conflict'`
- **AND** `beta`'s invalidation message includes `'alpha'` and `'core:core/config'`
- **AND** `gamma`'s invalidation message includes `'alpha'` and `'core:core/kernel'`
- **AND** `result.invalidatedChanges` has two entries: `{ name: 'beta', specIds: ['core:core/config'] }` and `{ name: 'gamma', specIds: ['core:core/kernel'] }`

#### Scenario: Archive with allowOverlap invalidation happens via ChangeRepository.mutate

- **GIVEN** a change `alpha` in `archivable` state targeting `core:core/config`
- **AND** another active change `beta` also targets `core:core/config`
- **WHEN** `ArchiveChange.execute({ name: 'alpha', allowOverlap: true })` invalidates `beta`
- **THEN** the invalidation is performed inside `ChangeRepository.mutate('beta', fn)`
- **AND** the callback calls `change.invalidate('spec-overlap-conflict', message, affectedArtifacts)`

#### Scenario: No overlap with allowOverlap produces empty invalidatedChanges

- **GIVEN** a change `alpha` in `archivable` state targeting `core:core/config`
- **AND** no other active change targets `core:core/config`
- **WHEN** `ArchiveChange.execute({ name: 'alpha', allowOverlap: true })` is called
- **THEN** the archive proceeds normally
- **AND** `result.invalidatedChanges` is an empty array

#### Scenario: Overlap check excludes the change being archived

- **GIVEN** a change `alpha` in `archivable` state targeting `core:core/config`
- **AND** no other active change targets `core:core/config`
- **WHEN** `ArchiveChange.execute({ name: 'alpha' })` is called
- **THEN** `alpha` itself does not cause an overlap detection
- **AND** the archive proceeds normally

### Requirement: Pre-archive hooks

#### Scenario: Pre-archive run hook executes before file sync

- **GIVEN** the schema declares `workflow.archiving.hooks.pre: [{ run: 'pnpm test' }]`
- **WHEN** `ArchiveChange.execute` is called
- **THEN** `pnpm test` is executed before any spec files are written

#### Scenario: Failing pre-archive hook aborts archive

- **GIVEN** a pre-archive `run:` hook exits with code 1
- **WHEN** `ArchiveChange.execute` is called
- **THEN** `HookFailedError` is thrown
- **AND** no spec files are written or modified

#### Scenario: instruction entries in pre hooks are not executed

- **GIVEN** the schema declares a `workflow.archiving.hooks.pre` entry with `instruction: 'Review delta specs'`
- **WHEN** `ArchiveChange.execute` is called
- **THEN** no shell command is run for the instruction entry
- **AND** execution proceeds to the next hook

#### Scenario: skipHookPhases pre skips only pre hooks

- **GIVEN** a change in `archivable` state
- **AND** `skipHookPhases` is `new Set(['pre'])`
- **WHEN** `ArchiveChange.execute` is called
- **THEN** pre-archive hooks are skipped
- **AND** post-archive hooks still execute after the archive

### Requirement: Delta merge and spec sync

#### Scenario: Delta artifact merged into base spec

- **GIVEN** a change artifact contains delta modifications under `## MODIFIED Requirements`
- **AND** the base spec in `SpecRepository` has a `## Requirements` section with the targeted block
- **WHEN** `ArchiveChange.execute` is called
- **THEN** the merged content (with the modification applied) is saved to `SpecRepository`

#### Scenario: New artifact synced directly

- **GIVEN** a change artifact with no `deltas[]` configuration (a new file)
- **WHEN** `ArchiveChange.execute` is called
- **THEN** the artifact content is saved as-is to `SpecRepository`

#### Scenario: New spec with delta-capable artifact copied to project

- **GIVEN** a change has a spec ID for a spec that does not yet exist in the project
- **AND** the schema declares the artifact type with `delta: true`
- **AND** the change directory contains a full primary file (e.g. `specs/<workspace>/<path>/spec.md`) instead of a `.delta.yaml`
- **WHEN** `ArchiveChange.execute` is called
- **THEN** the primary file content is copied directly to `SpecRepository`
- **AND** the spec directory and file are created in the project

#### Scenario: Optional artifact with missing status — not synced

- **GIVEN** an optional artifact declared in the schema has no file in the change directory and `validatedHash` is `null` (status `missing`)
- **WHEN** `ArchiveChange.execute` is called
- **THEN** that artifact is not synced and no entry is created in `SpecRepository`

#### Scenario: Optional artifact with skipped status — not synced

- **GIVEN** an optional artifact has `validatedHash: "__skipped__"` in the manifest (status `skipped`) and no file in the change directory
- **WHEN** `ArchiveChange.execute` is called
- **THEN** that artifact is not synced and no entry is created in `SpecRepository`

#### Scenario: Conflict detected at archive time

- **GIVEN** the delta file has a conflict (same block in MODIFIED and REMOVED)
- **WHEN** `ArchiveChange.execute` reaches the merge step
- **THEN** `DeltaConflictError` is thrown

#### Scenario: Markdown delta merge preserves untouched inline formatting

- **GIVEN** a base markdown spec with untouched prose containing inline code like `` `specd change validate <name>` ``
- **AND** the delta modifies a different section in the same file
- **WHEN** `ArchiveChange.execute` merges and serializes the markdown artifact
- **THEN** untouched prose still contains inline-code backticks and unescaped `<name>` text

#### Scenario: Mixed markdown style serializes deterministically

- **GIVEN** a base markdown spec that mixes unordered list markers (`-` and `*`) or emphasis markers (`*` and `_`) for the same construct
- **WHEN** `ArchiveChange.execute` merges and serializes the markdown artifact
- **THEN** output style is deterministic and follows project markdown conventions

### Requirement: ArchivedChange construction

#### Scenario: archivedName derived from createdAt

- **GIVEN** a change with `createdAt = 2024-01-15T12:00:00Z` and `name = 'add-auth-flow'`
- **WHEN** `ArchiveChange` constructs the `ArchivedChange`
- **THEN** `archivedName` is `20240115-120000-add-auth-flow`

#### Scenario: ArchivedChange has no approval or wasStructural fields

- **WHEN** `ArchiveChange` constructs the `ArchivedChange`
- **THEN** the result has no `approval` field and no `wasStructural` field

### Requirement: Post-archive hooks

#### Scenario: Post-archive hook runs after archive

- **GIVEN** the schema declares `workflow.archiving.hooks.post: [{ run: 'git commit -m "archive"' }]`
- **WHEN** `ArchiveChange.execute` succeeds
- **THEN** the `run:` command executes after `archiveRepository.archive()` is called

#### Scenario: Failing post-archive hook does not roll back archive

- **GIVEN** a post-archive `run:` hook exits with code 1
- **WHEN** `ArchiveChange.execute` is called
- **THEN** the archive is not rolled back
- **AND** the result's `postHookFailures` includes the failed hook

#### Scenario: skipHookPhases post skips only post hooks

- **GIVEN** a change in `archivable` state
- **AND** `skipHookPhases` is `new Set(['post'])`
- **WHEN** `ArchiveChange.execute` is called
- **THEN** post-archive hooks are skipped
- **AND** pre-archive hooks still execute before file modifications

### Requirement: Spec metadata generation

#### Scenario: Metadata generated for modified specs after archive

- **GIVEN** a change with specIds `["default:auth/login"]` is archived
- **WHEN** the archive process runs post-merge metadata generation
- **THEN** `SaveSpecMetadata` is called with JSON-serialized content for each spec

#### Scenario: Manifest specDependsOn overrides extracted dependsOn

- **GIVEN** a change has `specDependsOn: { "default:auth/login": ["default:auth/shared"] }`
- **AND** the spec's `## Spec Dependencies` section links to `auth/jwt`
- **WHEN** `ArchiveChange.execute` generates metadata for `auth/login`
- **THEN** the written `.specd-metadata.yaml` has `dependsOn: [default:auth/shared]` (from the manifest, not from extraction)

#### Scenario: Metadata generation failure does not abort archive

- **GIVEN** a spec has no `# Title` heading and the schema's `metadataExtraction.title` selector matches nothing
- **WHEN** `ArchiveChange.execute` runs metadata generation for that spec
- **THEN** the archive is not rolled back
- **AND** the spec path appears in `staleMetadataSpecPaths`

#### Scenario: staleMetadataSpecPaths empty on full success

- **GIVEN** all modified specs produce valid metadata
- **WHEN** `ArchiveChange.execute` completes
- **THEN** `staleMetadataSpecPaths` is empty

### Requirement: Result shape

#### Scenario: Successful archive returns result with empty invalidatedChanges

- **WHEN** `ArchiveChange.execute` completes successfully with no overlap
- **THEN** the result includes the `ArchivedChange` record
- **AND** `postHookFailures` is empty
- **AND** `invalidatedChanges` is empty

#### Scenario: Result includes invalidated changes after overlap

- **GIVEN** `ArchiveChange.execute` was called with `allowOverlap: true`
- **AND** two overlapping changes were invalidated
- **WHEN** the result is returned
- **THEN** `invalidatedChanges` has two entries with `name` and `specIds` for each invalidated change

#### Scenario: Pre-archive failure throws

- **WHEN** a pre-archive hook fails
- **THEN** `ArchiveChange.execute` throws and does not return a result
