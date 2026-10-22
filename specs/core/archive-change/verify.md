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

#### Scenario: Constructor receives MaterializeSpecMetadata instead of GenerateSpecMetadata and SaveSpecMetadata

- **GIVEN** the archive workflow is composed for runtime use
- **WHEN** `ArchiveChange` is instantiated
- **THEN** the constructor receives `MaterializeSpecMetadata`
- **AND** it does not receive `GenerateSpecMetadata` or `SaveSpecMetadata` directly
- **AND** it does not receive `RunStepHooks`

#### Scenario: ArchiveChange receives the CheckRegistry

- **GIVEN** the archive workflow is composed for runtime use
- **WHEN** `ArchiveChange` is instantiated
- **THEN** the constructor receives the `CheckRegistry` handed in by composition
- **AND** it is used to resolve effective archive bindings and to validate `skipChecks`

### Requirement: Archive bindings not RunStepHooks on the use case

#### Scenario: ArchiveChange constructor does not take RunStepHooks

- **GIVEN** `archiveBindings` from `createWorkflowCheckRegistry`
- **WHEN** `ArchiveChange` is constructed
- **THEN** it uses those bindings for archive predicates and effects
- **AND** the constructor does not accept `RunStepHooks`
- **AND** `ArchiveChangeDeps` does not include `runStepHooks`

#### Scenario: Base bindings are never executed directly

- **GIVEN** the injected `archiveBindings` contain `spec.overlap`
- **AND** the change's schema declares `archiveChecks: [{ id: spec.overlap, disabled: true }]`
- **WHEN** `ArchiveChange.execute` runs
- **THEN** `spec.overlap` is not evaluated
- **AND** the injected `archiveBindings` array is not mutated

### Requirement: Input

#### Scenario: Default values for optional fields

- **WHEN** execute is called with only a name
- **THEN** hooks are not skipped and no archive check is bypassed by default.

#### Scenario: skipChecks defaults to empty

- **WHEN** execute is called with only a name
- **THEN** no archive check is bypassed

#### Scenario: Bypass booleans are not part of the input

- **WHEN** the `ArchiveChangeInput` contract is inspected
- **THEN** it exposes `skipChecks` and no `allowOverlap` or `allowOutOfScope` field
- **AND** every bypass is expressed as a check id in `skipChecks`

#### Scenario: Bypassing impl.linksInScope does not bypass impl.filesResolved

- **GIVEN** archive would require sidecar updates outside the change scope and a tracked file is still `open`
- **WHEN** `execute({ name, skipChecks: ['impl.linksInScope'] })` runs
- **THEN** the archive still fails on `impl.filesResolved`

#### Scenario: Check ids are case-sensitive

- **WHEN** `execute({ name, skipChecks: ['Spec.Overlap'] })` runs
- **THEN** `UnknownCheckError` is thrown naming `Spec.Overlap`

#### Scenario: Empty skipChecks equals omitted

- **WHEN** `execute({ name, skipChecks: [] })` runs
- **THEN** it behaves exactly like an execute without `skipChecks`

#### Scenario: Duplicate ids collapse

- **WHEN** `execute({ name, skipChecks: ['spec.overlap', 'spec.overlap'] })` runs
- **THEN** `spec.overlap` is bypassed once and no error is raised

#### Scenario: Bypassing a check the schema disabled is a no-op

- **GIVEN** the schema declares `archiveChecks: [{ id: spec.overlap, disabled: true }]`
- **AND** `alpha` overlaps `beta`
- **WHEN** `execute({ name: 'alpha', skipChecks: ['spec.overlap'] })` runs
- **THEN** the id is accepted and has no effect
- **AND** no peer is scanned and `invalidatedChanges` is empty

### Requirement: Sovereign schema resolution

#### Scenario: Resolves sovereign schema when workspace default differs

- **GIVEN** an archivable change with schema A and project with schema B
- **WHEN** archive is called
- **THEN** it resolves schema A via `SchemaProvider.get(A)`
- **AND** proceeds without throwing `SchemaMismatchError`

#### Scenario: Peers are loaded for invalidation when spec.overlap is bypassed

- **GIVEN** `alpha` overlaps `beta`
- **WHEN** `execute({ name: 'alpha', skipChecks: ['spec.overlap'] })` runs
- **THEN** peer changes are listed only after the archive predicates return
- **AND** `beta` is invalidated through the reconciler

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

### Requirement: Canonical validity archive preflight

#### Scenario: Archive rechecks all live blockers after hooks

- **GIVEN** pre-archive hooks modify fingerprinted inputs or add an incomplete task
- **WHEN** archive preflight runs
- **THEN** implementation tracking is refreshed and canonical reconciliation plus fresh evidence or task checks block publication
- **AND** stale verification recommends renewal in the current state

#### Scenario: Archive reports committed recovery separately from eligibility

- **GIVEN** fresh preflight commits gate recovery that makes archive inapplicable
- **WHEN** archive stops
- **THEN** the recovery remains persisted and the failure includes canonical blockers and next action
- **AND** it is not reduced to a generic invalid-state error

#### Scenario: Every archive construction path requires reconciliation

- **WHEN** direct dependencies or either factory form omit the reconciler
- **THEN** construction fails with the standard composition error
- **AND** archive never falls back to `Change.invalidate`

#### Scenario: Publication plan uses the accepted post-hook snapshot

- **GIVEN** a pre-archive hook adds and accepts an in-scope implementation link
- **WHEN** archive refreshes, reconciles, and passes live predicates
- **THEN** it constructs the plan and snapshots only afterward
- **AND** the new link is included in the publication plan and spec-lock sidecar

#### Scenario: Archive without verification when verifying is disabled

- **GIVEN** a change in `archivable` whose schema disables `verifying`
- **AND** no verification attempt or completed evidence exists
- **WHEN** `ArchiveChange.execute` runs with the real reconciler
- **THEN** the `verification.current` archive predicate does not fail
- **AND** the post-hook validity re-check does not block archive
- **AND** archive succeeds when every other check passes

#### Scenario: Archive still requires verification when verifying is enabled

- **GIVEN** a change in `archivable` whose schema enables `verifying` and has no completed verification
- **WHEN** `ArchiveChange.execute` runs
- **THEN** archive fails for missing verification

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

#### Scenario: Enter ready fails the same readOnly runner

- **GIVEN** a change in `designing` containing a readOnly spec
- **WHEN** `GetStatus` evaluates `designing → ready`
- **THEN** `workspace.readOnly` fails
- **AND** `ArchiveChange` uses the same runner on operation `archive`

#### Scenario: workspace.readOnly cannot be skipped on archive

- **GIVEN** a change in `archivable` state containing a spec from a `readOnly` workspace
- **WHEN** `execute({ name, skipChecks: ['workspace.readOnly'] })` runs
- **THEN** `CheckNotSkippableError` is thrown naming `workspace.readOnly`
- **AND** no hook runs and no file is written

#### Scenario: A schema cannot disable workspace.readOnly on archive

- **GIVEN** a schema declaring `archiveChecks: [{ id: workspace.readOnly, disabled: true }]`
- **WHEN** the schema is built
- **THEN** `CheckDisableForbiddenError` is thrown

### Requirement: Overlap guard

#### Scenario: Archive blocked when other changes target same specs

- **GIVEN** a change `alpha` in `archivable` state targeting `core:config`
- **AND** another active change `beta` also targets `core:config`
- **WHEN** `ArchiveChange.execute({ name: 'alpha' })` is called without bypassing `spec.overlap`
- **THEN** `SpecOverlapError` is thrown
- **AND** the error message includes `core:config` and `beta`
- **AND** no files are modified and no hooks are executed

#### Scenario: Archive overlap applies each peer policy and records exact affected scope

- **GIVEN** `alpha` in `archivable` targets `core:config` and `core:kernel`
- **AND** active peers `beta` and `gamma` overlap those specs and each has workflow `redesign`
- **WHEN** `ArchiveChange.execute({ name: 'alpha', skipChecks: ['spec.overlap'] })` succeeds
- **THEN** each peer receives a `spec-overlap-conflict` invalidation through canonical reconciliation and returns to `designing` once
- **AND** each audit message names `alpha` and its overlapping spec ID
- **AND** `invalidatedChanges` contains `{ name: 'beta', specIds: ['core:config'] }` and `{ name: 'gamma', specIds: ['core:kernel'] }`

#### Scenario: Archive overlap peer recovery is reconciler-owned and serialized

- **GIVEN** `alpha` and active `beta` both target `core:config`
- **WHEN** archive of `alpha` bypasses `spec.overlap`
- **THEN** the `spec-overlap-conflict` intent for `beta` is processed inside one serialized `ChangeRepository.mutate('beta', fn)` reconciliation
- **AND** artifact review, projection changes, audit event, and any gate-required return are committed atomically
- **AND** `ArchiveChange` never calls `beta.invalidate` directly

#### Scenario: Ungated preserve peer remains in its current phase

- **GIVEN** an overlapping active peer in `implementing` with workflow `preserve` and no required stale spec consent
- **WHEN** another change archives bypassing `spec.overlap`
- **THEN** the peer remains in `implementing` with explicit overlap review and a forward-progress blocker
- **AND** no unconditional return to `designing` is appended

#### Scenario: No overlap with the bypass produces empty invalidatedChanges

- **GIVEN** a change `alpha` in `archivable` state targeting `core:config`
- **AND** no other active change targets `core:config`
- **WHEN** `ArchiveChange.execute({ name: 'alpha', skipChecks: ['spec.overlap'] })` is called
- **THEN** the archive proceeds normally
- **AND** `result.invalidatedChanges` is an empty array

#### Scenario: Overlap check excludes the change being archived

- **GIVEN** a change `alpha` in `archivable` state targeting `core:config`
- **AND** no other active change targets `core:config`
- **WHEN** `ArchiveChange.execute({ name: 'alpha' })` is called
- **THEN** `alpha` itself does not cause an overlap detection
- **AND** the archive proceeds normally

#### Scenario: Bypassing spec.overlap permits archive and invalidates peers

- **GIVEN** `alpha` in `archivable` overlaps `beta` on `core:config`
- **WHEN** `ArchiveChange.execute({ name: 'alpha', skipChecks: ['spec.overlap'] })` is called
- **THEN** the archive proceeds
- **AND** `beta` receives a `spec-overlap-conflict` invalidation through canonical reconciliation

#### Scenario: Schema-disabled spec.overlap performs no scan and no invalidation

- **GIVEN** the schema declares `archiveChecks: [{ id: spec.overlap, disabled: true }]`
- **AND** `alpha` overlaps `beta`
- **WHEN** `ArchiveChange.execute({ name: 'alpha' })` is called
- **THEN** the archive proceeds without listing peer changes
- **AND** `beta` is not invalidated

#### Scenario: Non-skippable spec.overlap cannot be bypassed

- **GIVEN** the schema declares `archiveChecks: [{ id: spec.overlap, skippable: false }]`
- **AND** `alpha` overlaps `beta`
- **WHEN** `ArchiveChange.execute({ name: 'alpha', skipChecks: ['spec.overlap'] })` is called
- **THEN** `CheckNotSkippableError` is thrown before any check, hook, or write

#### Scenario: Bypassing spec.overlap when nothing overlaps

- **GIVEN** `alpha` in `archivable` has no overlapping active change
- **WHEN** `ArchiveChange.execute({ name: 'alpha', skipChecks: ['spec.overlap'] })` is called
- **THEN** the archive proceeds normally
- **AND** `result.invalidatedChanges` is an empty array

#### Scenario: Bypassing spec.overlap does not bypass other failing checks

- **GIVEN** `alpha` overlaps `beta` and also contains a spec from a `readOnly` workspace
- **WHEN** `execute({ name: 'alpha', skipChecks: ['spec.overlap'] })` runs
- **THEN** `ReadOnlyWorkspaceError` is thrown
- **AND** no peer is invalidated and no file is written

#### Scenario: Retry from archiving applies the same bypass

- **GIVEN** `alpha` is in `archiving` after a failed commit and overlaps `beta`
- **WHEN** `execute({ name: 'alpha', skipChecks: ['spec.overlap'] })` runs
- **THEN** the bypass is validated and applied exactly as from `archivable`

#### Scenario: Overlap error names peers and carries no delivery-specific flag

- **GIVEN** `alpha` overlaps `beta` on `core:config`
- **WHEN** `ArchiveChange.execute({ name: 'alpha' })` is called without bypassing `spec.overlap`
- **THEN** `SpecOverlapError` is thrown
- **AND** its message names `core:config` and `beta`
- **AND** its message contains no `--skip-checks` or `--allow-overlap` text
- **AND** `skippable` reflects the resolved `spec.overlap` binding

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

#### Scenario: before-persist slot does not hardcode hook.pre

- **GIVEN** an archive effect bound with `phase = before-persist`
- **WHEN** `ArchiveChange` reaches the pre-persist slot
- **THEN** it runs every matching binding for that phase
- **AND** it does not filter with `check.id === 'hook.pre'`

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

### Requirement: Versioned validity evidence preservation

#### Scenario: Archived v2 retains audit evidence

- **WHEN** a valid change is archived
- **THEN** its structured policy, projections, fingerprints, algorithms, and complete history remain readable
- **AND** inspecting an archived v1 record does not migrate or repair it

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

### Requirement: Archive index metadata maintenance

#### Scenario: Metadata file updated after archive

