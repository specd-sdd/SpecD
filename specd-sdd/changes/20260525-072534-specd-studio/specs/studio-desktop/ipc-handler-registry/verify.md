# Verification: Ipc Handler Registry

## Requirements

### Requirement: IPC handlers mirror SpecdDataPort operations

#### Scenario: IPC getChangeStatus calls GetStatus

- **WHEN** renderer invokes IPC status channel
- **THEN** main runs `GetStatus` in kernel
- **AND** response matches HTTP shape

#### Scenario: IPC save uses SaveChangeArtifact

- **WHEN** renderer saves artifact via IPC
- **THEN** main runs save use case
- **AND** 409 propagates in envelope

#### Scenario: Renderer does not embed business rules

- **WHEN** IPC handler executes
- **THEN** no duplicated transition logic in preload
- **AND** kernel rules apply

### Requirement: handlers use ipc-message-envelope

#### Scenario: Main handler parses envelope wrapper

- **WHEN** IPC channel receives invoke
- **THEN** correlation id read from envelope
- **AND** payload dispatched to kernel

#### Scenario: Handler replies with success envelope

- **WHEN** kernel returns DTO
- **THEN** reply includes correlation id
- **AND** failure flag false

#### Scenario: Thrown errors become failure envelopes

- **WHEN** kernel throws `SpecdError`
- **THEN** failure envelope returned to renderer
- **AND** stack not leaked raw
