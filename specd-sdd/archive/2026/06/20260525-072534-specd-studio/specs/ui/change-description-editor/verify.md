# Verification: Change Description Editor

## Requirements

### Requirement: multiline description with save when dirty

#### Scenario: Save disabled when unchanged

- **GIVEN** draft matches saved description
- **WHEN** editor renders
- **THEN** Save is disabled

### Requirement: save calls patchChange description only

#### Scenario: PATCH body is description only

- **WHEN** user clicks Save
- **THEN** `patchChange` receives only `{ description }`

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: Uses port via hook

- **WHEN** Save succeeds
- **THEN** call went through `SpecdDataPort.patchChange`
