# Verification: ArchiveChange

## Requirements

### Requirement: Ports and constructor

#### Scenario: All dependencies injected via constructor

- **WHEN** `ArchiveChange` is instantiated
- **THEN** all required repositories, services, and registries are provided through the constructor rather than created internally

#### Scenario: ArchiveChange is constructed with extractor runtime wiring

- **GIVEN** the archive workflow is composed for runtime use
- **WHEN** `ArchiveChange` is instantiated
- **THEN** the constructor receives `ArtifactParserRegistry`
- **AND** the constructor receives `ExtractorTransformRegistry`
- **AND** the constructor receives `SpecWorkspaceRoute[]`
- **AND** those dependencies are used for the pre-publication metadata extraction pass over prepared merged artifacts

### Requirement: Input

#### Scenario: Default values for optional fields

- **WHEN** execute is called with only a name
- **THEN** hooks are not skipped and overlap is not allowed by default.

### Requirement: Schema name guard

#### Scenario: Mismatched schema throws error

- **GIVEN** a change with schema A and project with schema B
- **WHEN** archive is called
- **THEN** the use case must throw `SchemaMismatchError`.

### Requirement: Archivable guard

#### Scenario: Change not in archivable state

- **GIVEN** a change that is not in `archivable` or `archiving` state
- **WHEN** `ArchiveChange.execute` is called
- **THEN** `InvalidStateTransitionError` is thrown from `assertArchivable()`
- **AND** no hooks are executed and no files are modified

#### Scenario: Pre-archive hooks run while change remains archivable

- **GIVEN** the change is in `archivable` state
- **WHEN** `ArchiveChange.execute` runs pre-archive hooks
- **THEN** the change is still in `archivable` state during hook execution

#### Scenario: Change transitions to archiving immediately before publication

- **GIVEN** the change is in `archivable` state
- **AND** full-batch preflight succeeds
- **AND** batch snapshots are written
- **WHEN** canonical publication is about to begin
- **THEN** the change transitions to `archiving` via `change.transition('archiving', actor)` inside `ChangeRepository.mutate`
- **AND** the updated manifest is persisted before the first `SpecRepository.publish()` call

#### Scenario: Pre-hook failure leaves change in archivable

- **GIVEN** a pre-archive hook fails
- **WHEN** `ArchiveChange.execute` aborts
- **THEN** the change remains in `archivable` state
- **AND** no `.specd-archive-backup/` directories are created

### Requirement: Deferred transition to archiving

#### Scenario: Transition occurs only after preflight and snapshots

- **GIVEN** full-batch preflight succeeds
- **AND** batch snapshots are written
- **WHEN** canonical publication begins
- **THEN** the change transitions to `archiving` inside `ChangeRepository.mutate` before the first publish

#### Scenario: Preflight failure never transitions to archiving

- **GIVEN** full-batch preflight fails
- **WHEN** `ArchiveChange.execute` aborts
- **THEN** the change remains in `archivable` state

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

- **GIVEN** a change `alpha` in `archivable` state targeting `core:config`
- **AND** another active change `beta` also targets `core:config`
- **WHEN** `ArchiveChange.execute({ name: 'alpha' })` is called without `allowOverlap`
- **THEN** `SpecOverlapError` is thrown
- **AND** the error message includes `core:config` and `beta`
- **AND** no files are modified and no hooks are executed

#### Scenario: Archive with allowOverlap invalidates overlapping changes

- **GIVEN** a change `alpha` in `archivable` state targeting `core:config` and `core:kernel`
- **AND** another active change `beta` targeting `core:config` in `implementing` state
- **AND** another active change `gamma` targeting `core:kernel` in `ready` state
- **WHEN** `ArchiveChange.execute({ name: 'alpha', allowOverlap: true })` is called
- **THEN** the archive proceeds normally
- **AND** `beta` is invalidated to `designing` with cause `'spec-overlap-conflict'`
- **AND** `gamma` is invalidated to `designing` with cause `'spec-overlap-conflict'`
- **AND** `beta`'s invalidation message includes `'alpha'` and `'core:config'`
- **AND** `gamma`'s invalidation message includes `'alpha'` and `'core:kernel'`
- **AND** `result.invalidatedChanges` has two entries: `{ name: 'beta', specIds: ['core:config'] }` and `{ name: 'gamma', specIds: ['core:kernel'] }`

#### Scenario: Archive with allowOverlap invalidation happens via ChangeRepository.mutate

- **GIVEN** a change `alpha` in `archivable` state targeting `core:config`
- **AND** another active change `beta` also targets `core:config`
- **WHEN** `ArchiveChange.execute({ name: 'alpha', allowOverlap: true })` invalidates `beta`
- **THEN** the invalidation is performed inside `ChangeRepository.mutate('beta', fn)`
- **AND** the callback calls `change.invalidate('spec-overlap-conflict', message, affectedArtifacts)`

#### Scenario: No overlap with allowOverlap produces empty invalidatedChanges

- **GIVEN** a change `alpha` in `archivable` state targeting `core:config`
- **AND** no other active change targets `core:config`
- **WHEN** `ArchiveChange.execute({ name: 'alpha', allowOverlap: true })` is called
- **THEN** the archive proceeds normally
- **AND** `result.invalidatedChanges` is an empty array

#### Scenario: Overlap check excludes the change being archived

- **GIVEN** a change `alpha` in `archivable` state targeting `core:config`
- **AND** no other active change targets `core:config`
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

### Requirement: Archive repository call

#### Scenario: Calls archiveRepository.archive with actor

- **GIVEN** `ActorResolver.identity()` returns a valid actor
- **WHEN** `ArchiveChange.execute` completes the delta merge step
- **THEN** it calls `archiveRepository.archive(change, { actor })` with the resolved actor

#### Scenario: Missing actor identity aborts archive

- **GIVEN** `ActorResolver.identity()` throws or cannot provide an actor
- **WHEN** `ArchiveChange.execute` attempts to archive the change
- **THEN** the archive fails
- **AND** `archiveRepository.archive()` is not called

#### Scenario: ArchivedChange constructed by repository, not use case

- **WHEN** `ArchiveChange.execute` succeeds
- **THEN** the returned `archivedChange` is constructed by the repository
- **AND** the use case does not directly construct the `ArchivedChange` record

### Requirement: ArchivedChange construction

#### Scenario: archivedName derived from createdAt

- **GIVEN** a change with `createdAt = 2024-01-15T12:00:00Z` and `name = 'add-auth-flow'`
- **WHEN** `ArchiveChange` constructs the `ArchivedChange`
- **THEN** `archivedName` is `20240115-120000-add-auth-flow`

#### Scenario: ArchivedChange has no approval or wasStructural fields

- **WHEN** `ArchiveChange` constructs the `ArchivedChange`
- **THEN** the result has no `approval` field and no `wasStructural` field

#### Scenario: ArchivedChange workspace derived from specIds at runtime

- **GIVEN** a change with `specIds: ['core:archive-change', 'cli:context']`
- **WHEN** `ArchiveChange` constructs the `ArchivedChange`
- **THEN** the `ArchivedChange` record does NOT contain a `workspace` property
- **AND** calling `archivedChange.workspaces` returns `['core', 'cli']` (derived from specIds)

#### Scenario: ArchivedChange.workspaces returns unique workspaces from specIds

- **GIVEN** a change with `specIds: ['core:a', 'core:b', 'cli:x']`
- **WHEN** the change is archived and `archivedChange.workspaces` is accessed
- **THEN** the result is `['core', 'cli']` (unique workspaces only)

#### Scenario: Archive index entry does not contain workspace field

- **GIVEN** a change is archived
- **WHEN** reading the archive index (`index.jsonl`)
- **THEN** each entry does NOT contain a `workspace` field
- **AND** the workspace can be derived from `specIds[0]` (first entry in the specIds array)

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

#### Scenario: Persisted metadata generation runs after archive move

- **GIVEN** canonical publication and archive move succeed
- **WHEN** `ArchiveChange.execute` generates persisted `metadata.json`
- **THEN** `GenerateSpecMetadata` runs after `archiveRepository.archive()`

#### Scenario: Metadata failure does not roll back archive

- **GIVEN** archive move succeeds
- **AND** persisted metadata generation fails for one spec
- **WHEN** `ArchiveChange.execute` completes
- **THEN** the change is archived
- **AND** the failed spec path is listed in `staleMetadataSpecPaths`

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

### Requirement: Tracked artifact selection at archive time

#### Scenario: Tracked direct artifact wins over stray delta file

