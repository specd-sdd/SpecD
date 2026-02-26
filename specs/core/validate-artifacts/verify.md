# Verification: ValidateArtifacts

## Requirements

### Requirement: Required artifacts check

#### Scenario: Non-optional artifact missing — failure

- **GIVEN** a schema with a non-optional artifact `specs`
- **AND** the change has no file for `specs` and `validatedHash` is unset
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `result.passed` is `false` and `result.failures` lists `specs` as missing

#### Scenario: Skipped optional artifact does not cause failure

- **GIVEN** a schema with `optional: true` artifact `design`
- **AND** the change has `design.validatedHash === "__skipped__"`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `design` does not appear in `result.failures` — skipped optional artifacts are resolved

#### Scenario: Missing optional artifact does not cause failure

- **GIVEN** a schema with `optional: true` artifact `design`
- **AND** the change has no file and no `validatedHash` for `design`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `design` does not appear in `result.failures` — absent optional artifacts are allowed

### Requirement: Dependency order check

#### Scenario: Dependency complete — validation proceeds

- **GIVEN** artifact `specs` requires `proposal`, and `proposal` is `complete`
- **WHEN** `ValidateArtifacts.execute` is called for `specs`
- **THEN** validation of `specs` proceeds normally

#### Scenario: Dependency skipped — validation proceeds

- **GIVEN** artifact `tasks` requires `design`, and `design` is `optional: true` with `validatedHash === "__skipped__"`
- **WHEN** `ValidateArtifacts.execute` is called for `tasks`
- **THEN** validation of `tasks` proceeds — `skipped` satisfies the dependency

#### Scenario: Dependency incomplete — validation blocked

- **GIVEN** artifact `specs` requires `proposal`, and `proposal` is `in-progress`
- **WHEN** `ValidateArtifacts.execute` is called for `specs`
- **THEN** `specs` is reported as dependency-blocked and `markComplete` is not called for it

#### Scenario: Skipped artifact is not validated

- **GIVEN** artifact `design` is `optional: true` with `validatedHash === "__skipped__"`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** no delta validation, application preview, or structural validation is run for `design` — there is no file to check

### Requirement: Approval invalidation on content change

#### Scenario: Content changed since approval — invalidation triggered

- **GIVEN** an active spec approval with `artifactHashes: { specs: "abc123" }`
- **AND** the current cleaned hash of `specs` is `"xyz789"`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `change.invalidate('artifact-change', actor)` is called before validation proceeds

#### Scenario: Invalidation called at most once per execution

- **GIVEN** two artifacts whose hashes both differ from the active approval
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `change.invalidate` is called exactly once — not once per artifact

#### Scenario: No invalidation when hashes match

- **GIVEN** an active spec approval whose `artifactHashes` match the current cleaned hashes
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `change.invalidate` is not called

### Requirement: Delta validation

#### Scenario: Delta validation failure blocks application

- **GIVEN** an artifact with a `deltaValidations` rule `{ type: sequence-item, where: { op: 'added' }, required: true }`
- **AND** the delta YAML AST contains no `sequence-item` node where the correlated `op` pair has `value: added`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `result.passed` is `false`, the artifact is not advanced to application preview, and `markComplete` is not called

#### Scenario: Delta validation warning does not block application

- **GIVEN** a `deltaValidations` rule with `required: false` that matches zero nodes in the delta YAML AST
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** the artifact proceeds to application preview and `result.warnings` includes the unsatisfied rule

#### Scenario: Delta validation passes vacuously when no nodes match

- **GIVEN** a `deltaValidations` rule whose selector matches zero nodes in the delta YAML AST
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** the rule passes without error regardless of `required`

### Requirement: Delta application preview and conflict detection

#### Scenario: DeltaApplicationError blocks validation

- **GIVEN** a delta file where two entries both target the same node
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `ArtifactParser.apply()` throws `DeltaApplicationError`, `result.passed` is `false`, and `markComplete` is not called

#### Scenario: Application preview does not write to SpecRepository

- **GIVEN** a valid delta that would modify the base spec
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** the base spec file in `SpecRepository` is unchanged — the merged result is used only for `validations[]` checks

#### Scenario: No delta file — artifact validated directly

- **GIVEN** an artifact with `delta: true` but no delta file present in the change directory
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `validations[]` run against the artifact file content directly, with no application preview step

#### Scenario: Non-delta artifact validated directly

- **GIVEN** an artifact with `delta: false`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `validations[]` run against the artifact file content directly, with no application preview step

### Requirement: Structural validation

#### Scenario: Required section absent — failure

- **GIVEN** an artifact with a `validations` rule `{ type: section, matches: '^Purpose$', required: true }`
- **AND** the merged artifact content has no top-level `Purpose` section
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `result.failures` includes the missing section and `markComplete` is not called

#### Scenario: Optional section absent — warning only

- **GIVEN** a `validations` rule with `required: false` that matches no node in the artifact AST
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `result.warnings` includes the absent section and validation still passes

#### Scenario: All validation failures collected before returning

- **GIVEN** two `required: true` validation rules both fail for the same artifact
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `result.failures` contains both failures — validation does not stop at the first

### Requirement: Hash computation and markComplete

#### Scenario: All validations pass — markComplete called with cleaned hash

- **GIVEN** all validations pass for artifact `specs`
- **AND** `preHashCleanup` normalises checked checkboxes before hashing
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `markComplete` is called with the SHA-256 of the cleaned content

#### Scenario: Any validation failure — markComplete not called

- **GIVEN** at least one `required: true` validation rule fails for an artifact
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `markComplete` is not called for that artifact

### Requirement: Result shape

#### Scenario: passed is false when any required artifact is missing

- **WHEN** at least one non-optional artifact is `missing`
- **THEN** `result.passed` is `false`

#### Scenario: passed is true when all pass

- **WHEN** all non-optional artifacts are present and all validations pass
- **THEN** `result.passed` is `true` and `result.failures` is empty

### Requirement: Save after validation

#### Scenario: Save called even when some artifacts fail

- **GIVEN** one artifact passes validation (markComplete called) and one fails
- **WHEN** `ValidateArtifacts.execute` completes
- **THEN** `changeRepository.save(change)` is called — partial progress is persisted
