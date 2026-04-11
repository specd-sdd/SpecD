# Verification: Change Manifest

## Requirements

### Requirement: Manifest structure

#### Scenario: Manifest stores artifact and file state explicitly

- **WHEN** a change manifest is written
- **THEN** each persisted artifact entry includes `state`
- **AND** each persisted file entry includes `state`

#### Scenario: Missing state defaults to missing on load

- **GIVEN** a manifest entry without a `state` field
- **WHEN** the manifest is loaded
- **THEN** the missing state is treated as `missing`

#### Scenario: Invalidated event stores message and affectedArtifacts

- **WHEN** a change is invalidated because validated files drifted
- **THEN** the `invalidated` event includes `cause`
- **AND** it includes a human-readable `message`
- **AND** it includes `affectedArtifacts` with artifact types and file keys

#### Scenario: Legacy artifact-change invalidation cause remains readable

- **GIVEN** a historical manifest whose `invalidated` event persisted `cause: "artifact-change"`
- **WHEN** the manifest is loaded
- **THEN** loading succeeds without reporting corruption
- **AND** the event is normalized to the current artifact-drift semantics

#### Scenario: validatedHash and state coexist

- **WHEN** `ValidateArtifacts` marks a file complete with hash `sha256:abc`
- **THEN** the manifest stores `validatedHash: "sha256:abc"`
- **AND** the file state is `complete`

#### Scenario: Drifted and pending-review states round-trip

- **GIVEN** a manifest with one file in `drifted-pending-review` and one file in `pending-review`
- **WHEN** the manifest is loaded and saved again
- **THEN** both states are preserved

### Requirement: Schema version

#### Scenario: Schema unchanged

- **WHEN** a change is loaded and its manifest schema matches the active schema name and version
- **THEN** no warning is emitted

#### Scenario: Schema version bumped

- **WHEN** a change is loaded and the active schema has a higher version than recorded in the manifest
- **THEN** specd emits a warning indicating the schema has changed since the change was created and the user should review whether the change artifacts are still compatible

#### Scenario: Schema name changed

- **WHEN** a change is loaded and the active schema name differs from the one recorded in the manifest
- **THEN** specd emits a warning indicating the change was created under a different schema

#### Scenario: Archiving with schema mismatch

- **WHEN** `specd archive` is run on a change with a schema version mismatch
- **THEN** the warning is shown and the user is asked to confirm before proceeding; archiving is not blocked

### Requirement: Atomic writes

#### Scenario: History events appended atomically

- **WHEN** a state transition occurs
- **THEN** the new `transitioned` event is appended to `history` and the entire manifest is written atomically (temp file + rename); no partial writes are visible
