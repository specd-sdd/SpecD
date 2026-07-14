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

### Requirement: Dependency order check

#### Scenario: Dependency complete — validation proceeds

- **GIVEN** artifact `specs` requires `proposal`, and `LifecycleEngine` reports `proposal` as `complete`
- **WHEN** `ValidateArtifacts.execute` is called for `specs`
- **THEN** validation of `specs` proceeds normally

#### Scenario: Dependency skipped — validation proceeds

- **GIVEN** artifact `tasks` requires `design`, and `LifecycleEngine` reports `design` as `skipped`
- **WHEN** `ValidateArtifacts.execute` is called for `tasks`
- **THEN** validation of `tasks` proceeds — `skipped` satisfies the dependency

#### Scenario: Dependency incomplete — validation blocked

- **GIVEN** artifact `specs` requires `proposal`, and `LifecycleEngine` reports `proposal` as `in-progress`
- **WHEN** `ValidateArtifacts.execute` is called for `specs`
- **THEN** `specs` is reported as dependency-blocked and `markComplete` is not called for it

#### Scenario: Dependency-block failure includes effective dependency status

- **GIVEN** artifact `specs` requires `proposal`, and `LifecycleEngine` reports `proposal` effective status as `missing`
- **WHEN** `ValidateArtifacts.execute` is called for `specs`
- **THEN** the dependency-blocked failure description includes dependency `proposal`
- **AND** the description includes status `missing`

#### Scenario: Review-propagation blocker includes recursive parent context

- **GIVEN** artifact `verify` depends on `specs`
- **AND** `LifecycleEngine` reports `specs` effective status as `pending-parent-artifact-review`
- **AND** recursive blocker resolution identifies parent artifact `proposal` with status `pending-review`
- **WHEN** `ValidateArtifacts.execute` is called for `verify`
- **THEN** the dependency-blocked failure description includes status `pending-parent-artifact-review`
- **AND** the description includes parent blocker context (`proposal`, `pending-review`)

#### Scenario: Direct review blocker status is reported as review-state

- **GIVEN** artifact `verify` depends on `specs`
- **AND** `LifecycleEngine` reports `specs` effective status as `pending-review` or `drifted-pending-review`
- **WHEN** `ValidateArtifacts.execute` is called for `verify`
- **THEN** the dependency-blocked failure description includes the exact dependency status
- **AND** the status is presented as a review blocker, not as generic incompleteness

#### Scenario: Skipped artifact is not validated

- **GIVEN** artifact `design` is `optional: true` with `validatedHash === "__skipped__"`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** no delta validation, application preview, or structural validation is run for `design` — there is no file to check

### Requirement: Artifact traversal order

#### Scenario: Multi-artifact pass follows topological order

- **GIVEN** a change where `proposal` is complete and `specs` delta is ready but `verify` is not yet complete
- **WHEN** `ValidateArtifacts` validates all artifacts for one spec in a single `execute` without `artifactId`
- **THEN** `specs` is validated before `verify` is attempted
- **AND** dependency-blocked failures for `verify` do not occur solely because `specs` was validated later in declaration order within the same pass

#### Scenario: Lifecycle snapshot refreshes after markComplete in same execute

- **GIVEN** a change where parent and child artifacts are both incomplete at `execute` start
- **WHEN** the parent artifact validates successfully and is persisted as `complete` before the child is processed in the same `execute`
- **THEN** the child dependency check observes the parent as `complete`

### Requirement: Complete and skipped file bypass

#### Scenario: Complete file is not re-validated

- **GIVEN** a tracked file with canonical status `complete` and unchanged on-disk content
- **WHEN** `ValidateArtifacts` includes that file in the current invocation
- **THEN** structural validation for that file is skipped
- **AND** `markComplete` is not invoked again for that file

#### Scenario: Skipped file is not re-validated

- **GIVEN** a tracked optional artifact file marked `skipped`
- **WHEN** `ValidateArtifacts` includes that file in the current invocation
- **THEN** structural validation for that file is skipped

#### Scenario: Drift-pending file is still validated

- **GIVEN** a tracked file with canonical status `drifted-pending-review`
- **WHEN** `ValidateArtifacts` includes that file in the current invocation
- **THEN** structural validation still runs for that file

### Requirement: Approval invalidation on content change

#### Scenario: Drift collection records all file keys in one invalidation

- **GIVEN** a change with an active spec approval
- **AND** two validated files under `specs` have changed since approval
- **WHEN** `ValidateArtifacts.execute` detects the mismatches
- **THEN** a single invalidation is performed
- **AND** both file keys are included in the grouped affected artifact detail

#### Scenario: Drifted files become drifted-pending-review

- **GIVEN** a change with an active approval
- **AND** one validated file has changed since approval
- **WHEN** `ValidateArtifacts.execute` invalidates the change
- **THEN** that file becomes `drifted-pending-review`
- **AND** unaffected validated files become `pending-review`

#### Scenario: Drift invalidation is shared across spec approval and signoff

- **GIVEN** a change with an active signoff
- **AND** a validated artifact file has changed
- **WHEN** `ValidateArtifacts.execute` detects the mismatch
- **THEN** the same grouped invalidation behavior is applied

### Requirement: Policy-aware drift materialization

#### Scenario: One invalidate call carries the focused drift payload

- **GIVEN** one file under `specs` and one file under `verify` mismatch their validated baselines
- **WHEN** `ValidateArtifacts.execute` runs
- **THEN** it calls `Change.invalidate()` exactly once
- **AND** the grouped payload identifies only those mismatching files

#### Scenario: Policy none preserves complete while still marking drift

- **GIVEN** a complete file still exists on disk but its content hash changed
- **AND** the change's effective invalidation policy is `none`
- **WHEN** `ValidateArtifacts.execute` runs
- **THEN** the file remains canonically `complete`
- **AND** `hasDrift` becomes `true`

### Requirement: Per-file validation

#### Scenario: Missing expected non-optional file fails validation

- **GIVEN** a non-optional spec-scoped artifact has expected filename `deltas/core/core/config/spec.md.delta.yaml`
- **AND** that file does not exist in the change directory
- **WHEN** `ValidateArtifacts.execute` validates the artifact
- **THEN** `result.passed` is `false`
- **AND** the file is not marked complete
- **AND** the canonical file state is `missing`

#### Scenario: Non-expected file does not satisfy the expected path

- **GIVEN** a non-optional spec-scoped artifact has expected filename `deltas/core/core/config/spec.md.delta.yaml`
- **AND** a direct file exists at `specs/core/core/config/spec.md`
- **WHEN** `ValidateArtifacts.execute` validates the artifact
- **THEN** validation still reports the expected delta file as missing
- **AND** the direct file is ignored for that artifact

#### Scenario: Missing file can still carry hasDrift without rendering complete-with-drift

- **GIVEN** a file was previously validated and is now absent on disk
- **WHEN** `ValidateArtifacts.execute` compares current state to the validated baseline
- **THEN** `hasDrift` may remain `true`
- **AND** the file is not treated as `complete-with-drift`

### Requirement: Expected file path validation

#### Scenario: Existing spec validates only the expected delta

- **GIVEN** `core:config` already exists
- **AND** the schema artifact `specs` declares `delta: true`
- **AND** the change contains `deltas/core/core/config/spec.md.delta.yaml`
- **WHEN** `ValidateArtifacts.execute` validates `specs` for `core:config`
- **THEN** the delta file is parsed, applied to the base spec, and marked complete if validation passes
- **AND** the result file metadata reports `deltas/core/core/config/spec.md.delta.yaml`

#### Scenario: Existing spec with only a direct file fails

