# Verification: Save Change Artifact

## Requirements

### Requirement: SaveChangeArtifact input shape

#### Scenario: Save accepts required fields

- **WHEN** `SaveChangeArtifact` is invoked
- **THEN** input includes name, filename, content, originalHash, actor
- **AND** `force` defaults false

#### Scenario: Missing actor fails

- **WHEN** save runs without actor
- **THEN** validation error before write
- **AND** manifest is unchanged

#### Scenario: Force flag is optional

- **GIVEN** caller omits `force`
- **WHEN** save runs under approval guard
- **THEN** treated as `force: false`
- **AND** `SaveRequiresForceError` may throw

### Requirement: save rejects untracked files and approval-guarded writes

#### Scenario: Guard blocks save without force

- **GIVEN** `activeSpecApproval` is set
- **AND** `force` is false
- **WHEN** save is attempted
- **THEN** `SaveRequiresForceError` throws
- **AND** file is not written

#### Scenario: Force allows guarded save

- **GIVEN** approval guard active
- **WHEN** save runs with `force: true`
- **THEN** content persists
- **AND** invalidation flag may be true

#### Scenario: Untracked filename fails before guard

- **WHEN** filename is not on manifest
- **THEN** error before approval check
- **AND** no partial write

### Requirement: optimistic concurrency uses originalHash

#### Scenario: Matching hash allows save

- **GIVEN** `originalHash` matches disk
- **WHEN** save executes
- **THEN** file updates
- **AND** new hash returned

#### Scenario: Stale hash throws ArtifactConflictError

- **GIVEN** disk changed since read
- **WHEN** save uses old hash
- **THEN** `ArtifactConflictError` is thrown
- **AND** API maps to HTTP 409

#### Scenario: Conflict does not bump updatedAt

- **WHEN** save fails with conflict
- **THEN** manifest `updatedAt` unchanged
- **AND** other files untouched

### Requirement: successful save resets file state and bumps manifest updatedAt

#### Scenario: Saved file becomes in-progress

- **WHEN** save succeeds
- **THEN** artifact state is `in-progress`
- **AND** validated baseline cleared

#### Scenario: Manifest updatedAt advances

- **WHEN** save completes
- **THEN** `change.updatedAt` is new ISO timestamp
- **AND** clients can poll with ifModifiedSince

#### Scenario: Drift reconciliation runs on siblings

- **GIVEN** other files were drifted
- **WHEN** save succeeds
- **THEN** drift hook revisits other artifacts
- **AND** invalidation may be true

### Requirement: SaveChangeArtifact returns hash revision and invalidation flag

#### Scenario: Result includes contentHash and updatedAt

- **WHEN** save succeeds
- **THEN** `contentHash` is returned
- **AND** `updatedAt` matches manifest

#### Scenario: Invalidated flag reflects side effects

- **GIVEN** save triggers invalidation
- **WHEN** result is returned
- **THEN** `invalidated: true`
- **AND** UI may refetch status

#### Scenario: Clean save returns invalidated false

- **GIVEN** no sibling drift changes
- **WHEN** save succeeds
- **THEN** `invalidated: false`