- **GIVEN** a change tracks `verify` for `core:new-capability` as `specs/core/core/new-capability/verify.md`
- **AND** an unrelated file also exists at `deltas/core/core/new-capability/verify.md.delta.yaml`
- **WHEN** `ArchiveChange.execute` prepares archive input for that artifact
- **THEN** it reads the tracked `specs/.../verify.md` file from the change
- **AND** it does not probe or apply the stray `deltas/...` file

#### Scenario: Missing tracked file fails even if an alternate path exists

- **GIVEN** a change tracks `verify` for `core:new-capability` as `specs/core/core/new-capability/verify.md`
- **AND** that tracked file is missing
- **AND** a file exists at `deltas/core/core/new-capability/verify.md.delta.yaml`
- **WHEN** `ArchiveChange.execute` prepares archive input for that artifact
- **THEN** archive fails because the tracked file is missing
- **AND** the alternate path does not satisfy the artifact

### Requirement: Prepare archive plan before permanent writes

#### Scenario: Later artifact failure prevents all permanent writes

- **GIVEN** archive can compute merged output for `spec.md`
- **AND** a later artifact such as `verify.md` fails during tracked-file resolution or delta application
- **WHEN** `ArchiveChange.execute` prepares the archive plan
- **THEN** no permanent spec artifact is written
- **AND** the change remains pending archive from an external observer's point of view

#### Scenario: Delta base is checked during prepare phase

- **GIVEN** a tracked delta artifact requires an existing base artifact in the target spec repository
- **AND** that base artifact is missing
- **WHEN** `ArchiveChange.execute` prepares the archive plan
- **THEN** the archive fails before any permanent write begins

#### Scenario: Later spec preflight failure blocks earlier spec publication

- **GIVEN** archive has prepared a multi-spec batch
- **AND** an earlier spec in the batch is ready to publish
- **AND** a later spec in the same batch still has an archive-time check that will fail
- **WHEN** `ArchiveChange.execute` performs full-batch preflight
- **THEN** the later failure is detected before canonical publication begins for any spec
- **AND** the earlier spec is not published first

#### Scenario: Metadata consistency failure is part of prepare-phase preflight

- **GIVEN** archive has prepared merged canonical content for multiple specs
- **AND** one spec produces an extracted `dependsOn` value that conflicts with the final persisted dependency set
- **WHEN** `ArchiveChange.execute` completes archive-batch preflight
- **THEN** the mismatch fails the archive before canonical publication begins for every spec in the batch

### Requirement: Staged archive commit and failed-attempt visibility

#### Scenario: Pre-publication failure leaves no canonical spec writes

- **GIVEN** archive execution has started
- **AND** a failure occurs before staged publication to canonical storage begins
- **WHEN** `ArchiveChange.execute` aborts
- **THEN** no canonical spec repository shows a partially synced artifact

#### Scenario: Publication unit includes spec-lock sidecar

- **GIVEN** archive has prepared merged canonical artifacts for a spec
- **AND** archive has determined the final `spec-lock.json` content for that spec
- **WHEN** staged publication is built
- **THEN** the publication unit includes both the merged canonical spec artifacts and `spec-lock.json`

#### Scenario: Publication failure preserves staged output for manual recovery

- **GIVEN** staged archive output has been prepared for a spec
- **AND** final publication from staging to canonical storage fails for that spec
- **WHEN** `ArchiveChange.execute` reports the failure
- **THEN** the canonical spec tree does not contain a partially written version of that spec
- **AND** the staged output is not deleted automatically
- **AND** the reported failure indicates that the staged material can be moved manually

#### Scenario: Batch preflight succeeds before first staged publication starts

- **GIVEN** a change archives more than one spec
- **WHEN** the first staged publication unit begins
- **THEN** every archive-time check that can still fail the archive has already succeeded for the full batch

#### Scenario: Multi-spec archive is not required to be one filesystem transaction

- **GIVEN** a change archives more than one spec
- **WHEN** the archive contract is evaluated
- **THEN** the spec guarantees full-batch preflight atomicity before canonical publication starts
- **AND** it guarantees atomic publication per spec once staged canonical publication has started
- **AND** it does not promise one indivisible filesystem transaction for the whole batch

### Requirement: Batch canonical snapshot before publication

#### Scenario: Snapshot includes pre-existing spec-lock.json

- **GIVEN** a spec already has canonical `spec-lock.json`
- **WHEN** batch snapshots are written before publication
- **THEN** `spec-lock.json` is copied into `.specd-archive-backup/`
- **AND** `manifest.existingFiles` includes `spec-lock.json`

