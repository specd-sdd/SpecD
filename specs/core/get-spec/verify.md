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

- **GIVEN** a spec whose `artifacts` list includes `spec.md`, `verify.md`, and
  `.specd-metadata.yaml` and all exist on disk
- **WHEN** `execute(input)` is called
- **THEN** the result `artifacts` map contains entries for all three filenames

#### Scenario: Some artifacts missing on disk

- **GIVEN** a spec whose `artifacts` list includes `spec.md` and `verify.md` where
  `repo.artifact` returns `null` for `verify.md`
- **WHEN** `execute(input)` is called
- **THEN** the result `artifacts` map contains only `'spec.md'`
- **AND** no error is thrown

### Requirement: Return spec and artifacts

#### Scenario: Successful retrieval returns spec entity and artifacts map

- **GIVEN** a spec exists at the requested path with two artifact files
- **WHEN** `execute(input)` is called
- **THEN** the result contains the `Spec` entity at `result.spec`
- **AND** the result contains a `Map` at `result.artifacts` keyed by filename

### Requirement: Input shape

#### Scenario: Input contains workspace and specPath

- **WHEN** `GetSpecInput` is used
- **THEN** it contains `workspace` (string) and `specPath` (SpecPath value object)

### Requirement: Config-based factory delegates through resolveGetSpecDeps

#### Scenario: createGetSpec config form derives GetSpecDeps through resolveGetSpecDeps

- **WHEN** `createGetSpec(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `GetSpecDeps` through `resolveGetSpecDeps(resolver)`
- **AND** `resolveGetSpecDeps(resolver)` resolves:
- `specRepos: ReadonlyMap<string, SpecRepository>`
- **AND** the factory delegates to canonical `createGetSpec(deps)`
