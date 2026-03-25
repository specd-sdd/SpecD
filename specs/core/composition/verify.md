# Verification: Composition Layer

## Requirements

### Requirement: Use-case factories are the unit of composition

#### Scenario: Use case constructed via factory

- **WHEN** a caller imports `createArchiveChange` from `@specd/core`
- **THEN** calling it returns an `ArchiveChange` instance ready to execute
- **AND** no port constructor (`FsChangeRepository`, `NodeHookRunner`, etc.) is imported by the caller

#### Scenario: Use case constructors not exported

- **WHEN** a caller attempts to import `ArchiveChange` class constructor from `@specd/core`
- **THEN** the import is not available — `ArchiveChange` is not a named export of `index.ts`

### Requirement: Use-case factories accept SpecdConfig or explicit options

#### Scenario: Factory called with SpecdConfig

- **WHEN** `createArchiveChange(config)` is called with a valid `SpecdConfig`
- **THEN** it returns a pre-wired `ArchiveChange` with all ports constructed from the config values

#### Scenario: Factory called with explicit context and options

- **WHEN** `createArchiveChange(context, options)` is called with an explicit context and options object
- **THEN** it returns a pre-wired `ArchiveChange` using those values directly

### Requirement: Internal ports are never exported

#### Scenario: NodeHookRunner not in public exports

- **WHEN** the public export surface of `@specd/core` is inspected
- **THEN** `NodeHookRunner`, `GitVcsAdapter`, and `FsFileReader` are not present

#### Scenario: Repository factories not in public exports

- **WHEN** the public export surface of `@specd/core` is inspected
- **THEN** `createSpecRepository`, `createChangeRepository`, and `createArchiveRepository` are not present

### Requirement: Use-case factories must use auto-detect for VCS-dependent adapters

#### Scenario: Standalone factory uses auto-detect for actor resolution

- **WHEN** any standalone use-case factory in `composition/use-cases/` constructs an `ActorResolver`
- **THEN** it calls `createVcsActorResolver()` instead of `new GitActorResolver()`

#### Scenario: No hardcoded VCS imports in standalone factories

- **WHEN** inspecting the import statements of all files in `composition/use-cases/`
- **THEN** none import `GitActorResolver`, `HgActorResolver`, `SvnActorResolver`, or `NullActorResolver` directly
- **AND** all import `createVcsActorResolver` from the composition layer instead

### Requirement: Kernel builds all use cases from SpecdConfig

#### Scenario: Kernel returns grouped use cases

- **WHEN** `createKernel(config)` is called with a valid `SpecdConfig`
- **THEN** the returned object exposes use cases grouped under domain-area namespaces
- **AND** each use case is ready to execute without further configuration

#### Scenario: Kernel is not the mandatory entry point

- **WHEN** a caller needs only `CreateChange`
- **THEN** calling `createCreateChange(config)` directly returns a ready use case without requiring the full kernel

### Requirement: ConfigLoader is an application port

#### Scenario: FsConfigLoader reads specd.yaml

- **WHEN** `FsConfigLoader.load()` is called in a directory containing `specd.yaml`
- **THEN** it returns a `SpecdConfig` object with values from that file

#### Scenario: specd.local.yaml overrides specd.yaml

- **WHEN** both `specd.yaml` and `specd.local.yaml` are present
- **THEN** values in `specd.local.yaml` take precedence over values in `specd.yaml`

### Requirement: SpecdConfig is a plain typed object

#### Scenario: SpecdConfig has no methods

- **WHEN** the `SpecdConfig` type is inspected
- **THEN** it contains only readonly properties — no methods, no class instances
