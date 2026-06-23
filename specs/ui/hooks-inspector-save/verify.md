# Verification: Hooks Inspector Save

## Requirements

### Requirement: save hook sends content originalHash and optional force

#### Scenario: Save sends content and originalHash

- **GIVEN** editor has buffer and last GET hash
- **WHEN** user clicks Save
- **THEN** `saveChangeArtifact` receives content and hash
- **AND** `force` is false by default

#### Scenario: Force save only after explicit confirm

- **GIVEN** active approval guard blocks save
- **WHEN** user confirms force in dialog
- **THEN** save includes `force: true`
- **AND** guard error is not shown again

#### Scenario: Successful save triggers refetch

- **WHEN** save returns new `updatedAt`
- **THEN** artifact content refetches
- **AND** changes-read status refresh is signaled

### Requirement: save hook shows conflict UI on HTTP 409

#### Scenario: 409 opens conflict dialog

- **WHEN** save returns HTTP 409
- **THEN** dialog offers reload or force
- **AND** buffer not overwritten silently

#### Scenario: Reload discards local buffer

- **WHEN** user chooses reload server
- **THEN** artifact refetched
- **AND** editor content replaced

#### Scenario: Force requires explicit confirm

- **WHEN** user chooses force save
- **THEN** save retried with `force: true`
- **AND** guard satisfied

### Requirement: successful save triggers artifact and status refetch

#### Scenario: Save success refetches artifact

- **WHEN** save returns new revision
- **THEN** `getChangeArtifact` runs
- **AND** editor hash updated

#### Scenario: Status hook signaled after save

- **WHEN** save completes
- **THEN** change status refetch scheduled
- **AND** tabs see new `updatedAt`

#### Scenario: Dirty flag cleared on success

- **WHEN** save succeeds
- **THEN** editor marks clean
- **AND** close prompt will not block
