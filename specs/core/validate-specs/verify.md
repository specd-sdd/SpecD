# Verification: Validate Specs

## Requirements

### Requirement: Resolve the active schema

#### Scenario: Schema resolution failure propagates

- **WHEN** `SchemaProvider.get()` throws `SchemaNotFoundError`
- **THEN** the error propagates — the use case does not catch it

### Requirement: Filter to spec-scoped artifact types

#### Scenario: Change-scoped artifacts excluded

- **GIVEN** a schema with both `scope: 'spec'` and `scope: 'change'` artifact types
- **WHEN** validation runs
- **THEN** only `scope: 'spec'` artifact types are checked

### Requirement: Single spec validation mode

#### Scenario: Validate a single spec by qualified path

- **GIVEN** a spec at `default:auth/login` with a required `spec.md` present
- **WHEN** `execute({ specPath: 'default:auth/login' })` is called
- **THEN** the result contains exactly one entry for `'default:auth/login'`

#### Scenario: Unknown workspace in specPath throws WorkspaceNotFoundError

- **WHEN** `execute({ specPath: 'nonexistent:auth/login' })` is called
- **THEN** a `WorkspaceNotFoundError` is thrown

#### Scenario: Spec not found throws SpecNotFoundError

- **GIVEN** workspace `'default'` exists but has no spec at `auth/login`
- **WHEN** `execute({ specPath: 'default:auth/login' })` is called
- **THEN** a `SpecNotFoundError` is thrown

### Requirement: Workspace validation mode

#### Scenario: All specs in workspace validated

- **GIVEN** workspace `'default'` contains three specs
- **WHEN** `execute({ workspace: 'default' })` is called
- **THEN** the result contains three entries

#### Scenario: Unknown workspace throws WorkspaceNotFoundError

- **WHEN** `execute({ workspace: 'nonexistent' })` is called
- **THEN** a `WorkspaceNotFoundError` is thrown

### Requirement: All-workspaces validation mode

#### Scenario: All specs across all workspaces validated

- **GIVEN** two workspaces with two specs each
- **WHEN** `execute({})` is called
- **THEN** the result contains four entries

### Requirement: Per-spec artifact validation

#### Scenario: Missing required artifact recorded as failure

- **GIVEN** a spec-scoped artifact type `spec.md` that is not optional, and the spec has no `spec.md`
- **WHEN** validation runs for that spec
- **THEN** a `ValidationFailure` is recorded with `artifactId` matching the artifact type and a description indicating the artifact is missing

#### Scenario: Missing optional artifact skipped silently

- **GIVEN** an optional spec-scoped artifact type, and the spec does not have that file
- **WHEN** validation runs for that spec
- **THEN** no failure or warning is recorded for that artifact

#### Scenario: Artifact with no validation rules skipped

- **GIVEN** a spec-scoped artifact type with an empty `validations` array, and the file exists
- **WHEN** validation runs for that spec
- **THEN** no failure or warning is recorded for that artifact

#### Scenario: Artifact with no local rules is still parsed for cross-artifact validation

- **GIVEN** a spec-scoped artifact file has no local `validations`
- **AND** a schema `crossArtifactValidations` rule references that artifact
- **WHEN** `ValidateSpecs` validates the spec
- **THEN** the artifact is parsed so it can participate in the cross-artifact rule

#### Scenario: Validation rules evaluated against parsed AST

- **GIVEN** a spec-scoped artifact type with validation rules, and the file exists and parses successfully
- **WHEN** validation runs
- **THEN** `evaluateRules` results are included in the entry's `failures` and `warnings`

### Requirement: Per-spec cross-artifact validation

#### Scenario: Cross-artifact mismatch becomes a spec failure

- **GIVEN** `spec.md` and `verify.md` for one spec both parse successfully
- **AND** a schema `crossArtifactValidations` rule requires `all-equal` requirement IDs between them
- **WHEN** `ValidateSpecs` evaluates that spec
- **THEN** any key mismatch is recorded as a `ValidationFailure` on that spec entry

#### Scenario: Deferred rule is surfaced when a participant is not locally valid

- **GIVEN** one participant artifact for the spec failed local validation
- **WHEN** `ValidateSpecs` evaluates a cross-artifact rule that needs that participant
- **THEN** the rule is deferred
- **AND** the spec entry includes a non-failing warning explaining the deferral

#### Scenario: ValidateSpecs reuses ValidateArtifacts cross-artifact semantics

- **GIVEN** a cross-artifact rule using `keySelector`, `subset`, and `options.ordering: strict`
- **WHEN** the same spec content is evaluated through `ValidateArtifacts` and `ValidateSpecs`
- **THEN** both use cases apply the same participant key extraction and relation semantics

### Requirement: Aggregated result

#### Scenario: Counts reflect validation outcomes

- **GIVEN** three specs validated where two pass and one fails
- **WHEN** the result is returned
- **THEN** `totalSpecs` is `3`, `passed` is `2`, `failed` is `1`

#### Scenario: Cross-artifact failures and deferred warnings are aggregated per spec

- **GIVEN** one spec has a cross-artifact mismatch
- **AND** another spec has a deferred cross-artifact rule because one participant is invalid
- **WHEN** `ValidateSpecs` returns its result
- **THEN** the first spec entry includes the relational failure
- **AND** the second spec entry includes the deferred warning

### Requirement: Format inference and parser resolution

#### Scenario: Format inferred from filename when not explicit

- **GIVEN** an artifact type with no explicit `format` and filename `spec.md`
- **WHEN** validation runs
- **THEN** the format is inferred as markdown and the corresponding parser is used

#### Scenario: No parser available skips artifact silently

- **GIVEN** an artifact type whose inferred format has no registered parser
- **WHEN** validation runs
- **THEN** no failure or warning is recorded for that artifact

### Requirement: Canonical metadata consistency validation

#### Scenario: Stale metadata hash becomes a validation failure

- **GIVEN** a spec has `metadata.json`
- **AND** its recorded `contentHashes` do not match the current required artifacts
- **WHEN** `ValidateSpecs` validates that spec
- **THEN** the spec entry includes a `ValidationFailure` instructing the caller to regenerate metadata

#### Scenario: Repository stale classification becomes a validation failure

- **GIVEN** `SpecRepository.metadata()` returns persisted metadata with `freshness: 'stale'`
- **WHEN** `ValidateSpecs` validates that spec
- **THEN** the spec entry includes a `ValidationFailure` for stale canonical metadata

#### Scenario: Metadata dependsOn projection drift becomes a validation failure

- **GIVEN** `metadata.json.dependsOn` differs from `SpecRepository.readPersistedDependsOn(spec)`
- **WHEN** `ValidateSpecs` validates that spec
- **THEN** the spec entry includes a `ValidationFailure` describing the canonical dependency projection mismatch

#### Scenario: Extracted dependsOn mismatch becomes a validation failure

- **GIVEN** the schema declares `metadataExtraction.dependsOn`
- **AND** extraction yields a dependency set different from the persisted dependency state
- **WHEN** `ValidateSpecs` validates that spec
- **THEN** the spec entry includes a `ValidationFailure`

#### Scenario: Persisted dependency projection remains valid without extraction

- **GIVEN** the schema omits `metadataExtraction.dependsOn`
- **AND** `metadata.json.dependsOn` matches the persisted dependency state
- **WHEN** `ValidateSpecs` validates that spec
- **THEN** no dependency-projection failure is recorded for that check
