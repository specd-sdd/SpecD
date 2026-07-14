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

- **GIVEN** a valid `specd.yaml` in the current working directory
- **WHEN** `openSpecdHost()` is called without `configPath`
- **THEN** config is loaded via `createDefaultConfigLoader()` discovery mode
- **AND** `configFilePath` points to the discovered file

#### Scenario: Forced config path

- **WHEN** `openSpecdHost({ configPath: '/path/to/specd.yaml' })` is called
- **THEN** the loader uses forced mode for that path

#### Scenario: Kernel options forwarded

- **WHEN** `openSpecdHost({ kernelOptions: { ... } })` is called
- **THEN** `createKernel` receives the provided options

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