- **GIVEN** `.specd-index-meta.json` exists with `totalCount: 10`
- **WHEN** a new change is archived
- **THEN** `.specd-index-meta.json` is updated to `totalCount: 11`

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
- **WHEN** reading the archive list index (`.specd-index.jsonl` under `{configPath}/tmp/fs-cache/archive/`)
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

#### Scenario: after-persist slot uses onFailure collect

- **GIVEN** an archive effect bound with `phase = after-persist` and `onFailure = collect`
- **AND** publication already succeeded
- **WHEN** that effect fails
- **THEN** the archive is not rolled back
- **AND** the failure is appended to `postHookFailures`

### Requirement: Spec metadata generation

#### Scenario: Persisted metadata regeneration runs after archive move via MaterializeSpecMetadata

- **GIVEN** canonical publication and archive move succeed
- **WHEN** `ArchiveChange` regenerates persisted `metadata.json`
- **THEN** `MaterializeSpecMetadata.execute({ specId, policy: 'force' })` runs after `archiveRepository.archive()` and after all `.specd-archive-backup/` directories for the batch have been deleted

#### Scenario: Metadata failure does not roll back archive

- **GIVEN** archive move succeeds
- **AND** persisted metadata generation fails for one spec
- **WHEN** `ArchiveChange.execute` completes
- **THEN** the change is archived
- **AND** the failed spec path is listed in `staleMetadataSpecPaths`

#### Scenario: Preflight aborts a spec when extracted dependsOn does not match the final persisted dependsOn

- **GIVEN** `metadataExtraction.dependsOn` is present for a spec
- **AND** `extractMetadata(...)` run against the prepared merged artifact content yields a `dependsOn` value different from the final persisted `dependsOn` being sealed for that spec
- **WHEN** `ArchiveChange.execute` completes preflight for that spec
- **THEN** publication is aborted for that spec before canonical publication begins

#### Scenario: ArchiveChange does not call GenerateSpecMetadata or write the metadata cache itself

- **WHEN** `ArchiveChange` regenerates metadata for an archived spec
- **THEN** it delegates generation and guarded cache persistence to `MaterializeSpecMetadata.execute({ specId, policy: 'force' })`
- **AND** it does not call `GenerateSpecMetadata` directly or write `metadata.json` itself

#### Scenario: Post-archive metadata is materialized with the change schema

- **GIVEN** a change recorded with schema `custom-workflow` whose `metadataExtraction` differs from the workspace default
- **WHEN** the change is archived
- **THEN** `MaterializeSpecMetadata.execute` is called with `{ specId, policy: 'force', schemaName: 'custom-workflow' }` for each modified spec
- **AND** the generated metadata reflects `custom-workflow` extraction rules, not the workspace default

#### Scenario: Archive without verification when verifying is disabled uses the real reconciler

- **GIVEN** a change in `archivable` whose schema disables `verifying` and that has no verification attempt or evidence
- **AND** `ArchiveChange` is wired with the real validity reconciler
- **WHEN** the change is archived
- **THEN** no verification blocker is raised and archive succeeds

#### Scenario: Archive still requires verification when verifying is enabled with the real reconciler

- **GIVEN** a change in `archivable` whose schema enables `verifying` and whose completed verification is stale
- **AND** `ArchiveChange` is wired with the real validity reconciler
- **WHEN** archive is attempted
- **THEN** archive is rejected with a verification blocker and nothing is published

### Requirement: Result shape

#### Scenario: Successful archive returns result with empty invalidatedChanges

- **WHEN** `ArchiveChange.execute` completes successfully with no overlap
- **THEN** the result includes the `ArchivedChange` record
- **AND** `postHookFailures` is empty
- **AND** `invalidatedChanges` is empty

#### Scenario: Result includes invalidated changes after overlap

- **GIVEN** `ArchiveChange.execute` was called bypassing `spec.overlap`
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
- **THEN** `spec-lock.json` is persisted with `schema` derived from `schema.canonicalSpecSchema()` (supporting `compat` and `extends` fallbacks)
- **AND** `dependsOn` is set to the final `change.specDependsOn` value

#### Scenario: Re-archive preserves immutable schema and refreshes dependsOn

- **GIVEN** a spec already has `spec-lock.json` with `schema: { name: "schema-std", version: 1 }`
- **AND** the current archive changes `specDependsOn` for that spec
- **WHEN** `ArchiveChange.execute` archives the spec
- **THEN** `spec-lock.json` retains the original `schema` object unchanged
- **AND** `dependsOn` is replaced with the new `change.specDependsOn` value

#### Scenario: No-lock spec resolves initial dependsOn through resolveInitialPersistedDependsOn

