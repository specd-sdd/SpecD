# Verification: Presenter Project

## Requirements

### Requirement: presenter maps entities to DTO fields deterministically

#### Scenario: Presenter output matches paired DTO

- **GIVEN** fixed kernel or graph fixture
- **WHEN** presenter serializes to JSON
- **THEN** shape matches `api:dto-*` spec
- **AND** OpenAPI schema validates sample

#### Scenario: Presenter leaves kernel blockers unchanged

- **GIVEN** kernel returns known blockers
- **WHEN** presenter maps response
- **THEN** blocker codes equal kernel
- **AND** no new blockers invented

#### Scenario: Repeated mapping is deterministic

- **WHEN** presenter called twice on same input
- **THEN** outputs are identical
- **AND** no time-dependent fields unless documented

### Requirement: presenter does not encode business rules

#### Scenario: Presenter output matches paired DTO

- **GIVEN** fixed kernel or graph fixture
- **WHEN** presenter serializes to JSON
- **THEN** shape matches `api:dto-*` spec
- **AND** OpenAPI schema validates sample

#### Scenario: Presenter leaves kernel blockers unchanged

- **GIVEN** kernel returns known blockers
- **WHEN** presenter maps response
- **THEN** blocker codes equal kernel
- **AND** no new blockers invented

#### Scenario: Repeated mapping is deterministic

- **WHEN** presenter called twice on same input
- **THEN** outputs are identical
- **AND** no time-dependent fields unless documented

### Requirement: project status presenter maps graph health diagnostics

#### Scenario: Project presenter reuses graph warning derivation

- **GIVEN** `buildProjectStatusSnapshot` with `graphHealth` fixture
- **WHEN** project status DTO is built
- **THEN** `graph.warnings` matches `toGraphStatusDto` output for the same health result

### Requirement: project status presentation uses the canonical client mapper

#### Scenario: API delegates final status DTO construction

- **GIVEN** a project status snapshot, graph health, approvals, and effective auth type
- **WHEN** the API presenter builds the status response
- **THEN** it passes structural input to the `@specd/client` mapper
- **AND** the returned value is used as the HTTP DTO without a second field mapping
