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

#### Scenario: Validation rules evaluated against parsed AST

- **GIVEN** a spec-scoped artifact type with validation rules, and the file exists and parses successfully
- **WHEN** validation runs
- **THEN** `evaluateRules` results are included in the entry's `failures` and `warnings`

### Requirement: Aggregated result

#### Scenario: Counts reflect validation outcomes

- **GIVEN** three specs validated where two pass and one fails
- **WHEN** the result is returned
- **THEN** `totalSpecs` is `3`, `passed` is `2`, `failed` is `1`

### Requirement: Format inference and parser resolution

#### Scenario: Format inferred from filename when not explicit

- **GIVEN** an artifact type with no explicit `format` and filename `spec.md`
- **WHEN** validation runs
- **THEN** the format is inferred as markdown and the corresponding parser is used

#### Scenario: No parser available skips artifact silently

- **GIVEN** an artifact type whose inferred format has no registered parser
- **WHEN** validation runs
- **THEN** no failure or warning is recorded for that artifact
