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

#### Scenario: Incremental dependency cache persistence

- **GIVEN** a multi-spec dependency deduction across multiple spec IDs or a workspace
- **WHEN** dependency suggestions for each target specification complete
- **THEN** `specDepsCache.flush()` is invoked incrementally so deduced dependencies are persisted immediately to disk
- **AND** aborted or interrupted runs retain the already-persisted dependencies

#### Scenario: Cache version mismatch triggers automatic regeneration

- **GIVEN** a persisted cache file with header `cacheVersion: "1.0.0"`
- **WHEN** `SuggestSpecDependencies.execute({ specId: "core:spec-repository-port" })` is called
- **THEN** it detects cache version mismatch against active `SPEC_DEPS_CACHE_VERSION` (`1.1.0`)
- **AND** invalidates the old cache file, regenerating fresh suggestions

#### Scenario: Imported file ownership change invalidates cached suggestions

- **GIVEN** a cached deps entry whose suggestions were computed when an imported file mapped to spec A
- **WHEN** the global implementation file-to-spec map changes so the same file now maps to spec B, and `SuggestSpecDependencies.execute({ specId })` runs again without `rebuildCache`
- **THEN** the stored `fileToSpecFingerprint` mismatches the recomputed fingerprint
- **AND** the cached entry is discarded and suggestions are recomputed, suggesting spec B instead of spec A

#### Scenario: Canonical validation entries create one alignment change

- **GIVEN** `SuggestSpecDependencies.execute({ specId: "cli:change-implementation", apply: true, createAlignmentChange: true })` is executed
- **WHEN** `ValidateSpecs` returns `{ failed: 2, entries: [{ spec, passed: false, failures, warnings }, ...] }`
- **THEN** an alignment change `align-spec-deps-<timestamp>` is created
- **AND** `CreateChange.execute` receives the exact schema failure descriptions `[artifactId: description]` as `explorationContent`
- **AND** the application use case never reads a nonexistent `issues` field or performs a direct filesystem write

#### Scenario: Missing dependencies fail before mutation

- **GIVEN** `apply: true` without a `ValidateSpecs` dependency, or `createAlignmentChange: true` without a `CreateChange` dependency
- **WHEN** `execute` is called
- **THEN** it throws `InvalidInputError`
- **AND** `UpdatePersistedSpecDeps` is not called

#### Scenario: Validator failure remains observable

- **GIVEN** `ValidateSpecs.execute` throws after dependencies are applied
- **WHEN** `SuggestSpecDependencies.execute` handles post-apply validation
- **THEN** the validator error is propagated or represented by an explicit failure result
- **AND** it is never reported as `{ status: "all-valid", invalidSpecs: [] }`

#### Scenario: No change creation when all specs are valid

- **GIVEN** post-apply validation returns `status: "all-valid"`
- **WHEN** `SuggestSpecDependencies.execute({ specId: "cli:change-implementation", apply: true, createAlignmentChange: true })` completes
- **THEN** no alignment change is created

### Requirement: Modular Transitive Reduction & Invariant Graph Engine

#### Scenario: Transitive reduction prunes indirect dependency paths

- **GIVEN** Spec $A$ depending on $B$ and $C$, where $B$ depends directly on $C$
- **WHEN** `TransitiveReductionEngine.reduce()` executes
- **THEN** $C$ is pruned from $A$'s direct dependencies, yielding $A \rightarrow B \rightarrow C$.

#### Scenario: Cyclic dependencies in call graphs are handled without infinite loops

- **GIVEN** A cyclic call relationship between specs $X$ and $Y$
- **WHEN** Transitive reduction evaluates the graph
- **THEN** The cycle is detected and handled safely without terminating in an infinite loop.

### Requirement: Early Graph Staleness Diagnostics

#### Scenario: Early graph staleness detection and result annotation

- **GIVEN** A code graph provider whose graph index is stale
- **WHEN** `SuggestSpecDependencies.execute()` is invoked
- **THEN** It emits a `stale-warning` progress event and returns `codeGraphStale: true` in the result payload.

### Requirement: Multi-Process Cache Locking and Flush Merging

#### Scenario: Concurrent writes from separate processes merge without data loss

- **GIVEN** Multiple cache instances performing concurrent writes to the spec dependencies cache
- **WHEN** Each instance executes `flush()` under exclusive kernel-level file lock
- **THEN** All written dependency entries are preserved in the persisted cache file on disk without overwriting concurrent updates.

#### Scenario: Cache lock contention timeout throws CacheLockError

- **GIVEN** A lock file held exclusively by another active process exceeding the timeout
- **WHEN** An operation attempts to acquire the cache lock
- **THEN** It throws a typed `CacheLockError` with error code `CACHE_LOCKED`.

### Requirement: Dependency-injected factory

#### Scenario: Canonical factory accepts resolved dependencies

- **GIVEN** a complete `SuggestSpecDependenciesDeps` object
- **WHEN** `createSuggestSpecDependencies(deps)` is called
- **THEN** it returns a wired `SuggestSpecDependencies` instance without constructing filesystem adapters

#### Scenario: Progress callback events emission

- **GIVEN** an `onProgress` callback passed to `SuggestSpecDependencies.execute`
- **WHEN** `execute({ specId: "cli:spec-deps", onProgress })` executes
- **THEN** `onProgress` receives sequential `warmup-start`, `warmup-done`, `start`, `spec-start`, `spec-done`, and `done` events
