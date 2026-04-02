# Verification: ValidateArtifacts

## Requirements

### Requirement: Required artifacts check

#### Scenario: Non-optional artifact missing — failure

- **GIVEN** a change with a required (non-optional) artifact that has no files
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** the result includes a validation failure for the missing artifact

#### Scenario: Skipped optional artifact does not cause failure

- **GIVEN** a schema with `optional: true` artifact `design`
- **AND** the change has `design.validatedHash === "__skipped__"`
- **WHEN** `ValidateArtifacts.execute` is called without `artifactId`
- **THEN** `design` does not appear in `result.failures` — skipped optional artifacts are resolved

#### Scenario: Missing optional artifact does not cause failure

- **GIVEN** a schema with `optional: true` artifact `design`
- **AND** the change has no file and no `validatedHash` for `design`
- **WHEN** `ValidateArtifacts.execute` is called without `artifactId`
- **THEN** `design` does not appear in `result.failures` — absent optional artifacts are allowed

#### Scenario: Required artifacts check skipped when artifactId is provided

- **GIVEN** a schema with non-optional artifacts `proposal` and `specs`
- **AND** only `proposal` has a file; `specs` is missing
- **AND** `artifactId` is `"proposal"`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `result.passed` is `true` (assuming `proposal` passes validation)
- **AND** the missing `specs` artifact is not reported as a failure

### Requirement: Input — artifactId filter

#### Scenario: Unknown artifact ID returns failure

- **GIVEN** `artifactId` is `"nonexistent"` and the schema has no artifact with that ID
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `result.passed` is `false` and `result.failures` includes a descriptive error for the unknown ID
- **AND** no validation, delta check, or `markComplete` is performed

#### Scenario: Only the specified artifact is validated

- **GIVEN** the schema has artifacts `proposal`, `specs`, and `verify`
- **AND** `artifactId` is `"specs"`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** only `specs` goes through dependency check, delta validation, structural validation, and hash computation
- **AND** `proposal` and `verify` are not checked, not reported as missing, and not included in the result

#### Scenario: Dependency order still applies to the specified artifact

- **GIVEN** `artifactId` is `"specs"` and artifact `specs` requires `proposal`
- **AND** `proposal` is not `complete` or `skipped`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `specs` is reported as dependency-blocked and `markComplete` is not called

#### Scenario: Specified artifact with satisfied dependencies proceeds normally

- **GIVEN** `artifactId` is `"specs"` and artifact `specs` requires `proposal`
- **AND** `proposal` is `complete`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `specs` is validated normally and `markComplete` is called if all validations pass

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

#### Scenario: Approval invalidation resets only drifted artifacts and downstream

- **GIVEN** a change with an active spec approval
- **AND** the DAG is: proposal → specs → verify, proposal → design, specs + design → tasks
- **AND** only `design.md` has changed since approval (hash mismatch)
- **WHEN** `ValidateArtifacts.execute` detects the hash mismatch
- **THEN** `change.invalidate('artifact-change', actor, ['design'])` is called
- **AND** `design` and `tasks` are reset (design + its downstream)
- **AND** `proposal`, `specs`, and `verify` remain `complete`

#### Scenario: Multiple artifacts drift — all drifted IDs collected in single call

- **GIVEN** a change with an active spec approval
- **AND** both `specs` and `design` have changed since approval
- **WHEN** `ValidateArtifacts.execute` detects the mismatches
- **THEN** a single `change.invalidate('artifact-change', actor, ['specs', 'design'])` is called
- **AND** `specs`, `verify`, `design`, and `tasks` are reset
- **AND** `proposal` remains `complete`

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

#### Scenario: no-op delta bypasses deltaValidations entirely

- **GIVEN** an artifact with `deltaValidations` rules including a `required: true` rule
- **AND** the delta file contains only `[{ op: "no-op" }]`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `deltaValidations` are not evaluated
- **AND** `result.passed` is `true`
- **AND** `markComplete` is called with the hash of the raw delta file content

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

#### Scenario: no-op delta skips application preview

- **GIVEN** an artifact with `delta: true` and a delta file containing only `[{ op: "no-op" }]`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** no base spec is loaded from `SpecRepository`
- **AND** `parser.apply()` is not called
- **AND** `markComplete` is called with the hash of the raw delta file content

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

#### Scenario: no-op delta skips structural validation

- **GIVEN** an artifact with `validations` rules and a delta file containing only `[{ op: "no-op" }]`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `validations[]` rules are not evaluated against the base content
- **AND** `markComplete` is called with the hash of the raw delta file content

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

#### Scenario: Partial progress is persisted through serialized mutation

- **GIVEN** one artifact passes validation (`markComplete` is called) and one artifact fails
- **WHEN** `ValidateArtifacts.execute` completes
- **THEN** `ChangeRepository.mutate(input.name, fn)` is used to persist the updated change
- **AND** the persisted manifest keeps the successful `validatedHash` updates together with the failure result

#### Scenario: Validation side effects run against the fresh persisted change

- **GIVEN** another operation updates the same change before validation persistence begins
- **WHEN** `ValidateArtifacts.execute` enters its persistence step
- **THEN** the mutation callback receives a freshly reloaded `Change`
- **AND** validation updates are applied on top of that fresh state instead of overwriting it with an older snapshot