- **GIVEN** a spec has no existing `spec-lock.json`
- **AND** the spec already exists in canonical storage
- **AND** `change.specDependsOn` has no entry for that spec
- **WHEN** `ArchiveChange` builds the initial persisted-state base for that spec
- **THEN** it resolves the initial dependency set through `resolveInitialPersistedDependsOn()` without `explicitDependsOn`
- **AND** it does not read cached `metadata.json` as a fallback
- **AND** it does not use merge-extract as the sealed `dependsOn`

#### Scenario: Publication plan skips resolveInitialPersistedDependsOn

- **GIVEN** a spec has no existing `spec-lock.json`
- **AND** `change.specDependsOn` has an entry for that spec
- **WHEN** `ArchiveChange` seals `dependsOn`
- **THEN** the sealed set is that snapshot
- **AND** it does not call `resolveInitialPersistedDependsOn()`

#### Scenario: New spec without a plan seals extracted dependsOn

- **GIVEN** a spec has no existing `spec-lock.json`
- **AND** `SpecRepository.get` returns null
- **AND** `change.specDependsOn` has no entry for that spec
- **AND** merge-extract yields a `dependsOn` list from the artifacts being published
- **WHEN** `ArchiveChange` seals `dependsOn`
- **THEN** the sealed set is that extracted list
- **AND** `spec-lock.json` records that list
- **AND** it does not call `resolveInitialPersistedDependsOn()`

#### Scenario: New spec without a plan seals empty dependsOn

- **GIVEN** a spec has no existing `spec-lock.json`
- **AND** `SpecRepository.get` returns null
- **AND** `change.specDependsOn` has no entry for that spec
- **AND** merge-extract yields no `dependsOn`
- **WHEN** `ArchiveChange` seals `dependsOn`
- **THEN** the sealed set is `[]`
- **AND** it does not call `resolveInitialPersistedDependsOn()`

#### Scenario: Lock without a plan keeps lock dependsOn

- **GIVEN** a spec has an existing `spec-lock.json` `dependsOn`
- **AND** `change.specDependsOn` has no entry for that spec
- **AND** merge-extract yields a different `dependsOn` list
- **WHEN** `ArchiveChange` seals `dependsOn`
- **THEN** the sealed set is the lock list
- **AND** it does not call `resolveInitialPersistedDependsOn()`
- **AND** `deps.consistent` fails against that lock list

#### Scenario: Existing optimizations are copied forward unchanged

- **GIVEN** a spec's existing `spec-lock.json` has `optimizations.optimizedDescription` set
- **WHEN** `ArchiveChange` re-archives that spec with changed artifact content
- **THEN** the `optimizations` block is copied forward unchanged
- **AND** archive does not clear or mark it stale itself

#### Scenario: Revision guard rejects a concurrently changed lock at publish time

- **GIVEN** `ArchiveChange` observed a persisted-state revision during preflight
- **AND** that revision has changed by the time `SpecRepository.publish()` is called
- **WHEN** `publish()` is invoked with the stale `expectedRevision`
- **THEN** publication fails for that spec instead of silently overwriting the concurrent change

#### Scenario: Publish is the single write path for persisted state

- **WHEN** `ArchiveChange` writes the final `PersistedSpecState` for a spec
- **THEN** it passes `persistedState` to `SpecRepository.publish()`
- **AND** it does not call `writePersistedState()` separately from `publish()`

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

### Requirement: Tracked implementation review guard

#### Scenario: Open tracked implementation file blocks archive

- **GIVEN** a change still has a tracked implementation file in `open` state
- **WHEN** `ArchiveChange.execute` is called
- **THEN** archive fails
- **AND** the error tells the operator to resolve or ignore that tracked file explicitly

#### Scenario: Open file also blocks implementing to verifying

- **GIVEN** the same tracked file remains `open`
- **WHEN** `TransitionChange` targets `verifying` from `implementing`
- **THEN** `impl.filesResolved` fails
- **AND** the runner is the same one archive uses

#### Scenario: Redesign from implementing is not blocked by open files

- **GIVEN** the same tracked file remains `open`
- **WHEN** `TransitionChange` targets `designing` from `implementing`
- **THEN** `impl.filesResolved` does not match
- **AND** the transition is not failed for `IMPLEMENTATION_STATE`

#### Scenario: impl.filesResolved cannot be skipped on archive

- **GIVEN** a tracked implementation file in `open` state
- **WHEN** `execute({ name, skipChecks: ['impl.filesResolved'] })` runs
- **THEN** `CheckNotSkippableError` is thrown
- **AND** `skipChecks: ['impl.linksInScope']` does not bypass the open file either

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

