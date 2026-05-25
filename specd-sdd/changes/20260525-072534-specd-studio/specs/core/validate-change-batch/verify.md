# Verification: ValidateChangeBatch

## Requirements

### Requirement: empty scope

#### Scenario: No specIds skips ValidateArtifacts

- **GIVEN** change `feat` with `specIds: []`
- **WHEN** `validateBatch.execute({ name: 'feat' })` runs
- **THEN** result is `{ passed: true, total: 0, results: [] }`
- **AND** `ValidateArtifacts` is not invoked

### Requirement: DAG walk

#### Scenario: Spec-scoped steps run per specId

- **GIVEN** change with two `specIds` and schema artifact `proposal` with `scope: change`
- **WHEN** `validateBatch.execute({ name })` runs
- **THEN** `ValidateArtifacts` is called once for change-scoped `proposal` without `specPath`
- **AND** spec-scoped artifacts run once per `specId`
