# Verification: GetChangeSpecCoverage

## Requirements

### Requirement: Returns change-level coverage

#### Scenario: Change with multiple specs

- **GIVEN** a change with `specIds` `[A, B]` in declaration order
- **WHEN** `GetChangeSpecCoverage.execute({ changeName })` runs
- **THEN** `specs` has two entries in `[A, B]` order
- **AND** each entry matches `GetSpecCoverage` output for that spec

### Requirement: Resolves change by name

#### Scenario: Missing change

- **GIVEN** no change named `missing`
- **WHEN** `GetChangeSpecCoverage.execute({ changeName: 'missing' })` runs
- **THEN** `ChangeNotFoundError` is thrown

### Requirement: Delegates per-spec coverage

#### Scenario: Uses injected GetSpecCoverage

- **GIVEN** a mock `GetSpecCoverage`
- **WHEN** change coverage runs for two specs
- **THEN** `GetSpecCoverage.execute` is called once per `specId`

### Requirement: Accepts repository and provider

#### Scenario: Does not mutate change or graph

- **GIVEN** a loaded change and open provider
- **WHEN** `GetChangeSpecCoverage.execute()` runs
- **THEN** it only reads via `ChangeRepository.get` and provider queries

### Requirement: Factory wires dependencies

#### Scenario: Injects GetSpecCoverage

- **WHEN** `createGetChangeSpecCoverage(getSpecCoverage)` is called
- **THEN** the returned instance delegates per-spec work to the injected use case
