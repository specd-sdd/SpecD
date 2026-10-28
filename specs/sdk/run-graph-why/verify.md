# Verification: SDK Run Graph Why

## Requirements

### Requirement: runGraphWhy orchestration

#### Scenario: Transient provider

- **GIVEN** no `provider` in the input
- **WHEN** `runGraphWhy` runs
- **THEN** it opens a provider with `withOpenGraphProvider` and closes it afterwards

#### Scenario: Caller-owned provider

- **GIVEN** a pre-opened `provider`
- **WHEN** `runGraphWhy` runs
- **THEN** it uses it directly and does not close it

#### Scenario: Pure delegation

- **WHEN** `runGraphWhy` runs
- **THEN** pattern matching, ownership and classification are performed by the code-graph use case and not by the SDK

#### Scenario: Locations are project-relative

- **WHEN** the result contains filesystem locations
- **THEN** they are expressed as `projectRelativePath`, exactly as the use case returned them

#### Scenario: Errors propagate

- **GIVEN** the use case fails with `UNKNOWN_WORKSPACE`
- **WHEN** `runGraphWhy` runs
- **THEN** the same `SpecdError` is thrown unchanged

### Requirement: Public surface

#### Scenario: Exported from the SDK

- **WHEN** a host imports from `@specd/sdk`
- **THEN** `runGraphWhy`, `RunGraphWhyInput` and `RunGraphWhyResult` are available with JSDoc

#### Scenario: No added presentation fields

- **WHEN** the result is compared with the use case result
- **THEN** it has the same fields

### Requirement: No presenter formatting

#### Scenario: Structured data only

- **WHEN** `runGraphWhy` returns
- **THEN** the result contains no terminal layout or styling

## Spec Dependencies

- `code-graph:explain-graph-path`
- `sdk:host-context`
- `sdk:with-open-graph-provider`