#### Scenario: New spec records specDirExisted false

- **GIVEN** a spec directory does not exist before archive
- **WHEN** batch snapshots are written
- **THEN** `manifest.specDirExisted` is `false`
- **AND** no canonical files are copied into the backup directory

### Requirement: Batch canonical restore on commit failure

#### Scenario: Later publish failure restores earlier published spec

- **GIVEN** a multi-spec archive batch
- **AND** publication succeeds for the first spec
- **WHEN** publication fails for a later spec
- **THEN** the first spec is restored to its pre-attempt canonical state
- **AND** `.specd-archive-backup/` is deleted after successful restore

#### Scenario: New spec directory is removed on restore

- **GIVEN** a spec directory did not exist before archive
- **AND** publication created the spec directory
- **WHEN** commit-phase restore runs
- **THEN** the created spec directory is removed

#### Scenario: Only created files are deleted for existing spec

- **GIVEN** a spec directory existed before archive with `spec.md` only
- **AND** archive created `verify.md` during publication
- **WHEN** commit-phase restore runs
- **THEN** `spec.md` is restored from backup
- **AND** `verify.md` is deleted

#### Scenario: Retry after restore does not duplicate delta merge

- **GIVEN** an archive attempt failed after partial publication
- **AND** batch restore completed successfully
- **WHEN** archive is retried
- **THEN** delta merge runs against the pre-attempt canonical base

### Requirement: Orphan archive backup detection

#### Scenario: Matching orphan backup auto-restores and aborts

- **GIVEN** `.specd-archive-backup/manifest.json` exists for the same change name
- **WHEN** `ArchiveChange.execute` starts commit preparation
- **THEN** canonical storage is restored from the orphan backup
- **AND** the archive attempt aborts with guidance to review and retry

### Requirement: Lifecycle rollback after failed commit

#### Scenario: Successful restore transitions to archivable

- **GIVEN** commit-phase archive failure after transition to `archiving`
- **AND** batch restore succeeds
- **WHEN** the use case completes error handling
- **THEN** the change is in `archivable` state

### Requirement: spec-lock sidecar persistence

#### Scenario: First archive creates spec-lock sidecar with schema and dependsOn

- **GIVEN** a spec has no existing `spec-lock.json`
- **AND** archive has determined `change.specDependsOn` for that spec
- **WHEN** `ArchiveChange.execute` archives the spec
- **THEN** `spec-lock.json` is persisted with `schema.name` and `schema.version` from the active schema
- **AND** `dependsOn` is set to the final `change.specDependsOn` value

#### Scenario: Re-archive preserves immutable schema and refreshes dependsOn

- **GIVEN** a spec already has `spec-lock.json` with `schema: { name: "schema-std", version: 1 }`
- **AND** the current archive changes `specDependsOn` for that spec
- **WHEN** `ArchiveChange.execute` archives the spec
- **THEN** `spec-lock.json` retains the original `schema` object unchanged
- **AND** `dependsOn` is replaced with the new `change.specDependsOn` value

#### Scenario: Mismatch between extracted dependsOn and persisted sidecar fails archive

- **GIVEN** a spec has an existing `spec-lock.json` with `dependsOn`
- **AND** metadata extraction produces a `dependsOn` value that differs from `change.specDependsOn`
- **WHEN** `ArchiveChange.execute` validates consistency
- **THEN** archive fails with a mismatch error
- **AND** no metadata is saved

#### Scenario: Sidecar dependsOn used as fallback when extraction omits dependsOn

- **GIVEN** a spec has an existing `spec-lock.json` with `dependsOn: ["core:canonical"]`
- **AND** metadata extraction succeeds but does not produce a `dependsOn` value
- **WHEN** `ArchiveChange.execute` generates metadata
- **THEN** the metadata `dependsOn` falls back to the sidecar's `dependsOn` value

### Requirement: Archive debug logging

#### Scenario: Archive emits debug diagnostics for tracked selection and commit phases

- **WHEN** `ArchiveChange.execute` runs with debug logging enabled
- **THEN** debug logs cover tracked artifact selection, archive-plan preparation, staged commit start, and staged commit completion

#### Scenario: Snapshot and restore phases emit debug diagnostics

- **GIVEN** full-batch preflight succeeds
- **WHEN** `ArchiveChange.execute` runs orphan detection, batch snapshot, publication, archive move, or commit-phase restore
- **THEN** debug logs cover orphan detection outcome, per-spec snapshot start and completion, deferred transition to `archiving`, backup cleanup, and batch restore with restored vs failed spec IDs

