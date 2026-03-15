# Verification: ChangeRepository Port

## Requirements

### Requirement: get returns a Change or null

#### Scenario: Change exists

- **WHEN** `get("add-oauth-login")` is called and a change with that name exists
- **THEN** a `Change` is returned with artifact statuses derived from current file hashes vs stored `validatedHash`

#### Scenario: Change does not exist

- **WHEN** `get("nonexistent-change")` is called and no change with that name exists
- **THEN** `null` is returned

#### Scenario: Hash mismatch resets artifact status

- **GIVEN** a change whose artifact file has been modified since the last validation
- **WHEN** `get()` loads that change
- **THEN** the artifact whose hash differs from `validatedHash` has status `in-progress`

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

### Requirement: artifact loads content with originalHash

#### Scenario: Artifact exists

- **GIVEN** a change with an artifact file `proposal.md` on disk
- **WHEN** `artifact(change, "proposal.md")` is called
- **THEN** a `SpecArtifact` is returned with the file content and `originalHash` set to `sha256` of that content

#### Scenario: Artifact does not exist

- **WHEN** `artifact(change, "nonexistent.md")` is called
- **THEN** `null` is returned

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
