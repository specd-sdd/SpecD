# Verification: Dto Preview Result

## Requirements

### Requirement: response JSON uses stable camelCase field names

#### Scenario: OpenAPI lists camelCase properties

- **WHEN** schema is generated for this DTO
- **THEN** property names are camelCase
- **AND** no snake_case aliases

#### Scenario: Runtime JSON matches schema

- **WHEN** handler returns success body
- **THEN** JSON keys match schema
- **AND** clients deserialize without mapping

#### Scenario: Breaking rename fails schema check

- **WHEN** required field renamed without version bump
- **THEN** OpenAPI diff or test fails
- **AND** Studio documents migration

### Requirement: presenters map domain results without embedding rules

#### Scenario: Presenter does not add business rules to DTO

- **GIVEN** kernel returns a status result with blockers
- **WHEN** presenter maps to this DTO
- **THEN** DTO fields reflect kernel data
- **AND** presenter does not alter lifecycle state

#### Scenario: Presenter does not embed lifecycle or approval logic

- **WHEN** presenter maps kernel or graph results
- **THEN** lifecycle state in the DTO matches kernel output
- **AND** no validation or approval rules are applied in the presenter

#### Scenario: Identical kernel fixture yields identical JSON

- **GIVEN** a fixed kernel or graph fixture
- **WHEN** presenter serializes twice
- **THEN** both JSON bodies are byte-identical
