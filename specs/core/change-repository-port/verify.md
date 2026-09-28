# Verification: ChangeRepository Port

## Requirements

### Requirement: get returns a Change or null

#### Scenario: Active change exists

- **WHEN** `get("add-oauth-login")` is called and a change with that name exists under `changes/`
- **THEN** a `Change` is returned with persisted artifact and file state loaded from the manifest

#### Scenario: Drafted-only name returns null

- **GIVEN** a change exists only under `drafts/`
- **WHEN** `get(name)` is called
- **THEN** it returns `null`

#### Scenario: Discarded-only name returns null

- **GIVEN** a change exists only under `discarded/`
- **WHEN** `get(name)` is called
- **THEN** it returns `null`

#### Scenario: Missing state defaults to missing on load

- **GIVEN** a manifest entry without a `state` field
- **WHEN** `get()` loads that active change
- **THEN** the missing artifact or file state defaults to `missing`

#### Scenario: get returns a snapshot, not a serialized mutation context

- **GIVEN** two callers both loaded the same active change via `get()`
- **WHEN** each caller mutates its in-memory instance and only one uses `mutate()`
- **THEN** the unsynchronized caller must not rely on `save()` alone for a safe persisted update

#### Scenario: get does not write to disk if no drift or sync is detected

- **GIVEN** an active change with no artifact drift and no sync changes needed
- **WHEN** `get()` is called
- **THEN** the on-disk manifest file is not modified

### Requirement: getDraft returns a DraftedChangeView or null

#### Scenario: Drafted change returns view

- **WHEN** `getDraft(name)` is called and the change exists under `drafts/`
- **THEN** a `DraftedChangeView` is returned with `isDrafted === true`

#### Scenario: Active-only name returns null

- **GIVEN** a change exists only under `changes/`
- **WHEN** `getDraft(name)` is called
- **THEN** it returns `null`

#### Scenario: Discarded-only name returns null

- **GIVEN** a change exists only under `discarded/`
- **WHEN** `getDraft(name)` is called
- **THEN** it returns `null`

#### Scenario: View has no artifact file bodies

- **GIVEN** a drafted change with on-disk `proposal.md`
- **WHEN** `getDraft(name)` returns a view
- **THEN** the view exposes artifact statuses without embedding file content

### Requirement: getDiscarded returns a DiscardedChangeView or null

#### Scenario: Discarded change returns view

- **WHEN** `getDiscarded(name)` is called and the change exists under `discarded/`
- **THEN** a `DiscardedChangeView` is returned with `discardReason` from the latest `discarded` event

#### Scenario: Active-only name returns null

- **GIVEN** a change exists only under `changes/`
- **WHEN** `getDiscarded(name)` is called
- **THEN** it returns `null`

#### Scenario: Drafted-only name returns null

- **GIVEN** a change exists only under `drafts/`
- **WHEN** `getDiscarded(name)` is called
- **THEN** it returns `null`

#### Scenario: View exposes supersededBy when present

- **GIVEN** a discarded change whose `discarded` event includes `supersededBy: ['replacement']`
- **WHEN** `getDiscarded(name)` is called
- **THEN** the returned view's `supersededBy` equals `['replacement']`

### Requirement: mutate serializes persisted change updates

#### Scenario: Missing active change is rejected

- **WHEN** `mutate("missing-change", fn)` is called and no active change with that name exists
- **THEN** `ChangeNotFoundError` is thrown

#### Scenario: Drafted-only name is rejected

- **GIVEN** a change exists only under `drafts/`
- **WHEN** `mutate(name, fn)` is called
- **THEN** `ChangeNotFoundError` is thrown

#### Scenario: Discarded-only name is rejected

- **GIVEN** a change exists only under `discarded/`
- **WHEN** `mutate(name, fn)` is called
- **THEN** `ChangeNotFoundError` is thrown

#### Scenario: Second mutation sees the first mutation's persisted result

- **GIVEN** two callers both request `mutate()` for the same active change name
- **AND** the first callback appends a history event and resolves
- **WHEN** the second callback starts executing
- **THEN** it receives a freshly reloaded `Change` that already includes the first callback's persisted update

#### Scenario: Failing callback does not persist a partial manifest update

