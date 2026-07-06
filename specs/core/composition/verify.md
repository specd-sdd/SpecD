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

#### Scenario: Canonical deps form constructs one use case from resolved dependencies

- **WHEN** a caller invokes a kernel-mounted public `createX(deps)` factory
- **THEN** the factory accepts already-resolved dependencies only
- **AND** it does not require filesystem paths or adapter ids

#### Scenario: Config-based form delegates through resolver-backed assembly

- **WHEN** a caller invokes `createX(config, options?)`
- **THEN** the factory creates a composition resolver scoped to that composition session
- **AND** it resolves `XDeps` through the shared resolver path before delegating to canonical deps construction

#### Scenario: Invalid deps-plus-options input throws shared error

- **WHEN** a caller supplies a deps-form invocation plus composition options
- **THEN** the factory path throws `InvalidCompositionFactoryArgumentsError`
- **AND** the error identifies the target `createX(...)` factory

### Requirement: Shared composition resolver normalizes config-based factory bootstrap

#### Scenario: Config-based public factory delegates through resolver path

- **WHEN** `createX(config, options?)` is invoked
- **THEN** the factory creates a resolver, derives `XDeps`, and delegates to canonical `createX(deps)`

### Requirement: Reusable registry primitives are composition-owned

#### Scenario: Kernel does not remain the owner of generic registry semantics

- **WHEN** public factory bootstrap, kernel assembly, and builder assembly reuse the same merged capability model
- **THEN** that model is defined as composition infrastructure
- **AND** the kernel remains a facade over it rather than a second source of truth

### Requirement: Shared factory-argument validation error

#### Scenario: Invalid deps-plus-options combination throws shared error

- **WHEN** a public factory receives deps together with composition options
- **THEN** it throws `InvalidCompositionFactoryArgumentsError`
- **AND** the error identifies the target factory or use-case name

### Requirement: Internal ports are never exported

#### Scenario: NodeHookRunner not in public exports

- **WHEN** the public export surface of `@specd/core` is inspected
- **THEN** `NodeHookRunner`, `GitVcsAdapter`, and `FsFileReader` are not present

#### Scenario: Repository factories on public root return port types only

- **WHEN** the public export surface of `@specd/core` is inspected
- **THEN** `createSpecRepository`, `createChangeRepository`, and `createArchiveRepository` are present
- **AND** they return port contracts rather than concrete adapter classes

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

#### Scenario: CLI and MCP declare SDK as platform dependency

- **WHEN** `@specd/cli` or `@specd/mcp` package dependencies are inspected
- **THEN** `@specd/sdk` is the sole direct workspace dependency on specd platform packages
- **AND** host bootstrap flows through `@specd/sdk`

### Requirement: Public barrel entry points

#### Scenario: package.json exports map public and internal

- **WHEN** `packages/core/package.json` `exports` is inspected
- **THEN** `"."`, `"./ports"`, `"./extensions"`, and `"./internal"` entry points exist

#### Scenario: Public root exports createArchiveChange factory

- **WHEN** importing from `@specd/core` `"."`
- **THEN** `createArchiveChange` is available at compile time

#### Scenario: Public root exports createSpecRepository factory

- **WHEN** importing from `@specd/core` `"."`
- **THEN** `createSpecRepository` is available at compile time

#### Scenario: Public root does not export FsSpecRepository class

- **WHEN** importing from `@specd/core` `"."`
- **THEN** `FsSpecRepository` is not available at compile time

### Requirement: Kernel-mounted use case surface

#### Scenario: GetStatus types and factory exported from public root

- **WHEN** importing from `@specd/core` `"."`
- **THEN** `GetStatus`, `GetStatusInput`, `GetStatusResult`, and `createGetStatus` are available

#### Scenario: Use case callable without kernel via factory

- **GIVEN** a loaded `SpecdConfig`
- **WHEN** `createGetStatus(config).execute({ name })` is called
- **THEN** a `GetStatusResult` is returned without calling `createKernel`

### Requirement: Repository factories on public root

#### Scenario: Default spec repository without kernel

- **GIVEN** a loaded `SpecdConfig` and workspace context
- **WHEN** `createSpecRepository('fs', context, options)` is called from `@specd/core` `"."`
- **THEN** a `SpecRepository` is returned without calling `createKernel`

### Requirement: Extension registration surface

#### Scenario: ChangeStorageFactory exported from extensions subpath

- **WHEN** importing from `@specd/core/extensions`
- **THEN** `ChangeStorageFactory`, `CompositionRegistryInput`, `CompositionRegistryView`, and `createKernelBuilder` are available

#### Scenario: Core extensions surface does not export graph-store registration types

- **WHEN** importing from `@specd/core/extensions`
- **THEN** graph-store-specific extension hooks are not part of the core extensions surface

#### Scenario: Builtin FS storage factory markers stay internal

- **WHEN** importing from `@specd/core/internal`
- **THEN** builtin `FS_*` storage factory markers are not required on `"."` or `"./extensions"`
- **AND** `FS_CHANGE_STORAGE_FACTORY` is not exported from `"."`
