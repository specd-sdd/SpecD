# Verification: Get Change Artifact

## Requirements

### Requirement: GetChangeArtifact returns content and originalHash

#### Scenario: Tracked file returns content and hash

- **GIVEN** `proposal.md` is tracked on change `foo`
- **WHEN** `GetChangeArtifact` runs
- **THEN** returns UTF-8 content
- **AND** `originalHash` has sha256 prefix

#### Scenario: Untracked filename fails

- **WHEN** filename is not on manifest
- **THEN** typed not-found or validation error
- **AND** no repository read

#### Scenario: Read does not call mutate

- **WHEN** use case executes
- **THEN** loads change via `get` and artifact bytes via `artifact`
- **AND** does not invoke `ChangeRepository.mutate` or `save`

### Requirement: GetChangeArtifact enforces tracked-file confinement

#### Scenario: Untracked filename fails before read

- **WHEN** filename is not tracked on the change manifest
- **THEN** `ChangeArtifactFileNotFoundError` (or equivalent typed error)
- **AND** `artifact` is not called

### Requirement: GetChangeArtifact is read-only

#### Scenario: Repeated reads keep updatedAt stable

- **GIVEN** change `foo` with known `updatedAt`
- **WHEN** `GetChangeArtifact` runs twice for the same tracked filename
- **THEN** manifest `updatedAt` is unchanged after both reads

#### Scenario: HTTP GET artifact does not bump revision clock

- **GIVEN** API client calls `GET /changes/{name}/artifacts/{filename}`
- **WHEN** no save or other mutation occurs between requests
- **THEN** subsequent `GET /changes/{name}/status` reports the same `updatedAt`
