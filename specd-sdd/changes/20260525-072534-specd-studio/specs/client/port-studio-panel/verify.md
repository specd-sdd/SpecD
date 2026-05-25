# Verification: Port Studio Panel

## Requirements

### Requirement: listStudioOutput and appendStudioOutput

#### Scenario: Remote adapter calls studio output routes

- **WHEN** `RemoteSpecdDataAdapter.appendStudioOutput` is invoked
- **THEN** HTTP POST targets `/v1/studio/output`
- **AND** `listStudioOutput` uses GET with limit query

### Requirement: readProjectLogs and appendProjectLog

#### Scenario: Remote adapter calls logs routes

- **WHEN** `appendProjectLog` is invoked
- **THEN** HTTP POST targets `/v1/logs`
- **AND** `readProjectLogs` uses GET `/v1/logs`

### Requirement: output and logs are independent buffers

#### Scenario: POST logs does not add studio output rows

- **WHEN** client POSTs `/v1/logs` only
- **THEN** `GET /v1/studio/output` entry count is unchanged

#### Scenario: POST studio output does not add log ring rows

- **WHEN** client POSTs `/v1/studio/output` only
- **THEN** `GET /v1/logs` does not gain an entry with the same user message

### Requirement: SpecdDataPort composes PortStudioPanel

#### Scenario: Memory adapter implements studio panel methods

- **WHEN** `MemorySpecdDataAdapter` is inspected
- **THEN** it implements all `PortStudioPanel` methods