- **WHEN** `mutate(name, fn)` is called and `fn` throws after mutating the in-memory change
- **THEN** the on-disk manifest is unchanged from before the `mutate` call began

#### Scenario: Load within mutate bypasses intermediate lock and write

- **GIVEN** an active change with drifted files and an initialized repository
- **WHEN** `mutate()` is executing
- **THEN** the internal load operation within mutate bypasses any intermediate lock acquisition and manifest writes
- **AND** does not deadlock
- **AND** the final internal manifest write persists the correct accumulated changes

#### Scenario: mutate returns result and post-save hydrated change

- **GIVEN** `fn` returns `"ok"`
- **WHEN** `mutate(name, fn)` completes successfully
- **THEN** the result is `{ result: "ok", change }`
- **AND** `change` is the post-save hydrated aggregate, not necessarily the callback object
- **AND** its fresh physical classification does not imply persisted validity recovery

#### Scenario: Post-save hydration exposes disk drift without an automatic validity commit

- **GIVEN** a validated complete artifact file with a stored `validatedHash`
- **AND** the `mutate` callback calls `saveArtifact` with different content without materializing validity
- **WHEN** `mutate` completes
- **THEN** returned `.change` exposes the fresh drift classification
- **AND** the persisted manifest contains no new approval invalidation, recovery, or drift event from repository hydration alone
- **AND** an explicit application reconciliation can subsequently materialize the drift exactly once

### Requirement: Version-aware atomic reconciliation persistence

#### Scenario: Reconciliation commits one coherent v2 mutation

- **GIVEN** a supported legacy change whose fresh inputs invalidate approval evidence
- **WHEN** an application operation reconciles it through `mutate`
- **THEN** projection changes, audit events, policy, and required recovery are persisted atomically as v2
- **AND** a later failed operation does not undo that recovery

#### Scenario: Future manifest is rejected before hydration

- **WHEN** the repository reads a manifest with a newer unsupported version
- **THEN** it raises the typed manifest-version error without adapting or rewriting it

### Requirement: mutateDraft serializes drafted change updates

#### Scenario: Restore uses mutateDraft

- **WHEN** `RestoreChange.execute` completes successfully
- **THEN** `ChangeRepository.mutateDraft` was used for that name

#### Scenario: Active name is rejected

- **GIVEN** a change exists only under `changes/`
- **WHEN** `mutateDraft(name, fn)` is called
- **THEN** `ChangeNotFoundError` is thrown

#### Scenario: Discarded name is rejected

- **GIVEN** a change exists only under `discarded/`
- **WHEN** `mutateDraft(name, fn)` is called
- **THEN** `ChangeNotFoundError` is thrown

#### Scenario: Callback receives fresh drafted Change

- **GIVEN** `mutateDraft(name, fn)` is invoked for a drafted change
- **WHEN** the callback runs
- **THEN** it receives a freshly loaded `Change` with `isDrafted === true`

#### Scenario: mutateDraft returns result and post-save hydrated change

- **GIVEN** `fn` returns `undefined`
- **WHEN** `mutateDraft(name, fn)` completes after a restore transition
- **THEN** the result is `{ result: undefined, change }` loaded from the destination bucket
- **AND** the reload appends no new validity or lifecycle event

### Requirement: Hydration reports fresh file facts without deciding validity

Scenarios:

#### Scenario: Plain hydration has no validity side effects

- **GIVEN** external artifact or implementation content differs from persisted evidence
- **WHEN** the repository loads the change without reconciliation
- **THEN** it exposes fresh file facts without invalidating projections or changing lifecycle state

#### Scenario: Missing implementation input is reported as a fact

- **WHEN** a confirmed implementation path cannot be read during hydration
- **THEN** the missing input is exposed explicitly and never omitted from later validity evaluation

### Requirement: list returns active changes in creation order

#### Scenario: Mixed active and drafted changes

- **GIVEN** three changes exist: one active (created first), one drafted, one active (created last)
- **WHEN** `list()` is called
- **THEN** the result is `ListResult<ActiveChangeListEntry>`
- **AND** only the two active changes are returned in `createdAt` ascending order

#### Scenario: No active changes

- **WHEN** `list()` is called and no active changes exist
- **THEN** `{ items: [], meta: { total: 0, count: 0, limit: 0 } }` is returned

#### Scenario: List entries exclude full Change detail

- **GIVEN** an active change with history and artifact state maps
- **WHEN** `list()` is called
- **THEN** returned items are `ActiveChangeListEntry` rows without history, artifact content, or derived artifact state maps

### Requirement: listDrafts returns drafted changes in creation order

#### Scenario: Only drafted changes returned newest first

- **GIVEN** two drafted changes drafted at different times and one active change exist
- **WHEN** `listDrafts()` is called
- **THEN** the result is `ListResult<DraftedChangeListEntry>`
- **AND** only the two drafted changes are returned in `draftedAt` descending order

#### Scenario: List drafts excludes DraftedChangeView

- **GIVEN** a drafted change with artifact statuses on disk
- **WHEN** `listDrafts()` is called
- **THEN** returned items are list entries without artifact content or history
- **AND** no returned item is a `DraftedChangeView` or mutable `Change`

### Requirement: listDiscarded returns discarded changes in creation order

#### Scenario: Only discarded changes returned newest first

- **GIVEN** one discarded change and two active changes exist
- **WHEN** `listDiscarded()` is called
- **THEN** the result is `ListResult<DiscardedChangeListEntry>`
- **AND** only the discarded change is returned

#### Scenario: List discarded excludes DiscardedChangeView

- **GIVEN** a discarded change with discard history metadata
- **WHEN** `listDiscarded()` is called
- **THEN** returned items are list entries without artifact content or history
- **AND** no returned item is a `DiscardedChangeView` or mutable `Change`

### Requirement: Change list counts

#### Scenario: Active count matches list meta.total

- **GIVEN** a repository with known active, drafted, and discarded changes
- **WHEN** `count()` and `list().meta.total` are queried
- **THEN** both return the same active change total
- **AND** `count()` does not materialize full `Change` aggregates

#### Scenario: Draft and discarded counts match their list totals

- **GIVEN** a repository with known drafted and discarded changes
- **WHEN** `countDrafts()` and `listDrafts().meta.total` are queried
- **THEN** both return the same drafted total
- **WHEN** `countDiscarded()` and `listDiscarded().meta.total` are queried
- **THEN** both return the same discarded total

### Requirement: Change list reindex

#### Scenario: reindex rebuilds all change list buckets

- **GIVEN** filesystem-backed change list indexes under `{configPath}/tmp/fs-cache/`
- **WHEN** `reindex()` is called
- **THEN** active, drafted, and discarded list indexes are fully rebuilt from disk

#### Scenario: Per-bucket reindex methods rebuild one bucket

- **WHEN** `reindexActive()` is called
- **THEN** only the active-changes index is rebuilt
- **WHEN** `reindexDrafts()` is called
- **THEN** only the drafts index is rebuilt
- **WHEN** `reindexDiscarded()` is called
- **THEN** only the discarded index is rebuilt

### Requirement: Change list include projection

#### Scenario: Include flags project cached optional fields only

- **GIVEN** a cached list entry payload that already contains optional `description` and `reason`
- **WHEN** `list({ includeDescription: true })` is called
- **THEN** returned items include projected `description` without extra manifest reads
- **WHEN** the same list call omits `includeDescription`
- **THEN** returned items omit `description`

### Requirement: create persists a new change; save is internal

#### Scenario: create does not write artifact content

- **GIVEN** a new `Change` entity that has never been persisted
- **WHEN** `create(change)` is called
- **THEN** the change directory and manifest are created
- **AND** no artifact file content is written by `create`

#### Scenario: create rejects an existing name

- **GIVEN** a change with the same name already exists under `changes/`, `drafts/`, or `discarded/`
- **WHEN** `create(change)` is called
- **THEN** `ChangeAlreadyExistsError` (or equivalent) is thrown

#### Scenario: Use cases cannot persist existing changes via public save

- **GIVEN** an application use case holds a `Change` loaded earlier via `get()`
- **WHEN** it attempts to persist that snapshot outside `mutate` / `mutateDraft` / `create`
- **THEN** no application-facing `save` API is available on the port for that purpose

#### Scenario: Internal save on drafted change outside mutateDraft throws

- **GIVEN** a persisted change with `isDrafted === true`
- **WHEN** an internal manifest write is attempted outside an active `mutateDraft` / `mutate` window
- **THEN** `DraftedChangeReadOnlyError` is thrown

#### Scenario: Internal save inside mutateDraft succeeds

- **GIVEN** `mutateDraft(name, fn)` is executing for a drafted change
- **WHEN** the repository performs its internal manifest write for that same name
- **THEN** `DraftedChangeReadOnlyError` is not thrown

### Requirement: artifact loads content with originalHash

#### Scenario: Artifact exists

- **GIVEN** a change with an artifact file `proposal.md` on disk
- **WHEN** `artifact(change, "proposal.md")` is called
- **THEN** a `SpecArtifact` is returned with the file content and `originalHash` set to `sha256` of that content

#### Scenario: Artifact does not exist

- **WHEN** `artifact(change, "nonexistent.md")` is called
- **THEN** `null` is returned

### Requirement: artifact only loads tracked change artifact files

#### Scenario: Tracked artifact file can be read

- **GIVEN** `proposal.md` is listed in the change's tracked artifact files
- **WHEN** `artifact(change, "proposal.md")` is called
- **THEN** the repository returns that tracked artifact content

#### Scenario: Untracked file is rejected even when present on disk

- **GIVEN** a file exists inside the change directory but is not listed in the change's tracked artifact files
- **WHEN** `artifact(change, "<that-file>")` is called
- **THEN** the repository rejects the read instead of returning arbitrary content

### Requirement: Change artifact path confinement

#### Scenario: Path traversal is rejected on artifact read

- **WHEN** `artifact(change, "../outside.txt")` or an equivalent escape path is requested
- **THEN** the repository rejects the request

#### Scenario: Path traversal is rejected on existence check

- **WHEN** `artifactExists(change, "../outside.txt")` or an equivalent escape path is requested
- **THEN** the repository rejects the request

### Requirement: Change artifact resolution debug logging

#### Scenario: Debug logs cover tracked resolution and rejection

- **WHEN** debug logging is enabled for `ChangeRepository`
- **THEN** successful tracked artifact resolution emits debug output
- **AND** untracked filename rejection or path-confinement rejection also emits debug output

### Requirement: saveArtifact with optimistic concurrency

#### Scenario: No conflict — originalHash matches

- **GIVEN** an active `mutate` window for the change
- **AND** an artifact loaded with `originalHash` and the file on disk has not changed
- **WHEN** `saveArtifact(change, artifact)` is called
- **THEN** the file is written successfully
- **AND** the in-memory `Change` status and `validatedHash` are unchanged by `saveArtifact`

#### Scenario: Conflict detected — originalHash mismatch

- **GIVEN** an active `mutate` window for the change
- **AND** an artifact loaded with `originalHash` and the file on disk was modified by another process
- **WHEN** `saveArtifact(change, artifact)` is called without `force`
- **THEN** `ArtifactConflictError` is thrown with `filename`, `incomingContent`, and `currentContent`

#### Scenario: Force bypasses conflict detection

- **GIVEN** an active `mutate` window for the change
- **AND** an artifact whose `originalHash` does not match the current file on disk
- **WHEN** `saveArtifact(change, artifact, { force: true })` is called
- **THEN** the file is overwritten without error
- **AND** the in-memory `Change` is still not mutated by `saveArtifact`

#### Scenario: New artifact with no originalHash

- **GIVEN** an active `mutate` window for the change
- **AND** an artifact with `originalHash` undefined (first write)
- **WHEN** `saveArtifact(change, artifact)` is called
- **THEN** the file is written without conflict check
- **AND** `saveArtifact` returns `void`

#### Scenario: saveArtifact outside mutate window is rejected

- **GIVEN** no active `mutate` or `mutateDraft` window for the change name
- **WHEN** `saveArtifact(change, artifact)` is called
- **THEN** the call is rejected before any filesystem write

#### Scenario: saveArtifact inside mutateDraft may succeed

- **GIVEN** `mutateDraft(name, fn)` is executing for a drafted change
- **WHEN** the callback calls `saveArtifact` for that change
- **THEN** the drafted/mutate-window guard allows the write
- **AND** the in-memory `Change` is not set to `in-progress` by `saveArtifact`

### Requirement: artifactExists checks file presence without loading

#### Scenario: File exists

- **GIVEN** a change with artifact file `tasks.md` on disk
- **WHEN** `artifactExists(change, "tasks.md")` is called
- **THEN** `true` is returned

#### Scenario: File does not exist

- **WHEN** `artifactExists(change, "missing.md")` is called
- **THEN** `false` is returned

### Requirement: deltaExists checks delta file presence

#### Scenario: Delta file exists

- **GIVEN** a change with delta file `spec.delta.yaml` for spec ID `auth/login`
- **WHEN** `deltaExists(change, "auth/login", "spec.delta.yaml")` is called
- **THEN** `true` is returned

#### Scenario: Delta file does not exist

- **WHEN** `deltaExists(change, "auth/login", "nonexistent.delta.yaml")` is called
- **THEN** `false` is returned

### Requirement: unscaffold removes spec directories

#### Scenario: Unscaffold removes specs and deltas directories

- **GIVEN** a change directory with `specs/core/core/edit-change/` and `deltas/core/core/edit-change/` subdirectories
- **WHEN** `unscaffold(change, ['core:edit-change'])` is called
- **THEN** both `specs/core/core/edit-change/` and `deltas/core/core/edit-change/` directories are removed

#### Scenario: Unscaffold is idempotent — non-existent directory is silently skipped

- **GIVEN** a change directory with no `specs/core/core/edit-change/` directory
- **WHEN** `unscaffold(change, ['core:edit-change'])` is called
- **THEN** no error is thrown
- **AND** the operation completes successfully

#### Scenario: Unscaffold removes directories with files

- **GIVEN** a change directory with `specs/core/core/edit-change/spec.md` (a file inside the directory)
- **WHEN** `unscaffold(change, ['core:edit-change'])` is called
- **THEN** the `specs/core/core/edit-change/` directory and its contents are removed

### Requirement: Inheritance from Repository base

#### Scenario: Repository extends Repository base class

- **WHEN** `ChangeRepository` is examined in the codebase
- **THEN** it extends a base `Repository` class

### Requirement: delete removes the entire change directory

#### Scenario: Delete removes change directory

- **GIVEN** a change in the changes directory with manifest and artifact files
- **WHEN** `delete(change)` is called
- **THEN** the entire change directory is removed

### Requirement: changePath returns the absolute path to a change directory

#### Scenario: changePath resolves to absolute path

- **GIVEN** a change with name "my-change"
- **WHEN** `changePath(change)` is called
- **THEN** it returns the absolute path to the change directory

### Requirement: draftChangePath returns the drafted directory path

#### Scenario: Path resolves under drafts

- **GIVEN** a `DraftedChangeView` for change `parked-feature`
- **WHEN** `draftChangePath(view)` is called
- **THEN** the returned path is under the configured `drafts/` directory

#### Scenario: Path ends with change name segment

- **GIVEN** a `DraftedChangeView` with `name: 'parked-feature'`
- **WHEN** `draftChangePath(view)` is called
- **THEN** the returned path basename is `parked-feature`

#### Scenario: Active changePath is not used for drafted view

- **GIVEN** a `DraftedChangeView` for a drafted change
- **WHEN** resolving filesystem location for inspection tooling
- **THEN** callers use `draftChangePath(view)` rather than `changePath` with an active `Change`

### Requirement: internalPaths returns absolute storage paths

#### Scenario: FsChangeRepository returns storage paths

- **GIVEN** `FsChangeRepository` is configured with `changes/`, `drafts/`, and `discarded/`
- **WHEN** `internalPaths()` is called
- **THEN** it returns an array containing the absolute paths to those three directories

#### Scenario: Non-filesystem implementation returns undefined

- **GIVEN** a `ChangeRepository` implementation that does not manage local directories
- **WHEN** `internalPaths()` is called
- **THEN** it returns `undefined`

### Requirement: scaffold creates artifact directories

#### Scenario: Scaffold creates spec directories

- **GIVEN** a change with specIds including `core:edit-change`
- **WHEN** `scaffold(change)` is called
- **THEN** it creates the `specs/core/core/edit-change/` directory

### Requirement: Abstract class with abstract methods

#### Scenario: Abstract surface includes create not public save

- **WHEN** `ChangeRepository` is declared
- **THEN** it is an abstract class with abstract methods for get, list, create, mutate, mutateDraft, and saveArtifact
- **AND** public `save` is not part of the application-facing abstract surface
