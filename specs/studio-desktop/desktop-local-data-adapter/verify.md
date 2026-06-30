# Verification: Desktop Local Data Adapter

## Requirements

### Requirement: local adapter is selected for opened project folders

#### Scenario: Renderer uses IPC adapter for local profile

- **WHEN** the user opens a local project in desktop
- **THEN** the renderer uses this adapter instead of `adapter-remote-specd-data`
- **AND** the adapter does not bootstrap a kernel — it calls IPC only

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

### Requirement: renderer does not bootstrap kernel

#### Scenario: Adapter does not call createSdkContext

- **WHEN** the renderer uses the local data adapter
- **THEN** it issues IPC calls only
- **AND** it does not import `createSdkContext` or `createKernel`
