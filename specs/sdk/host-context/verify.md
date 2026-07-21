# Verification: SDK Host Context

## Requirements

### Requirement: SdkHostContext shape

#### Scenario: Context exposes kernel and provider factory only

- **WHEN** `createSdkContext` returns a context
- **THEN** it has `kernel` and `createGraphProvider` properties
- **AND** it does not expose a top-level `config` field duplicating kernel state

### Requirement: createSdkContext

#### Scenario: Provider factory uses same config as kernel

- **WHEN** `await createSdkContext(config)` is called
- **THEN** `createKernel` receives `config`
- **AND** each `createGraphProvider()` call invokes `createCodeGraphProvider` with the same `config` reference

#### Scenario: createSdkContext awaits kernel construction

- **WHEN** `createSdkContext(config)` is invoked
- **THEN** the caller MUST await the returned promise before using `kernel` or `createGraphProvider`

#### Scenario: Each provider call returns new instance

- **WHEN** `createGraphProvider()` is called twice on the same context
- **THEN** two distinct `CodeGraphProvider` instances are returned

### Requirement: openSpecdHost

#### Scenario: Discovery mode loads config from cwd

- **GIVEN** a valid specd.yaml in the current working directory
- **WHEN** openSpecdHost() is called without configPath
- **THEN** config is loaded via createDefaultConfigLoader() discovery mode
- **AND** configFilePath points to the discovered file

#### Scenario: Discovery mode can start from explicit startDir

- **GIVEN** a host selects a project directory explicitly
- **WHEN** openSpecdHost({ startDir: '/path/to/project/subdir' }) is called
- **THEN** the loader uses discovery mode from that startDir
- **AND** the call does not rely on mutating process.cwd()

#### Scenario: Forced config path

- **WHEN** openSpecdHost({ configPath: '/path/to/specd.yaml' }) is called
- **THEN** the loader uses forced mode for that path

#### Scenario: Mixed bootstrap inputs are rejected

- **WHEN** openSpecdHost({ configPath: '/path/to/specd.yaml', startDir: '/path/to/project' }) is called
- **THEN** the call fails before loader bootstrap proceeds
- **AND** the error tells the caller to choose either configPath or startDir

#### Scenario: SDK composition options are forwarded

- **WHEN** openSpecdHost({ options: { kernel: { ... }, graph: { graphStoreId: 'sqlite' } } }) is called
- **THEN** createKernel receives the provided kernel options
- **AND** createGraphProvider forwards the provided graph options to createCodeGraphProvider

#### Scenario: Config warnings remain on returned config

- **GIVEN** config loading resolves successfully with advisory warnings
- **WHEN** openSpecdHost() returns
- **THEN** the returned config.warnings value matches the loader output unchanged

#### Scenario: Host result does not duplicate warnings

- **WHEN** a caller inspects OpenSpecdHostResult
- **THEN** warning diagnostics are available through config.warnings
- **AND** no separate top-level warnings field is required or exposed

#### Scenario: Opt-in bootstrap fallback constructs a graph host

- **GIVEN** discovery from startDir finds no specd.yaml and a VCS root exists
- **WHEN** openSpecdHost({ startDir, allowBootstrapFallback: true }) is called
- **THEN** it returns a synthetic graph-capable host rooted at that VCS repository
- **AND** config discovery remains the behavior when the flag is omitted or false

#### Scenario: Explicit configuration never falls back

- **WHEN** openSpecdHost({ configPath, allowBootstrapFallback: true }) cannot load configPath
- **THEN** the explicit configuration error propagates
- **AND** no synthetic fallback is created

### Requirement: Config mutation boundary

#### Scenario: Host context has no write methods

- **WHEN** inspecting `SdkHostContext` type exports
- **THEN** no `initProject`, `addPlugin`, or `removePlugin` methods exist on the context

### Requirement: Studio host bootstrap

#### Scenario: API server bootstraps via createSdkContext

- **WHEN** `createApiServer` starts for a project
- **THEN** it calls `createSdkContext` from `@specd/sdk` once per process
- **AND** per-request context is built from the resulting `SdkHostContext`

#### Scenario: Desktop main bootstraps local project via createSdkContext

- **GIVEN** the user opens a local project folder in desktop
- **WHEN** the main process constructs the project kernel
- **THEN** it uses `createSdkContext` from `@specd/sdk`
- **AND** it does not call `createKernel` from `@specd/core` directly
