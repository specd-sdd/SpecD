# Verification: Specd Data Port

## Requirements

### Requirement: SpecdDataPort aggregates all port method groups

#### Scenario: Port composes project collection read mutate groups

- **WHEN** UI imports `SpecdDataPort` type
- **THEN** interface includes project, changes, workspaces, graph, archived methods
- **AND** consumers depend on aggregate only

#### Scenario: Output session buffer is not exposed as a remote port method

- **WHEN** `SpecdDataPort` is inspected after the output-locality change
- **THEN** no dedicated remote output-buffer contract is required
- **AND** bottom-panel output/problems remain local UI state

#### Scenario: Graph methods delegate to port-graph

- **WHEN** `getGraphStatus()` is called
- **THEN** underlying port-graph HTTP or IPC runs
- **AND** UI does not call code-graph directly

#### Scenario: Breaking port change fails compile

- **WHEN** port method signature changes
- **THEN** adapters and UI fail TypeScript build
- **AND** contract drift is caught early

### Requirement: multiple adapters implement the same port interface

#### Scenario: Remote and memory adapters are interchangeable

- **GIVEN** fixture data seeded in memory adapter
- **WHEN** same UI hook runs against both adapters
- **THEN** hook API identical
- **AND** results shape match

#### Scenario: Desktop local uses IPC implementation

- **GIVEN** Electron local profile
- **WHEN** hook fetches change status
- **THEN** IPC adapter services call
- **AND** no HTTP to localhost required

#### Scenario: Adapter selection is profile-driven

- **WHEN** user switches from local to remote profile
- **THEN** renderer swaps adapter instance
- **AND** port interface unchanged
