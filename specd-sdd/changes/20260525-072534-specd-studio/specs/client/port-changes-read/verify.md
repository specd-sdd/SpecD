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

### Requirement: port failures surface as typed client errors

#### Scenario: port failures surface as typed client errors — primary path

- **WHEN** HTTP failures MUST be translated by adapter-problem-json-errors into
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: port failures surface as typed client errors — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented
