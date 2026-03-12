# Verification: Get Spec

## Requirements

### Requirement: Resolve workspace from input

#### Scenario: Unknown workspace throws WorkspaceNotFoundError

- **WHEN** `execute({ workspace: 'nonexistent', specPath })` is called
- **THEN** a `WorkspaceNotFoundError` is thrown with message containing `'nonexistent'`

### Requirement: Load spec by path

#### Scenario: Spec not found throws SpecNotFoundError

- **GIVEN** a valid workspace `'default'` with no spec at path `auth/oauth`
- **WHEN** `execute({ workspace: 'default', specPath: SpecPath.parse('auth/oauth') })` is called
- **THEN** a `SpecNotFoundError` is thrown with message containing `'default:auth/oauth'`

### Requirement: Load all artifact files

#### Scenario: All artifacts loaded successfully

- **GIVEN** a spec with filenames `['spec.md', 'verify.md', '.specd-metadata.yaml']` and all exist on disk
- **WHEN** `execute(input)` is called
- **THEN** the result `artifacts` map contains entries for all three filenames

#### Scenario: Some artifacts missing on disk

- **GIVEN** a spec with filenames `['spec.md', 'verify.md']` where `repo.artifact` returns `null` for `verify.md`
- **WHEN** `execute(input)` is called
- **THEN** the result `artifacts` map contains only `'spec.md'`
- **AND** no error is thrown

### Requirement: Return spec and artifacts

#### Scenario: Successful retrieval returns spec entity and artifacts map

- **GIVEN** a spec exists at the requested path with two artifact files
- **WHEN** `execute(input)` is called
- **THEN** the result contains the `Spec` entity at `result.spec`
- **AND** the result contains a `Map` at `result.artifacts` keyed by filename
