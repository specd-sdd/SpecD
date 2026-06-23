# Verification: Dto Graph Search

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

### Requirement: symbol hits use reusable graph symbol refs

#### Scenario: Search hit symbol payload matches graph symbol ref shape

- **WHEN** graph search returns symbol hits
- **THEN** each hit includes a nested `symbol` object
- **AND** that object satisfies [`api:dto-graph-symbol-ref`](../dto-graph-symbol-ref/spec.md)

### Requirement: spec hits expose preview context

#### Scenario: Search hits expose preview snippet and line range

- **WHEN** graph search returns symbol or spec hits
- **THEN** each hit includes `snippet`, `startLine`, and `endLine`
- **AND** preview context is available without a secondary fetch

### Requirement: document hits expose file context

#### Scenario: Document hits include workspace and project paths

- **WHEN** graph search returns document hits
- **THEN** each hit includes `workspace`, `path`, and `projectRelativePath`
- **AND** exposes `snippet`, `startLine`, and `endLine` for preview

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