#### Scenario: Archive discards nonexistent spec candidate without creating orphan sidecar

- **GIVEN** a change has an implementation link for a spec that does not exist in `SpecRepository` and is not being created
- **WHEN** `ArchiveChange.execute` prepares the archive plan
- **THEN** that spec is safely discarded from the publication plan
- **AND** no orphan spec directory or lock sidecar is published

#### Scenario: Archive discards new spec without specification artifacts without creating orphan sidecar

- **GIVEN** a change targets a new spec in `specIds` but has no specification artifacts for that spec
- **AND** the change contains an implementation link for that new spec
- **WHEN** `ArchiveChange.execute` prepares the archive plan
- **THEN** that spec is safely discarded from the publication plan
- **AND** no orphan spec directory or lock sidecar is published

### Requirement: Out-of-scope sidecar update guard

#### Scenario: Out-of-scope sidecar maintenance fails by default

- **GIVEN** implementation integrity maintenance would require sidecar updates outside the archived spec scope
- **WHEN** archive runs without bypassing `impl.linksInScope`
- **THEN** archive fails before applying those external updates

#### Scenario: Explicit override allows out-of-scope sidecar updates

- **GIVEN** the same out-of-scope sidecar maintenance situation
- **WHEN** archive runs with `skipChecks: ['impl.linksInScope']`
- **THEN** archive is allowed to proceed with those external sidecar updates

#### Scenario: Same skippable flag on exit implementing

- **GIVEN** `impl.linksInScope` would fail
- **AND** `impl.linksInScope` is bypassed through `skipChecks` for the attempt
- **WHEN** exit from `implementing` is evaluated
- **THEN** the predicate skips with the same semantics as archive

#### Scenario: skipChecks impl.linksInScope allows out-of-scope sidecar updates

- **GIVEN** the same out-of-scope sidecar maintenance situation
- **WHEN** archive runs with `skipChecks: ['impl.linksInScope']`
- **THEN** archive is allowed to proceed with those external sidecar updates

#### Scenario: Schema makes impl.linksInScope non-skippable

- **GIVEN** the schema declares `archiveChecks: [{ id: impl.linksInScope, skippable: false }]`
- **WHEN** archive runs with `skipChecks: ['impl.linksInScope']`
- **THEN** `CheckNotSkippableError` is thrown

#### Scenario: Schema disables impl.linksInScope

- **GIVEN** the schema declares `archiveChecks: [{ id: impl.linksInScope, disabled: true }]`
- **WHEN** archive runs
- **THEN** the check is not evaluated and archive does not fail for out-of-scope updates

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

#### Scenario: Unknown change throws ChangeNotFoundError

- **WHEN** `ArchiveChange.execute` is called with a change name that does not exist
- **THEN** `ChangeNotFoundError` is thrown

#### Scenario: Missing parser throws ParserNotRegisteredError

- **GIVEN** an artifact format requires a parser that is not registered
- **WHEN** `ArchiveChange` materializes that artifact
- **THEN** `ParserNotRegisteredError` is thrown

#### Scenario: Batch restore failure throws ArchiveBatchRestoreError

- **GIVEN** canonical publication partially succeeds and batch restore is required
- **AND** restore cannot complete for all affected specs
- **WHEN** `ArchiveChange` aborts the batch
- **THEN** `ArchiveBatchRestoreError` is thrown

#### Scenario: Unregistered skip id throws UnknownCheckError

- **WHEN** `ArchiveChange` is executed with `skipChecks: ['nope.check']`
- **THEN** `UnknownCheckError` is thrown

#### Scenario: Non-skippable skip id throws CheckNotSkippableError

- **WHEN** `ArchiveChange` is executed with `skipChecks: ['workspace.readOnly']`
- **THEN** `CheckNotSkippableError` is thrown

#### Scenario: Plugin check failure throws CheckPredicateFailedError

- **GIVEN** a plugin check `@security.code-scan` bound to archive that fails with code `SECURITY_FINDINGS`
- **WHEN** `ArchiveChange.execute` runs
- **THEN** `CheckPredicateFailedError` is thrown carrying the check id, label, code `SECURITY_FINDINGS`, message, command, and details
- **AND** it is not an `ArchiveImplementationStateError`

#### Scenario: Plugin failure carries the resolved skippability

- **GIVEN** the same check with a resolved binding that is skippable, and again with one that is not
- **WHEN** it fails on archive
- **THEN** `CheckPredicateFailedError.skippable` is `true` in the first case and `false` in the second

#### Scenario: Plugin failure without a code uses CHECK_FAILED

- **GIVEN** a plugin check that fails without a code
- **WHEN** `ArchiveChange.execute` runs
- **THEN** the thrown `CheckPredicateFailedError` has code `CHECK_FAILED`

#### Scenario: Built-in failures keep their dedicated errors

- **GIVEN** `workspace.readOnly`, `deps.consistent`, `impl.filesResolved`, `spec.overlap`, or `verification.current` fails
- **WHEN** `ArchiveChange.execute` runs
- **THEN** the dedicated error for that check is thrown, not `CheckPredicateFailedError`

### Requirement: Archive checks share runners and wrap remaining preflight

#### Scenario: deps.consistent throws ArchiveDependencyMismatchError

- **GIVEN** extracted `dependsOn` disagrees with the sealed persisted set
- **WHEN** operation `archive` evaluates `deps.consistent`
- **THEN** `ArchiveDependencyMismatchError` is thrown
- **AND** the same runner is `runDepsConsistent`
- **AND** enter-`ready` used that runner against `change.specDependsOn` when a publication-plan snapshot existed

#### Scenario: publication preflight stays in ArchiveChange

- **GIVEN** a publication preflight failure that is not name/archivable/overlap/readOnly/deps/impl
- **WHEN** `ArchiveChange` runs after archive predicates allow the operation
- **THEN** it fails with `ArchivePreflightError` or `ArchiveArtifactMissingError`
- **AND** that failure is not a registered `archive.publication` check

#### Scenario: Plugin archive check runs after the built-in predicates

- **GIVEN** a plugin check `@security.code-scan` registered with a default binding `{ scope: 'archive' }`
- **WHEN** `ArchiveChange.execute` runs
- **THEN** it is evaluated after the built-in archive predicates, in registry order
- **AND** a failure of that check blocks the archive before any hook or write

#### Scenario: Schema embeds a registered check on archive

- **GIVEN** `@security.code-scan` is registered without default bindings and allows schema embedding
- **AND** the schema declares `archiveChecks: [{ id: '@security.code-scan' }]`
- **WHEN** `ArchiveChange.execute` runs
- **THEN** a synthesized, non-skippable binding for `scope: 'archive'` is evaluated with the real check instance

#### Scenario: Schema without archiveChecks keeps the base behaviour

- **GIVEN** a schema with no `archiveChecks` and no plugin archive bindings
- **WHEN** the effective archive bindings are resolved
- **THEN** they contain the same checks, in the same order and with the same policy, as the base `archiveBindings`
- **AND** archive behaves exactly as before this capability

#### Scenario: Several embedded checks are evaluated in declaration order

- **GIVEN** the schema declares `archiveChecks` for `@a.lint` and then `@b.scan`, both embeddable
- **WHEN** archive runs
- **THEN** both are evaluated after the built-in and plugin default predicates, `@a.lint` first

#### Scenario: A locked check redeclared without change is accepted

- **GIVEN** the schema declares `archiveChecks: [{ id: workspace.readOnly, skippable: false }]`
- **WHEN** archive runs
- **THEN** the declaration is accepted as redeclaring the code-defined coordinate
- **AND** the policy of `workspace.readOnly` is unchanged

#### Scenario: Declaration for a check absent from the archive operation is inert when disabled

- **GIVEN** the schema declares `archiveChecks: [{ id: '@qa.extended-lint', disabled: true }]` for a registered check with no archive binding
- **WHEN** archive runs
- **THEN** no binding exists for it and the archive is unaffected

### Requirement: Effective archive bindings and skip validation

#### Scenario: Bindings are resolved on every execute

- **GIVEN** the same `ArchiveChange` instance archives two changes with different sovereign schemas
- **WHEN** each `execute` runs
- **THEN** each run evaluates the bindings resolved from its own schema
- **AND** no resolution result is reused across runs

#### Scenario: Unknown check id is rejected

- **WHEN** `execute({ name, skipChecks: ['nope.check'] })` runs
- **THEN** `UnknownCheckError` is thrown
- **AND** no predicate is evaluated, no hook runs, no file is written, and the change stays `archivable`

#### Scenario: Hook checks are not skippable through skipChecks

- **WHEN** `execute({ name, skipChecks: ['hook.pre'] })` runs
- **THEN** `CheckNotSkippableError` is thrown
- **AND** its message points to `skipHookPhases`

#### Scenario: Locked built-in check cannot be skipped

- **WHEN** `execute({ name, skipChecks: ['verification.current'] })` runs
- **THEN** `CheckNotSkippableError` is thrown naming `verification.current`

#### Scenario: Skippable built-in check is bypassed and audited

- **GIVEN** `impl.linksInScope` would fail
- **WHEN** `execute({ name, skipChecks: ['impl.linksInScope'] })` runs
- **THEN** that check reports `outcome: 'skip'` with the same bypass marker as on `TransitionChange`
- **AND** the archive proceeds

#### Scenario: Schema makes a plugin check skippable

- **GIVEN** `@security.code-scan` bound to archive and the schema declares it `skippable: true`
- **WHEN** `execute({ name, skipChecks: ['@security.code-scan'] })` runs
- **THEN** the check is bypassed and the archive proceeds

#### Scenario: Schema cannot relax a locked archive check

- **GIVEN** a schema declaring `archiveChecks: [{ id: impl.filesResolved, skippable: true }]`
- **WHEN** the schema is built
- **THEN** `CheckBindingOverrideForbiddenError` is thrown before any archive is attempted

#### Scenario: Skip validation completes before any publication write

- **GIVEN** an invalid skip id
- **WHEN** `ArchiveChange.execute` rejects the request
- **THEN** no archive publication write happened and the change is still `archivable`
- **AND** the only state written earlier is canonical validity reconciliation

#### Scenario: State guard precedes skip validation

- **GIVEN** a change in `designing`
- **WHEN** `execute({ name, skipChecks: ['nope.check'] })` runs
- **THEN** `InvalidStateTransitionError` is thrown, not `UnknownCheckError`

#### Scenario: Schema resolution failure precedes skip validation

- **GIVEN** the change's schema identity does not match the provider
- **WHEN** `execute({ name, skipChecks: ['nope.check'] })` runs
- **THEN** `SchemaProviderIdentityMismatchError` propagates first

#### Scenario: Registered check without an archive binding is accepted

- **WHEN** `execute({ name, skipChecks: ['approval.spec'] })` runs
- **THEN** no error is raised because `approval.spec` is registered
- **AND** the id has no effect on the archive

#### Scenario: Check disabled by the schema is accepted

- **GIVEN** the schema disables `impl.linksInScope` through `archiveChecks`
- **WHEN** `execute({ name, skipChecks: ['impl.linksInScope'] })` runs
- **THEN** no error is raised and the id has no effect

#### Scenario: Bypassing one check does not bypass another

- **GIVEN** both `spec.overlap` and `impl.linksInScope` would fail
- **WHEN** `execute({ name, skipChecks: ['spec.overlap'] })` runs
- **THEN** the `impl.linksInScope` failure still blocks the archive

#### Scenario: Mixed valid and invalid ids reject the whole request

- **WHEN** `execute({ name, skipChecks: ['spec.overlap', 'nope.check'] })` runs
- **THEN** `UnknownCheckError` is thrown
- **AND** `spec.overlap` has not been bypassed and nothing was executed

#### Scenario: A passing check can still be bypassed

- **GIVEN** `impl.linksInScope` would pass
- **WHEN** `execute({ name, skipChecks: ['impl.linksInScope'] })` runs
- **THEN** the archive proceeds and the bypass is recorded for that check

### Requirement: Config-based factory delegates through resolveArchiveChangeDeps

#### Scenario: createArchiveChange config form derives ArchiveChangeDeps through resolveArchiveChangeDeps

- **WHEN** `createArchiveChange(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `ArchiveChangeDeps` through `resolveArchiveChangeDeps(resolver)`
- **AND** `resolveArchiveChangeDeps(resolver)` resolves `archiveBindings` from `resolveWorkflowCheckRegistry`
- **AND** it resolves `checkRegistry` from the same registry
- **AND** it resolves `materializeMetadata: MaterializeSpecMetadata`
- **AND** it resolves `contentHasher: ContentHasher`
- **AND** it does not resolve `runStepHooks` onto the use case
- **AND** the factory delegates to canonical `createArchiveChange(deps)`

#### Scenario: resolveArchiveChangeDeps resolves materialization, not direct metadata writers

- **WHEN** `resolveArchiveChangeDeps(resolver)` runs
- **THEN** it resolves `materializeMetadata: MaterializeSpecMetadata`
- **AND** it does not resolve `regenerateMetadata`, `GenerateSpecMetadata`, or `SaveSpecMetadata` directly

### Requirement: Shared fallback batch snapshot lifetime

#### Scenario: Restore removes a file recorded after fallback snapshot

- **GIVEN** archive composition uses the fallback batch snapshot port
- **WHEN** it snapshots, records a newly created file, and restores
- **THEN** restore removes the newly created file through the same snapshot manifest
