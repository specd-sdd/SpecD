# Verification: Presenter Change

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

### Requirement: historyEventDto maps type-specific ChangeEvent fields

#### Scenario: Invalidated event retains cause and affected artifacts

- **GIVEN** kernel history with `invalidated` and `affectedArtifacts`
- **WHEN** `toChangeDetailDto` runs
- **THEN** JSON history entry includes `cause`, `message`, and `affectedArtifacts`
- **AND** `by` uses name and email

#### Scenario: Spec-approved event retains hashes

- **GIVEN** kernel history with `spec-approved`
- **WHEN** detail DTO is built
- **THEN** history entry includes `reason` and `artifactHashes`
- **AND** is not reduced to `type`/`at`/`by` only

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
