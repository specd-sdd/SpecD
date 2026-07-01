# Verification: Presenter Graph

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

### Requirement: graph status presenter derives warnings from health result

#### Scenario: Presenter does not recompute staleness

- **GIVEN** a `GetGraphHealthResult` fixture with `stale: true`
- **WHEN** `toGraphStatusDto` runs
- **THEN** output `stale` matches input
- **AND** warnings are derived only from input fields

#### Scenario: CLI-equivalent stale message

- **GIVEN** known `lastIndexedRef` and `currentRef`
- **WHEN** stale warning is emitted
- **THEN** message mentions indexed vs current ref prefixes