#### Scenario: Post-commit phases emit debug diagnostics

- **GIVEN** canonical publication and archive move succeed
- **WHEN** persisted metadata generation and post-archive hooks run
- **THEN** debug logs cover metadata generation per spec and post-archive hook start and completion

#### Scenario: Archive failure emits debug diagnostics

- **GIVEN** archive fails during tracked artifact resolution, delta application, staged commit, archive move, or metadata generation
- **WHEN** the failure is reported
- **THEN** debug logs include the failure step, `commitStarted` when applicable, and the spec ID or artifact being processed
- **AND** when `commitStarted` is true, debug logs include batch restore outcome and whether lifecycle rolled back to `archivable`

### Requirement: Opportunistic sidecar backfill

#### Scenario: Compatible legacy spec receives sidecar during opportunistic backfill

- **GIVEN** a persisted legacy spec has no `spec-lock.json`
- **AND** the canonical spec passes structural validation under the current schema
- **WHEN** archive or metadata regeneration performs opportunistic backfill
- **THEN** `spec-lock.json` is created
- **AND** its `dependsOn` comes from the current persisted dependency view
- **AND** its `schema` records the current project schema identity

#### Scenario: Incompatible legacy spec is left on legacy path

- **GIVEN** a persisted legacy spec has no `spec-lock.json`
- **AND** the canonical spec fails structural validation under the current schema
- **WHEN** opportunistic backfill is attempted
- **THEN** no sidecar is created implicitly
- **AND** legacy `metadata.json` generation may still continue

### Requirement: Tracked implementation review guard

#### Scenario: Open tracked implementation file blocks archive

- **GIVEN** a change still has a tracked implementation file in `open` state
- **WHEN** `ArchiveChange.execute` is called
- **THEN** archive fails
- **AND** the error tells the operator to resolve or ignore that tracked file explicitly

### Requirement: Implementation materialization into spec-lock

#### Scenario: File-level and symbol-level links materialize into sidecar

- **GIVEN** a change has one confirmed file-level link and one confirmed symbol-level link
- **WHEN** the change archives successfully
- **THEN** `spec-lock.json` persists the file-level link without `symbols`
- **AND** it persists the symbol-level link with its non-empty `symbols` list

#### Scenario: Excluded path is ignored during sidecar materialization

- **GIVEN** a confirmed implementation link falls under the target workspace `graph.excludePaths`
- **WHEN** archive materializes links
- **THEN** that link is skipped without failing archive

#### Scenario: File outside target workspace codeRoot fails archive

- **GIVEN** a confirmed implementation link points to a raw file path outside the target workspace `codeRoot`
- **WHEN** archive materializes links
- **THEN** archive fails instead of writing an invalid canonical sidecar entry

### Requirement: Out-of-scope sidecar update guard

#### Scenario: Out-of-scope sidecar maintenance fails by default

- **GIVEN** implementation integrity maintenance would require sidecar updates outside the archived spec scope
- **WHEN** archive runs without override
- **THEN** archive fails before applying those external updates

#### Scenario: Explicit override allows out-of-scope sidecar updates

- **GIVEN** the same out-of-scope sidecar maintenance situation
- **WHEN** archive runs with `--allow-out-of-scope`
- **THEN** archive is allowed to proceed with those external sidecar updates

### Requirement: Typed errors for archive failures

#### Scenario: Dependency mismatch throws ArchiveDependencyMismatchError

- **GIVEN** a change with `dependsOn: ['core:storage']`
- **AND** the extracted metadata from artifacts has `dependsOn: ['core:new-dep']`
- **WHEN** `ArchiveChange` is executed
- **THEN** `ArchiveDependencyMismatchError` is thrown
- **AND** the error includes both the extracted and persisted dependencies

#### Scenario: Missing artifact throws ArchiveArtifactMissingError

- **GIVEN** a change targeting a spec whose tracked artifact is missing from the filesystem
- **WHEN** `ArchiveChange` is executed
- **THEN** `ArchiveArtifactMissingError` is thrown

#### Scenario: Open implementation file throws ArchiveImplementationStateError

- **GIVEN** a change with implementation files that are currently marked as open in the detector
- **WHEN** `ArchiveChange` is executed
- **THEN** `ArchiveImplementationStateError` is thrown
