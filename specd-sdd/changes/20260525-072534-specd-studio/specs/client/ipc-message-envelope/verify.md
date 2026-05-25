# Verification: Ipc Message Envelope

## Requirements

### Requirement: requests carry a correlation id

#### Scenario: Renderer assigns correlation id per invoke

- **WHEN** preload `invoke` sends IPC request
- **THEN** envelope includes `correlationId`
- **AND** main logs can trace request

#### Scenario: Response echoes same correlation id

- **WHEN** main process replies to invoke
- **THEN** response envelope matches request id
- **AND** renderer pairs promise resolution

#### Scenario: Duplicate id rejected in dev builds

- **GIVEN** debug assertions enabled
- **WHEN** two in-flight invokes reuse same id
- **THEN** warning or error surfaced
- **AND** promises do not cross-resolve

### Requirement: errors propagate as structured failure envelopes

#### Scenario: Kernel error maps to failure envelope

- **WHEN** IPC handler catches `SpecdError`
- **THEN** reply is failure envelope
- **AND** code and message fields present

#### Scenario: Renderer rejects promise with typed error

- **WHEN** failure envelope received
- **THEN** hook `error` state set
- **AND** message shown in UI

#### Scenario: Success envelope bypasses error mapper

- **WHEN** handler returns DTO payload
- **THEN** promise resolves with data
- **AND** no failure flag set
