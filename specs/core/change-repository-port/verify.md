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
- **AND** the final `save()` persists the correct accumulated changes

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

### Requirement: Auto-invalidation on get when artifact files drift

#### Scenario: Repository collects all drifted files before invalidating

- **GIVEN** a change with two validated spec files under the same artifact
- **AND** both files have changed on disk
- **WHEN** `FsChangeRepository.get()` is called
- **THEN** the invalidation captures both file keys in a single grouped invalidation

#### Scenario: Drift invalidates even while already designing

- **GIVEN** a change already in `designing`
- **AND** a previously validated artifact file drifts on disk
- **WHEN** `FsChangeRepository.get()` is called
- **THEN** the change remains in `designing`
- **AND** the drifted file becomes `drifted-pending-review`

#### Scenario: Drift preserves drifted files and downgrades others to pending review

- **GIVEN** a change with validated artifacts
- **AND** one file drifts on disk
- **WHEN** `FsChangeRepository.get()` auto-invalidates the change
- **THEN** the drifted file is `drifted-pending-review`
- **AND** other previously validated files become `pending-review`

#### Scenario: No drift — no invalidation

- **GIVEN** a change whose validated files still match their stored hashes
- **WHEN** `FsChangeRepository.get()` is called
- **THEN** no invalidation occurs

#### Scenario: Auto-invalidation is bypassed when repository is uninitialized

- **GIVEN** a change with drifted files
- **AND** a repository initialized with no artifact types
- **WHEN** `get()` is called
- **THEN** no invalidation is performed
- **AND** the manifest on disk is not updated

#### Scenario: Invalidation is written to disk under change lock

- **GIVEN** a change with drifted files and a fully initialized repository
- **WHEN** `get()` is called
- **THEN** the repository acquires the change lock
- **AND** it reloads the manifest inside the lock
- **AND** it invalidates and persists the updated manifest to disk under the lock boundary

### Requirement: list returns active changes in creation order

#### Scenario: Mixed active and drafted changes

- **GIVEN** three changes exist: one active (created first), one drafted, one active (created last)
- **WHEN** `list()` is called
- **THEN** only the two active changes are returned, ordered oldest first

#### Scenario: No active changes

- **WHEN** `list()` is called and no active changes exist
- **THEN** an empty array is returned

### Requirement: listDrafts returns drafted changes in creation order

#### Scenario: Only drafted changes returned

- **GIVEN** two drafted changes and one active change exist
- **WHEN** `listDrafts()` is called
- **THEN** only the two drafted changes are returned, ordered oldest first

### Requirement: listDiscarded returns discarded changes in creation order

#### Scenario: Only discarded changes returned

- **GIVEN** one discarded change and two active changes exist
- **WHEN** `listDiscarded()` is called
- **THEN** only the discarded change is returned

### Requirement: save persists the change manifest only

#### Scenario: Save does not write artifact content

- **GIVEN** a change with modified artifact content
- **WHEN** `save(change)` is called
- **THEN** the manifest file is updated with current state, hashes, and history
- **AND** artifact file content on disk is unchanged

#### Scenario: Save alone does not serialize an earlier snapshot read

- **GIVEN** a caller holds a `Change` loaded earlier via `get()`
- **WHEN** another caller persists newer manifest state before `save(oldSnapshot)` runs
- **THEN** `save()` still behaves as a low-level manifest write
- **AND** callers that need concurrency-safe read-modify-write behavior must use `mutate()`

#### Scenario: save on drafted change outside mutateDraft throws

- **GIVEN** a persisted change with `isDrafted === true`
- **WHEN** `save(change)` is called outside an active `mutateDraft` window
- **THEN** `DraftedChangeReadOnlyError` is thrown

#### Scenario: save inside mutateDraft succeeds

- **GIVEN** `mutateDraft(name, fn)` is executing for a drafted change
- **WHEN** the callback triggers an internal `save(change)` for that same name
- **THEN** `DraftedChangeReadOnlyError` is not thrown

#### Scenario: save on active change is unchanged

- **GIVEN** a change exists under `changes/` with `isDrafted === false`
- **WHEN** `save(change)` is called outside `mutate`
- **THEN** persistence proceeds per existing optimistic concurrency rules

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

- **GIVEN** an artifact loaded with `originalHash` and the file on disk has not changed
- **WHEN** `saveArtifact(change, artifact)` is called
- **THEN** the file is written successfully

#### Scenario: Conflict detected — originalHash mismatch

- **GIVEN** an artifact loaded with `originalHash` and the file on disk was modified by another process
- **WHEN** `saveArtifact(change, artifact)` is called without `force`
- **THEN** `ArtifactConflictError` is thrown with `filename`, `incomingContent`, and `currentContent`

#### Scenario: Force bypasses conflict detection

- **GIVEN** an artifact whose `originalHash` does not match the current file on disk
- **WHEN** `saveArtifact(change, artifact, { force: true })` is called
- **THEN** the file is overwritten without error

#### Scenario: New artifact with no originalHash

- **GIVEN** an artifact with `originalHash` undefined (first write)
- **WHEN** `saveArtifact(change, artifact)` is called
- **THEN** the file is written without conflict check

#### Scenario: saveArtifact on drafted change throws

- **GIVEN** a change with `isDrafted === true`
- **WHEN** `saveArtifact(change, artifact)` is called outside `mutateDraft`
- **THEN** `DraftedChangeReadOnlyError` is thrown before any filesystem write

#### Scenario: saveArtifact inside mutateDraft may succeed

- **GIVEN** `mutateDraft(name, fn)` is executing for a drafted change
- **WHEN** the callback calls `saveArtifact` for that change
- **THEN** `DraftedChangeReadOnlyError` is not thrown for the drafted guard alone

#### Scenario: saveArtifact on active change is unchanged

- **GIVEN** a change under `changes/` with `isDrafted === false`
- **WHEN** `saveArtifact(change, artifact)` is called with a valid hash
- **THEN** existing optimistic concurrency behaviour applies

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

#### Scenario: ChangeRepository declares abstract methods

- **WHEN** `ChangeRepository` is declared
- **THEN** it is an abstract class with abstract methods for get, list, save, mutate