- **GIVEN** `core:config` already exists
- **AND** the schema artifact `specs` declares `delta: true`
- **AND** the change contains `specs/core/core/config/spec.md`
- **AND** the change does not contain `deltas/core/core/config/spec.md.delta.yaml`
- **WHEN** `ValidateArtifacts.execute` validates `specs` for `core:config`
- **THEN** validation fails with missing filename `deltas/core/core/config/spec.md.delta.yaml`
- **AND** `specs/core/core/config/spec.md` is not validated

#### Scenario: New spec validates the direct specs file

- **GIVEN** `core:new-capability` does not exist
- **AND** the change contains `specs/core/core/new-capability/spec.md`
- **WHEN** `ValidateArtifacts.execute` validates `specs` for `core:new-capability`
- **THEN** validation runs against the direct specs file
- **AND** no delta file is required

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

#### Scenario: Delta validation count mismatch blocks application

- **GIVEN** a `deltaValidations` rule with `count: { min: 2 }`
- **AND** only one delta entry matches the rule selector
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `result.passed` is `false`
- **AND** the artifact is not advanced to application preview

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

#### Scenario: Existing spec without expected delta fails

- **GIVEN** an artifact with `delta: true`
- **AND** the base spec exists in `SpecRepository`
- **AND** the expected delta file is missing from the change directory
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** validation fails with the expected delta filename
- **AND** no direct artifact fallback is attempted

#### Scenario: New file is validated directly

- **GIVEN** an artifact with `delta: true`
- **AND** the target spec does not exist in `SpecRepository`
- **AND** the expected direct artifact file exists under `specs/<workspace>/<capability-path>/`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `validations[]` run against the direct artifact content with no application preview step

#### Scenario: Missing non-optional artifact file causes failure

- **GIVEN** an artifact that is NOT optional (`optional: false` in schema)
- **AND** the expected artifact file does not exist in the change directory
- **AND** the artifact belongs to the spec being validated
- **WHEN** `ValidateArtifacts.execute` processes the artifact
- **THEN** validation fails with a failure indicating the missing expected file
- **AND** the artifact is NOT marked complete

#### Scenario: Missing optional artifact file is silently skipped

- **GIVEN** an artifact that IS optional (`optional: true` in schema)
- **AND** the expected artifact file does not exist in the change directory
- **WHEN** `ValidateArtifacts.execute` processes the artifact
- **THEN** validation continues without failure
- **AND** no failure is recorded for the missing file

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

#### Scenario: count exactly rejects duplicate local matches

- **GIVEN** a `validations` rule with `count: { exactly: 1 }`
- **AND** the merged artifact content contains two matching nodes
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `result.failures` includes the count mismatch and `markComplete` is not called

#### Scenario: All validation failures collected before returning

- **GIVEN** two `required: true` validation rules both fail for the same artifact
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `result.failures` contains both failures — validation does not stop at the first

#### Scenario: no-op delta skips structural validation

- **GIVEN** an artifact with `validations` rules and a delta file containing only `[{ op: "no-op" }]`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `validations[]` rules are not evaluated against the base content
- **AND** `markComplete` is called with the hash of the raw delta file content

### Requirement: Cross-artifact structural validation

#### Scenario: Spec-scoped relation compares merged outputs

- **GIVEN** `specs` and `verify` are delta-capable `scope: spec` artifacts for the same spec
- **AND** both local validations pass
- **WHEN** `ValidateArtifacts.execute` evaluates a matching cross-artifact rule
- **THEN** it compares the merged/materialized outputs, not the raw delta YAML files

#### Scenario: Single-artifact validation still runs relevant cross-artifact rules

- **GIVEN** validation is invoked with `artifactId: verify`
- **AND** a cross-artifact rule references `verify` and `specs`
- **AND** both participants are locally valid and available
- **WHEN** `ValidateArtifacts.execute` runs
- **THEN** the relational rule is evaluated during that invocation

#### Scenario: Completed counterpart is rehydrated for a later validation pass

