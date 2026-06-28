# Verification: Composition Layer

## Requirements

### Requirement: Use-case factories are the unit of composition

#### Scenario: Use case constructed via factory

- **WHEN** `createArchiveChange(config)` is called
- **THEN** it returns a pre-wired `ArchiveChange` instance with all ports constructed internally

#### Scenario: Use case constructors not exported

- **WHEN** `@specd/core` public exports are inspected
- **THEN** use case class constructors are not among them — only factory functions

#### Scenario: Config I/O factories return ports directly

- **WHEN** `createConfigLoader()` or `createConfigWriter()` is called
- **THEN** each returns a port instance (`ConfigLoader` or `ConfigWriter`)
- **AND** neither wraps the port in a pass-through use-case class

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

#### Scenario: Approval gate use cases are grouped under changes

- **WHEN** `createKernel(config)` is called with a valid `SpecdConfig`
- **THEN** `kernel.changes.approveSpec` and `kernel.changes.approveSignoff` are defined
- **AND** `kernel.specs.approveSpec` and `kernel.specs.approveSignoff` are not defined

### Requirement: Composition layer exposes a kernel builder

#### Scenario: Builder is a public alternative to createKernel

- **WHEN** the public composition exports are inspected
- **THEN** a fluent kernel builder entry point is available alongside `createKernel`
- **AND** using it remains within the composition layer's public surface

#### Scenario: Builder preserves createKernel semantics

- **GIVEN** the same resolved config and the same additive registrations
- **WHEN** a kernel is built through the builder and through `createKernel(config, options)`
- **THEN** both kernels expose the same merged capability set
- **AND** both preserve the same use-case wiring semantics

### Requirement: ConfigLoader is an application port

#### Scenario: FsConfigLoader reads specd.yaml

- **WHEN** `FsConfigLoader.load()` is called in a directory containing `specd.yaml`
- **THEN** it returns a `SpecdConfig` object with values from that file

#### Scenario: specd.local.yaml overrides specd.yaml

- **WHEN** both `specd.yaml` and `specd.local.yaml` are present
- **THEN** values in `specd.local.yaml` take precedence over values in `specd.yaml`

### Requirement: ConfigWriter is an application port

#### Scenario: createConfigWriter returns FsConfigWriter by default

- **WHEN** `createConfigWriter()` is called without options
- **THEN** it returns a `ConfigWriter` instance that can call `initProject`, `addPlugin`, and `removePlugin`

#### Scenario: createConfigWriter accepts injected writer for tests

- **GIVEN** a mock `ConfigWriter` passed via options
- **WHEN** `createConfigWriter({ configWriter: mock })` is called
- **THEN** the returned instance is the mock

### Requirement: Config mutation is not wired into createKernel

#### Scenario: Kernel does not expose config writer

- **WHEN** `createKernel(config)` is called with a valid `SpecdConfig`
- **THEN** the returned kernel has no `configWriter` property
- **AND** `kernel.project` has no `init`, `addPlugin`, or `removePlugin` entries

### Requirement: SpecdConfig is a plain typed object

#### Scenario: SpecdConfig has no methods

- **WHEN** the `SpecdConfig` type is inspected
- **THEN** it contains only readonly properties — no methods, no class instances

### Requirement: FsChangeRepository options include artifact type resolution

#### Scenario: artifactTypes option passed to FsChangeRepository

- **GIVEN** `FsChangeRepositoryOptions` with `artifactTypes` populated
- **WHEN** `FsChangeRepository` is constructed with these options
- **THEN** it uses the provided artifact types for syncArtifacts

#### Scenario: resolveArtifactTypes lazy resolution

- **GIVEN** `FsChangeRepositoryOptions` with `resolveArtifactTypes` function
- **WHEN** `FsChangeRepository` performs first artifact sync
- **THEN** the artifact types are resolved lazily and cached

### Requirement: ResolveSchema factory wiring

#### Scenario: ResolveSchema factory is wired in kernel

- **WHEN** `createKernel` is called
- **THEN** `ResolveSchema` use case is available via `kernel.specs.resolve`

### Requirement: @specd/sdk orchestrates cross-package host bootstrap

#### Scenario: SDK package exists for host bootstrap

- **WHEN** a delivery host needs config, kernel, and graph provider wiring
- **THEN** `@specd/sdk` provides `openSpecdHost` and `createSdkContext` as the documented entry points
