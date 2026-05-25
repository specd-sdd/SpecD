# Verification: Dto Change Graph View

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

### Requirement: change graph view lists per-spec coverage

#### Scenario: Response includes specs array not links

- **WHEN** client calls `GET /v1/graph/changes/{name}` successfully
- **THEN** body includes `specs` as an array
- **AND** each element has `specId`, `coveredFiles`, and `coveredSymbols`
- **AND** body does not include a `links` property

#### Scenario: specIds matches change scope

- **GIVEN** change lists spec IDs in manifest
- **WHEN** graph view is returned
- **THEN** `specIds` lists the same change scope
- **AND** `specs` length equals number of resolved spec rows

### Requirement: optional fields are omitted rather than null

#### Scenario: Optional keys omitted when absent

- **WHEN** presenter serializes without optional values
- **THEN** JSON omits those properties
- **AND** keys are not `null` unless allowed

#### Scenario: Present optional values are included

- **GIVEN** kernel provides optional field
- **WHEN** DTO is serialized
- **THEN** property appears with correct type
- **AND** OpenAPI documents optionality

#### Scenario: Client parser accepts omitted keys

- **WHEN** client reads JSON without optional field
- **THEN** typed object treats field as undefined
- **AND** UI guards optional access
