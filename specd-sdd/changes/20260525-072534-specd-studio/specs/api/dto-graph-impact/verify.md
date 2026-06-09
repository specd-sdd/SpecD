# Verification: Dto Graph Impact

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

### Requirement: impact entries use reusable graph refs

#### Scenario: Impact symbol entries match graph symbol ref shape

- **WHEN** impact returns affected symbols
- **THEN** each symbol entry satisfies [`api:dto-graph-symbol-ref`](../dto-graph-symbol-ref/spec.md)
- **AND** optional `risk` MAY be added without replacing the reusable ref fields

#### Scenario: Impact file entries match graph file ref shape

- **WHEN** impact returns affected files
- **THEN** each file entry satisfies [`api:dto-graph-file-ref`](../dto-graph-file-ref/spec.md)
- **AND** optional `risk` MAY be added without replacing the reusable ref fields

#### Scenario: Impact spec entries expose canonical spec ids

- **WHEN** impact returns affected specs
- **THEN** each `specs[]` entry is a canonical `workspace:capability-path` id
- **AND** the array is present even when no specs are affected

#### Scenario: Impact symbol entries expose traversal depth

- **WHEN** impact returns affected symbols
- **THEN** each symbol entry includes `depth`
- **AND** depth matches the underlying graph traversal distance

### Requirement: impact response exposes aggregate blast-radius metrics

#### Scenario: Impact response exposes aggregate analysis metrics

- **WHEN** graph impact is serialized
- **THEN** JSON includes `riskLevel`, dependency counts, affected file count, and `affectedProcesses`
- **AND** clients can assess blast radius without recomputing aggregates

#### Scenario: Impact response keeps stable arrays

- **WHEN** presenter serializes graph impact without affected specs or files
- **THEN** `specs` and `files` are still present as empty arrays
- **AND** clients do not need optional guards for those collections