- **GIVEN** a cross-artifact rule references `specs` and `verify`
- **AND** `specs` was validated successfully in an earlier invocation and is already `complete`
- **AND** the current invocation validates `verify`
- **AND** `verify` becomes locally valid in that invocation
- **WHEN** `ValidateArtifacts.execute` evaluates the rule
- **THEN** it reloads and rehydrates the `specs` participant from its expected artifact content
- **AND** it evaluates the relational rule instead of deferring solely because `specs` was not parsed in the current invocation

#### Scenario: Missing ready participant defers cross-artifact validation

- **GIVEN** a cross-artifact rule references `specs` and `verify`
- **AND** `verify` is locally valid
- **AND** `specs` is missing, still locally invalid, or cannot be rehydrated from complete state
- **WHEN** `ValidateArtifacts.execute` runs
- **THEN** the relational rule is deferred
- **AND** the result includes a non-failing warning explaining why it was deferred

#### Scenario: Ordered subset preserves relative order

- **GIVEN** a cross-artifact rule with `kind: subset` and `options.ordering: strict`
- **AND** participant `A` yields keys `[a, c]`
- **AND** participant `B` yields keys `[a, b, c]`
- **WHEN** `ValidateArtifacts.execute` evaluates the rule
- **THEN** the rule passes because `A` appears as an order-preserving subsequence of `B`

### Requirement: MetadataExtraction validation

#### Scenario: Metadata validation uses shared transform registry and origin context

- **GIVEN** the schema declares a metadata extractor with `transform: resolveSpecPath`
- **AND** the artifact being validated has origin context for that transform
- **WHEN** `ValidateArtifacts.execute` performs metadataExtraction validation
- **THEN** it calls the extraction engine with the shared extractor-transform registry and the artifact origin context bag

#### Scenario: Unknown transform causes validation failure

- **GIVEN** the schema declares a transform name that is not registered
- **WHEN** `ValidateArtifacts.execute` performs metadataExtraction validation
- **THEN** the artifact records a validation failure instead of ignoring the transform

### Requirement: Hash computation and markComplete

#### Scenario: All validations pass — markComplete sets complete state

- **GIVEN** all validations pass for a file within artifact `specs`
- **WHEN** `ValidateArtifacts.execute` marks that file complete
- **THEN** the file state becomes `complete`
- **AND** the parent artifact state is recomputed

#### Scenario: Validation failure preserves non-complete state

- **GIVEN** a file currently in `pending-review`
- **AND** at least one required validation rule fails
- **WHEN** `ValidateArtifacts.execute` runs
- **THEN** `markComplete` is not called
- **AND** the file does not become `complete`

### Requirement: Result shape

#### Scenario: passed is false when any required artifact is missing

- **WHEN** at least one non-optional artifact is `missing`
- **THEN** `result.passed` is `false`

#### Scenario: passed is true when all pass

- **WHEN** all non-optional artifacts are present and all validations pass
- **THEN** `result.passed` is `true` and `result.failures` is empty

#### Scenario: deferred cross-artifact rule is reported as warning

- **GIVEN** a cross-artifact rule cannot run because one participant is not yet locally valid
- **WHEN** `ValidateArtifacts.execute` returns
- **THEN** `result.warnings` includes a non-failing deferred validation notice

#### Scenario: files list reports the expected validated filename

- **GIVEN** validation succeeds for existing spec `core:config` with delta file `deltas/core/core/config/spec.md.delta.yaml`
- **WHEN** `ValidateArtifacts.execute` returns
- **THEN** `result.files` contains an entry with `filename: "deltas/core/core/config/spec.md.delta.yaml"`
- **AND** that entry status indicates the file was validated

#### Scenario: files list reports the expected missing filename

- **GIVEN** validation fails because `deltas/core/core/config/spec.md.delta.yaml` is missing
- **WHEN** `ValidateArtifacts.execute` returns
- **THEN** `result.files` contains an entry with `filename: "deltas/core/core/config/spec.md.delta.yaml"`
- **AND** that entry status indicates the file is missing

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

