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
- **THEN** no delta validation, merge preview, or structural validation is run for `design` — there is no file to check

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

#### Scenario: Delta validation failure blocks merge

- **GIVEN** an artifact with `deltaValidations: [{ scope: 'ADDED Requirements', pattern: 'SHALL|MUST', required: true }]`
- **AND** the delta file's `ADDED Requirements` section contains a block without `SHALL` or `MUST`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `result.passed` is `false`, the artifact is not merged, and `markComplete` is not called

#### Scenario: Delta validation warning does not block merge

- **GIVEN** a `required: false` delta validation rule that is not satisfied
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** the artifact proceeds to merge and `result.warnings` includes the unsatisfied rule

### Requirement: Merge preview and conflict detection

#### Scenario: Delta conflict blocks validation

- **GIVEN** a delta file that renames `Old` to `New` and also modifies `Old`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `mergeSpecs` throws `DeltaConflictError`, `result.passed` is `false`, and `markComplete` is not called

#### Scenario: Merge preview does not write to SpecRepository

- **GIVEN** a valid delta that would modify the base spec
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** the base spec file in `SpecRepository` is unchanged — the merged result is used only for validation

#### Scenario: Non-delta artifact validated directly

- **GIVEN** an artifact with no `deltas[]` declared
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `validations[]` run against the artifact file content directly, with no merge step

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
