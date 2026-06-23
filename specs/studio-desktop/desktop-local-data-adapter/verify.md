# Verification: Desktop Local Data Adapter

## Requirements

### Requirement: local adapter is selected for opened project folders

#### Scenario: Open folder switches renderer to IPC adapter

- **WHEN** user opens local project via welcome
- **THEN** `SpecdDataPort` uses IPC implementation
- **AND** remote HTTP adapter not active

#### Scenario: Remote connect keeps HTTP adapter

- **WHEN** user connects to remote URL
- **THEN** HTTP transport selected
- **AND** IPC adapter not used for data

#### Scenario: Profile switch swaps adapter instance

- **WHEN** user moves from local to remote profile
- **THEN** hooks rebind to new adapter
- **AND** port interface unchanged

### Requirement: local adapter does not attach Authorization headers

#### Scenario: IPC invoke has no Authorization metadata

- **WHEN** local adapter calls `listChanges`
- **THEN** IPC envelope has no bearer field
- **AND** main process uses kernel actor resolver

#### Scenario: Accidental token in local profile is ignored

- **GIVEN** stale token stored from remote session
- **WHEN** local adapter runs
- **THEN** IPC still omits Authorization
- **AND** token not sent to main

#### Scenario: Remote adapter still attaches bearer when configured

- **GIVEN** remote profile with token
- **WHEN** HTTP transport runs
- **THEN** Authorization header present
- **AND** local and remote paths differ by design
