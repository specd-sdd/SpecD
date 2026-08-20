# Verification: sdk:suggest-spec-dependencies

## Requirements

### Requirement: Use Case Interface

#### Scenario: Suggest spec dependencies from code imports

- **GIVEN** `cli:change-implementation` imports source files owned by `core:update-implementation-tracking`
- **WHEN** `SuggestSpecDependencies.execute({ specId: "cli:change-implementation" })` is called
- **THEN** `suggestedDependsOn` includes `core:update-implementation-tracking` with reason referencing the import path

### Requirement: Input Validation & Error Handling

#### Scenario: Missing target options throws InvalidInputError

- **GIVEN** an empty input object `{}` with no targeting criteria
- **WHEN** `SuggestSpecDependencies.execute({})` is called
- **THEN** it throws `InvalidInputError` (instance of `SpecdError`)

#### Scenario: Non-existent workspace throws WorkspaceNotFoundError

- **GIVEN** a workspace `nonexistent-ws` that is not configured in `specRepositories`
- **WHEN** `SuggestSpecDependencies.execute({ workspace: "nonexistent-ws" })` is called
- **THEN** it throws `WorkspaceNotFoundError` (instance of `SpecdError`)

#### Scenario: Non-existent spec ID error

- **GIVEN** a spec ID `default:non-existent-spec` that does not exist in any spec repository
- **WHEN** `SuggestSpecDependencies.execute({ specId: "default:non-existent-spec" })` is called
- **THEN** it throws a `SpecNotFoundError` for `default:non-existent-spec` (instance of `SpecdError`)

### Requirement: Cache Warm-up & 2-Pass Dependency Deduction

#### Scenario: Directional validation pass prunes inverted dependency suggestions

- **GIVEN** target port spec `core:spec-repository-port` whose files are imported by adapter `core:fs-spec-repository`
- **AND** `core:spec-repository-port` implementation files do not import adapter files
- **WHEN** `SuggestSpecDependencies.execute({ specId: "core:spec-repository-port" })` is called
- **THEN** `core:fs-spec-repository` is pruned from `suggestedDependsOn`

#### Scenario: Transitive reduction prunes redundant recommendations

- **GIVEN** target spec `core:fs-spec-repository` imports `core:spec-repository-port`
- **AND** `core:spec-repository-port` directly depends on `core:repository-port`
- **WHEN** `SuggestSpecDependencies.execute({ specId: "core:fs-spec-repository" })` is called
- **THEN** `core:repository-port` is pruned from `suggestedDependsOn` because `core:spec-repository-port` is the primary spec in the recommendation chain

#### Scenario: Cache version mismatch triggers automatic regeneration

- **GIVEN** a persisted cache file with header `cacheVersion: "1.0.0"`
- **WHEN** `SuggestSpecDependencies.execute({ specId: "core:spec-repository-port" })` is called
- **THEN** it detects cache version mismatch against active `SPEC_DEPS_CACHE_VERSION` (`1.1.0`)
- **AND** invalidates the old cache file, regenerating fresh suggestions

#### Scenario: Post-apply validation and conditional alignment change creation

- **GIVEN** `SuggestSpecDependencies.execute({ specId: "cli:change-implementation", apply: true, createAlignmentChange: true })` is executed
- **WHEN** post-apply validation via `ValidateSpecs` returns `status: "invalid-specs-detected"`
- **THEN** an alignment change `align-spec-deps-<timestamp>` is created
- **AND** its `.specd-exploration.md` contains the exact schema failure descriptions `[artifactId: description]`

#### Scenario: No change creation when all specs are valid

- **GIVEN** post-apply validation returns `status: "all-valid"`
- **WHEN** `SuggestSpecDependencies.execute({ specId: "cli:change-implementation", apply: true, createAlignmentChange: true })` completes
- **THEN** no alignment change is created

### Requirement: Standard Factory & Composition Overloads

#### Scenario: Config-based factory resolution

- **GIVEN** a resolved `SpecdConfig` instance
- **WHEN** `createSuggestSpecDependencies(config)` is called
- **THEN** it resolves all dependencies via `resolveSuggestSpecDependenciesDeps` and returns a wired `SuggestSpecDependencies` instance

#### Scenario: Progress callback events emission

- **GIVEN** an `onProgress` callback passed to `SuggestSpecDependencies.execute`
- **WHEN** `execute({ specId: "cli:spec-deps", onProgress })` executes
- **THEN** `onProgress` receives sequential `warmup-start`, `warmup-done`, `start`, `spec-start`, `spec-done`, and `done` events
