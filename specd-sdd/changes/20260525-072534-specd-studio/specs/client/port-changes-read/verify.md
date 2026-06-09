# Verification: Port Changes Read

## Requirements

### Requirement: port exposes Changes Read operations

#### Scenario: port exposes Changes Read operations — primary path

- **WHEN** The interface MUST declare asynchronous methods equivalent to
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: port exposes Changes Read operations — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: port signatures are identical for HTTP and IPC adapters

#### Scenario: port signatures are identical for HTTP and IP… — primary path

- **WHEN** Implementations (adapter-remote-specd-data, desktop IPC) MUST implement these methods
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: port signatures are identical for HTTP and IP… — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: port exposes read-only artifact by origin

#### Scenario: getReadOnlyChangeArtifact maps to draft route

- **WHEN** adapter receives `getReadOnlyChangeArtifact(name, filename, 'draft')`
- **THEN** HTTP `GET /v1/drafts/{name}/artifacts/{filename}` is called
- **AND** `GET /v1/changes/{name}/artifacts/{filename}` is not called

#### Scenario: getReadOnlyChangeArtifact maps to discarded route

- **WHEN** adapter receives `getReadOnlyChangeArtifact(name, filename, 'discarded')`
- **THEN** HTTP `GET /v1/discarded/{name}/artifacts/{filename}` is called

#### Scenario: artifact list preserves task metadata

- **WHEN** adapter reads change artifact lists from API
- **THEN** entries preserve `hasTasks`
- **AND** optional task counters remain available to UI consumers

### Requirement: port failures surface as typed client errors

#### Scenario: port failures surface as typed client errors — primary path

- **WHEN** HTTP failures MUST be translated by adapter-problem-json-errors into
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: port failures surface as typed client errors — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented
