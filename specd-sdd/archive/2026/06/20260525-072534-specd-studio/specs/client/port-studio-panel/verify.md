# Verification: Port Studio Panel

## Requirements

### Requirement: readProjectLogs and appendProjectLog

#### Scenario: Remote adapter calls logs routes

- **WHEN** `appendProjectLog` is invoked
- **THEN** HTTP POST targets `/v1/logs`
- **AND** `readProjectLogs` uses GET `/v1/logs`

### Requirement: output buffering is local to the UI session

#### Scenario: Remote adapter does not implement studio output transport methods

- **WHEN** `RemoteSpecdDataAdapter` is inspected
- **THEN** Studio output is not loaded or appended through a dedicated remote output endpoint
- **AND** output buffering is delegated to local UI state

### Requirement: trace logs remain independent from local output

#### Scenario: Appending a project log does not define local output persistence

- **WHEN** `appendProjectLog` is invoked for a debug trace
- **THEN** the port writes only to `/v1/logs`
- **AND** any user-facing output line must be managed separately by the UI session buffer

### Requirement: SpecdDataPort composes PortStudioPanel

#### Scenario: Memory adapter implements studio panel methods

- **WHEN** `MemorySpecdDataAdapter` is inspected
- **THEN** it implements the remaining `PortStudioPanel` log methods
