# Verification: ChangeRepository Port

## Requirements

### Requirement: get returns a Change or null

#### Scenario: Change exists

- **WHEN** `get("add-oauth-login")` is called and a change with that name exists
- **THEN** a `Change` is returned with persisted artifact and file state loaded from the manifest

#### Scenario: Missing state defaults to missing on load

- **GIVEN** a manifest entry without a `state` field
- **WHEN** `get()` loads that change
- **THEN** the missing artifact or file state defaults to `missing`

#### Scenario: get returns a snapshot, not a serialized mutation context

- **GIVEN** two callers both loaded the same change via `get()`
- **AND** one caller later updates that change through `mutate()`
- **WHEN** the other caller keeps using the previously returned `Change`
- **THEN** that object remains a stale snapshot until the caller reloads it

### Requirement: mutate serializes persisted change updates

#### Scenario: Missing change is rejected

- **WHEN** `mutate("missing-change", fn)` is called and no change with that name exists
- **THEN** `ChangeNotFoundError` is thrown

#### Scenario: Second mutation sees the first mutation's persisted result

- **GIVEN** two callers both request `mutate()` for the same change name
- **AND** the first callback appends a history event and resolves
- **WHEN** the second callback starts executing
- **THEN** it receives a freshly reloaded `Change` that already includes the first callback's persisted update

#### Scenario: Failing callback does not persist a partial manifest update

- **GIVEN** a `mutate()` callback modifies the provided `Change`
- **WHEN** the callback throws before returning
- **THEN** the repository does not persist that partial manifest update
- **AND** a later `mutate()` call for the same change can proceed normally

#### Scenario: Different changes can mutate independently

- **GIVEN** one caller mutates `change-a` and another mutates `change-b`
- **WHEN** both operations execute at the same time
- **THEN** neither operation waits on a global lock for unrelated change names

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

### Requirement: scaffold creates artifact directories

#### Scenario: Scaffold creates spec directories

- **GIVEN** a change with specIds including `core:edit-change`
- **WHEN** `scaffold(change)` is called
- **THEN** it creates the `specs/core/core/edit-change/` directory

### Requirement: Abstract class with abstract methods

#### Scenario: ChangeRepository declares abstract methods

- **WHEN** `ChangeRepository` is declared
- **THEN** it is an abstract class with abstract methods for get, list, save, mutate
