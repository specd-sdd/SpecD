# Verification: ValidateChangeBatch

## Requirements

### Requirement: constructor and dependencies

#### Scenario: constructor and dependencies — primary path

- **WHEN** ValidateChangeBatch MUST receive ChangeRepository, SchemaProvider, and ValidateArtifacts at
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: constructor and dependencies — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: input

#### Scenario: input — primary path

- **WHEN** ValidateChangeBatchInput MUST include: - name — change name
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: input — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

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

### Requirement: aggregated result

#### Scenario: aggregated result — primary path

- **WHEN** ValidateChangeBatchResult MUST expose: - passed — true only
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: aggregated result — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: not a substitute for ValidateSpecs

#### Scenario: not a substitute for ValidateSpecs — primary path

- **WHEN** ValidateChangeBatch validates change artifacts only. Canonical workspace spec
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: not a substitute for ValidateSpecs — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented
