# Verification: Dto Graph Status

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

### Requirement: graph status exposes health diagnostics

#### Scenario: Stale graph includes graph-stale warning

- **GIVEN** `GetGraphHealthResult` with `stale: true` and known refs
- **WHEN** presenter serializes `GraphStatusDto`
- **THEN** JSON includes `warnings` with an entry `{ type: 'graph-stale', message: ... }`

#### Scenario: Fingerprint mismatch includes dedicated warning

- **GIVEN** `fingerprintMismatch: true`
- **WHEN** presenter serializes `GraphStatusDto`
- **THEN** JSON includes `warnings` with `{ type: 'graph-fingerprint-mismatch', message: ... }`

#### Scenario: Healthy graph returns empty warnings array

- **GIVEN** `stale: false` and `fingerprintMismatch: false`
- **WHEN** presenter serializes
- **THEN** `warnings` is `[]`
- **AND** diagnostic booleans are present or omitted per optional-field rules
