# Verification: GetSpecCoverage

## Requirements

### Requirement: Returns spec coverage snapshot

#### Scenario: Indexed spec with coverage

- **GIVEN** a spec indexed with covered files and symbols
- **WHEN** `GetSpecCoverage.execute({ specId })` runs
- **THEN** `found` is `true`
- **AND** `coveredFiles` and `coveredSymbols` match provider relations
- **AND** counts reflect unique targets

#### Scenario: Spec not in graph

- **GIVEN** `provider.getSpec(specId)` returns `undefined`
- **WHEN** `GetSpecCoverage.execute()` runs
- **THEN** `found` is `false`
- **AND** arrays are empty and counts are zero

### Requirement: Accepts open provider

#### Scenario: Does not open or close provider

- **GIVEN** a mock provider with spied lifecycle methods
- **WHEN** `GetSpecCoverage.execute()` runs
- **THEN** `open` and `close` are not called

### Requirement: Factory wires dependencies

#### Scenario: Factory returns stateless instance

- **WHEN** `createGetSpecCoverage()` is called
- **THEN** it returns a `GetSpecCoverage` with no captured config
