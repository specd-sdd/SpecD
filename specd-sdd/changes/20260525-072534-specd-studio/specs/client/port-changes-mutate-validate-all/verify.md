# Verification: Port Changes Mutate — validateChangeAll

## Requirements

### Requirement: validateChangeAll on SpecdDataPort

#### Scenario: Remote adapter POST path

- **WHEN** `adapter-remote-specd-data.validateChangeAll('feat', { artifactId: 'tasks' })` runs
- **THEN** transport issues `POST /v1/changes/feat/validate-all` with body `{ "artifactId": "tasks" }`

#### Scenario: validateChange stays single-step

- **WHEN** `validateChange` is called with `{ specId, artifactId }`
- **THEN** transport issues `POST /v1/changes/{name}/validate` only

### Requirement: remote adapter path

#### Scenario: remote adapter path — primary path

- **WHEN** adapter-remote-specd-data MUST POST /changes/{name}/validate-all with JSON body input
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: remote adapter path — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: memory adapter stub

#### Scenario: memory adapter stub — primary path

- **WHEN** adapter-memory-specd-data MAY return { passed: true, total: 0,
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: memory adapter stub — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: validateChange remains single-step

#### Scenario: validateChange remains single-step — primary path

- **WHEN** validateChange(name, { specId?, artifactId? }) MUST continue to
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: validateChange remains single-step — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented
