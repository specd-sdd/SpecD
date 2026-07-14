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

### Requirement: SDK kernel access in IPC handlers

#### Scenario: IPC handler uses SDK-bootstrapped kernel

- **GIVEN** a local desktop project is open
- **WHEN** an IPC handler executes a `SpecdDataPort` operation
- **THEN** it invokes use cases on the kernel from the SDK host context
- **AND** it does not construct a separate kernel in the handler

### Requirement: graph IPC methods use the Electron graph runtime

#### Scenario: Local graph IPC uses the Electron graph provider package

- **WHEN** the desktop main process serves graph status, search, impact, hotspot, or index IPC requests
- **THEN** it creates the provider through `@specd/code-graph-electron`
- **AND** graph execution stays inside the Electron local host runtime

#### Scenario: Renderer graph calls stay on the shared data port

- **WHEN** the renderer requests graph data in desktop-local mode
- **THEN** it invokes the shared `SpecdDataPort` methods through IPC
- **AND** the renderer does not import graph runtime packages directly

### Requirement: project status uses the canonical client mapper

#### Scenario: Local and remote status preserve the same DTO

- **GIVEN** equivalent kernel, graph-health, approval, and auth inputs
- **WHEN** desktop IPC and API HTTP map project status
- **THEN** both call the `@specd/client` project-status mapper
- **AND** both return structurally equal `ProjectStatusDto` values

#### Scenario: Missing graph health has canonical optional semantics

- **GIVEN** graph health is unavailable
- **WHEN** desktop maps local project status
- **THEN** the graph field is omitted exactly as in the HTTP response
