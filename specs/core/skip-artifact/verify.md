# Verification: SkipArtifact

## Requirements

### Requirement: Change lookup

#### Scenario: Change does not exist

- **WHEN** `execute` is called with a `name` that does not exist in the repository
- **THEN** it throws `ChangeNotFoundError`

### Requirement: Artifact existence check

#### Scenario: Artifact does not exist on the change

- **GIVEN** a change with no artifact matching the given `artifactId`
- **WHEN** `execute` is called with that `artifactId`
- **THEN** it throws `ArtifactNotFoundError`

### Requirement: Only optional artifacts may be skipped

#### Scenario: Skipping a required artifact

- **GIVEN** a change with an artifact where `optional` is `false`
- **WHEN** `execute` is called with that artifact's ID
- **THEN** it throws `ArtifactNotOptionalError`

### Requirement: Recording and marking

#### Scenario: Successfully skipping an optional artifact

- **GIVEN** a change with an optional artifact
- **WHEN** `execute` is called with the artifact's ID and a reason
- **THEN** `change.recordArtifactSkipped` is called with the artifact ID, the resolved actor, and the reason
- **AND** `artifact.markSkipped()` is called

#### Scenario: Skipping without a reason

- **GIVEN** a change with an optional artifact
- **WHEN** `execute` is called without a `reason`
- **THEN** `change.recordArtifactSkipped` is called with `undefined` as the reason
- **AND** the artifact is still marked as skipped

### Requirement: Persistence and output

#### Scenario: Change is persisted and returned

- **GIVEN** a successful skip operation
- **WHEN** `execute` completes
- **THEN** `ChangeRepository.save` is called with the updated change
- **AND** the returned value is the `Change` entity