### Requirement: Delta eligibility uses artifact-level base existence

#### Scenario: Existing spec with missing verify base rejects verify delta

- **GIVEN** a spec already exists in the repository because `spec.md` is present
- **AND** `verify.md` does not exist for that spec in the repository
- **AND** the change tracks `verify` as a delta-backed artifact
- **WHEN** `ValidateArtifacts.execute` validates that `verify` artifact
- **THEN** validation fails because the base artifact for `verify.md` is missing
- **AND** spec-level existence does not make the delta eligible

#### Scenario: Delta remains eligible when the artifact base exists

- **GIVEN** a delta-backed artifact whose exact target file already exists in the repository
- **WHEN** `ValidateArtifacts.execute` validates the artifact
- **THEN** delta eligibility is satisfied for that artifact file

### Requirement: Invalid mixed representation for new specs

#### Scenario: New spec with direct spec and delta verify fails validation

- **GIVEN** a change introduces a new spec capability
- **AND** `spec.md` is tracked as a direct file under `specs/...`
- **AND** `verify.md` is tracked as a delta under `deltas/...`
- **AND** there is no repository base `verify.md` for that capability
- **WHEN** `ValidateArtifacts.execute` validates the change
- **THEN** validation fails before archive is attempted

#### Scenario: Invalid mixed representation reports the tracked expected filename

- **GIVEN** validation rejects a new-spec artifact because its tracked representation requires a missing base file
- **WHEN** `ValidateArtifacts.execute` returns the failure
- **THEN** the reported file entry names the tracked expected filename for that artifact
- **AND** it does not report an arbitrary alternate path as accepted input

### Requirement: Ports and constructor

#### Scenario: ValidateArtifacts is constructed with LifecycleEngine

- **WHEN** `ValidateArtifacts` is assembled
- **THEN** the constructor receives a `LifecycleEngine` dependency

#### Scenario: ValidateArtifacts is constructed with extractor runtime wiring

- **GIVEN** the validation workflow is composed for runtime use
- **WHEN** `ValidateArtifacts` is instantiated
- **THEN** the constructor receives `ArtifactParserRegistry`
- **AND** the constructor receives `ExtractorTransformRegistry`
- **AND** the constructor receives `SpecWorkspaceRoute[]`
- **AND** those dependencies are used when validating extracted metadata from merged artifact content

### Requirement: Input

#### Scenario: Change-scoped validation does not require specPath

- **GIVEN** a change-scoped artifact such as `design`
- **WHEN** `ValidateArtifacts.execute` is called for that artifact
- **THEN** `specPath` is optional

#### Scenario: Change-scoped validation without specPath

- **GIVEN** a change with `scope: change` artifact `proposal` and at least one `specId`
- **WHEN** `ValidateArtifacts` is invoked with `artifactId: proposal` and no `specPath`
- **THEN** validation runs for the proposal artifact files
- **AND** no `SpecNotInChangeError` is thrown solely because `specPath` was omitted

### Requirement: Schema name guard

#### Scenario: Schema mismatch throws before validation

- **GIVEN** the change was created under a different schema name
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** it throws `SchemaMismatchError` before validating artifacts

### Requirement: MetadataExtraction validation failures are validation failures

#### Scenario: Invalid extracted metadata prevents completion

- **GIVEN** metadata extraction succeeds but its result fails schema validation
- **WHEN** `ValidateArtifacts.execute` processes the artifact
- **THEN** a validation failure is recorded
- **AND** the artifact is not marked complete

#### Scenario: Validating one spec does not fail on missing artifacts from other specs

- **GIVEN** a change with two specs: `specA` and `specB`
- **AND** `specA` has all its artifact files present
- **AND** `specB` does not have its artifact files yet (not yet created)
- **WHEN** `ValidateArtifacts.execute` is called with `specPath: 'specA'`
- **THEN** only `specA`'s artifacts are validated
- **AND** missing artifacts from `specB` do NOT cause validation failure
- **AND** `result.passed` is `true` if `specA`'s artifacts pass validation

#### Scenario: Only the specified artifact is validated

- **GIVEN** the schema has artifacts `proposal`, `specs`, and `verify`
- **AND** `artifactId` is `"specs"`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** only `specs` goes through dependency check, delta validation, structural validation, and hash computation
- **AND** `proposal` and `verify` are not checked, not reported as missing, and not included in the result

#### Scenario: Dependency order still applies to the specified artifact

- **GIVEN** `artifactId` is `"specs"` and artifact `specs` requires `proposal`
- **AND** `LifecycleEngine` reports `proposal` as not `complete` or `skipped`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `specs` is reported as dependency-blocked and `markComplete` is not called

#### Scenario: Specified artifact with satisfied dependencies proceeds normally

- **GIVEN** `artifactId` is `"specs"` and artifact `specs` requires `proposal`
- **AND** `LifecycleEngine` reports `proposal` as `complete`
- **WHEN** `ValidateArtifacts.execute` is called
- **THEN** `specs` is validated normally and `markComplete` is called if all validations pass

#### Scenario: Transformed dependsOn values are persisted on the change

- **GIVEN** a validated `scope: spec` artifact whose metadata extraction declares `transform: resolveSpecPath`
- **AND** extraction against the validated content returns canonical spec IDs
- **WHEN** `ValidateArtifacts.execute` completes successfully
- **THEN** `change.setSpecDependsOn(specId, deps)` is called with those already-transformed spec IDs
- **AND** no separate `SpecRepository.resolveFromPath(...)` repair step is run afterward

#### Scenario: Transform failure blocks dependsOn extraction persistence

- **GIVEN** a declared transform throws because required origin context is absent
- **WHEN** `ValidateArtifacts.execute` attempts automatic dependsOn extraction
- **THEN** validation fails for the artifact
- **AND** dependency updates are not persisted for that artifact

#### Scenario: Found dependency values may not be silently discarded by transform execution

- **GIVEN** extraction finds dependency values in the validated artifact content
- **AND** the configured transform receives those values but cannot normalize them
- **WHEN** `ValidateArtifacts.execute` completes dependency extraction
- **THEN** validation fails for the artifact instead of treating `dependsOn` as absent

### Requirement: In-change dependsOn persistence

#### Scenario: Successful extraction updates change dependency snapshot

- **GIVEN** a validated `scope: spec` artifact yields canonical `dependsOn` values from metadata extraction
- **WHEN** `ValidateArtifacts.execute` completes successfully
- **THEN** `change.setSpecDependsOn(specId, deps)` is called with that extracted value

#### Scenario: Divergence from canonical sidecar does not fail validation

- **GIVEN** the canonical persisted spec already has `spec-lock.json`
- **AND** the current change is intentionally editing dependencies for that spec
- **WHEN** `ValidateArtifacts.execute` validates the in-progress artifact successfully
- **THEN** validation passes without comparing the in-change value against the canonical sidecar as a hard error

### Requirement: Config-based factory delegates through resolveValidateArtifactsDeps

#### Scenario: createValidateArtifacts config form derives ValidateArtifactsDeps through resolveValidateArtifactsDeps

- **WHEN** `createValidateArtifacts(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `ValidateArtifactsDeps` through `resolveValidateArtifactsDeps(resolver)`
- **AND** `resolveValidateArtifactsDeps(resolver)` resolves:
- `changes: ChangeRepository`
- `listWorkspaces: ListWorkspaces`
- `schemaProvider: SchemaProvider`
- `parsers: ArtifactParserRegistry`
- `actor: ActorResolver`
- `hasher: ContentHasher`
- `extractorTransforms: ExtractorTransformRegistry`
- `workspaceRoutes: readonly SpecWorkspaceRoute[]`
- `lifecycle: LifecycleEngine`
- **AND** the factory delegates to canonical `createValidateArtifacts(deps)`
