# Verification: SDK Host Context

## Requirements

### Requirement: SdkHostContext shape

#### Scenario: Context exposes kernel, provider factory and disposal only

- **WHEN** `createSdkContext` returns a context
- **THEN** it has `kernel`, `createGraphProvider`, `dispose` and `[Symbol.asyncDispose]` properties
- **AND** it does not expose a top-level `config` field duplicating kernel state

#### Scenario: Context is async-disposable

- **WHEN** a caller writes `await using ctx = await createSdkContext(config)`
- **THEN** the context satisfies `AsyncDisposable`
- **AND** leaving the scope calls `ctx[Symbol.asyncDispose]()`

### Requirement: createSdkContext

#### Scenario: Provider factory uses same config as kernel

- **WHEN** `await createSdkContext(config)` is called
- **THEN** the kernel builder is created from `config`
- **AND** each `createGraphProvider()` call invokes `createCodeGraphProvider` with the same `config` reference

#### Scenario: createSdkContext awaits kernel construction

- **WHEN** `createSdkContext(config)` is invoked
- **THEN** the caller MUST await the returned promise before using `kernel` or `createGraphProvider`

#### Scenario: Each provider call returns new instance

- **WHEN** `createGraphProvider()` is called twice on the same context
- **THEN** two distinct `CodeGraphProvider` instances are returned

#### Scenario: Context disposal delegates to the kernel

- **WHEN** `await createSdkContext(config)` returns a context
- **THEN** `context.dispose` delegates to `kernel.dispose()`
- **AND** `context[Symbol.asyncDispose]` is the same function as `context.dispose`

#### Scenario: Kernel options are forwarded to the builder

- **WHEN** `createSdkContext(config, { kernel: { onLog } })` is called
- **THEN** the kernel builder is created from `config` and `options.kernel`, so `onLog` is the logger of the resulting kernel
- **AND** a `callback` destination in `options.kernel.additionalDestinations` receives entries emitted through the kernel logger

#### Scenario: Plugins registered before build

- **GIVEN** a config with one configured plugin
- **WHEN** `createSdkContext(config)` is called
- **THEN** `registerPlugins` completes before `builder.build()` is invoked

#### Scenario: Plugins disabled

- **GIVEN** a config with a configured plugin
- **WHEN** `createSdkContext(config, { plugins: false })` is called
- **THEN** no plugin is loaded, no `init` is called and no plugin disposer is registered

#### Scenario: Plugins enabled by default

- **WHEN** `createSdkContext(config)` is called without a `plugins` option
- **THEN** configured plugins are registered

#### Scenario: Plugins enabled with an empty plugin list

- **GIVEN** a config without `plugins`
- **WHEN** `createSdkContext(config)` is called
- **THEN** no plugin is loaded and no disposer is registered

#### Scenario: openSpecdHost forwards the plugins option

- **WHEN** `openSpecdHost({ options: { plugins: false } })` is called
- **THEN** the underlying `createSdkContext` receives `plugins: false`

#### Scenario: Broken plugin fails context creation

- **GIVEN** a configured plugin whose `init` throws
- **WHEN** `createSdkContext(config)` is called
- **THEN** it rejects with `PluginInitError` naming the plugin
- **AND** already initialized plugins were destroyed
- **AND** no kernel was built

#### Scenario: Build failure disposes plugins

- **GIVEN** a configured plugin and `builder.build()` rejecting
- **WHEN** `createSdkContext(config)` is called
- **THEN** it rejects with the build error and the registration was disposed

#### Scenario: Build failure is not masked by a dispose failure

- **GIVEN** `builder.build()` rejects with error E and the registration `dispose` also throws
- **WHEN** `createSdkContext(config)` is called
- **THEN** it rejects with E
- **AND** the dispose errors are attached as `rollbackErrors` on E

#### Scenario: Primitive build error is not masked

- **GIVEN** `builder.build()` rejects with a string and the registration `dispose` also throws
- **WHEN** `createSdkContext(config)` is called
- **THEN** it rejects with that same string
- **AND** the dispose errors are logged at `warn`

#### Scenario: End to end with real plugin-manager and kernel builder

- **GIVEN** a real plugin-manager and kernel builder with plugins `a` and `b`
- **WHEN** a context is created and then disposed
- **THEN** `init` ran on `a` then `b` before the kernel existed, and `destroy` runs on `b` then `a` on dispose

#### Scenario: Extra handlers are forwarded

- **WHEN** `createSdkContext(config, { pluginHandlers: [h] })` is called
- **THEN** `h` is available to `registerPlugins`

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
- **THEN** the kernel builder is created with the provided `options.kernel`
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

### Requirement: Host disposal

#### Scenario: dispose shares the kernel disposal

- **GIVEN** a host whose kernel has registered disposers
- **WHEN** `host.dispose()` is called twice
- **THEN** both calls return the kernel's disposal promise
- **AND** each disposer ran exactly once

#### Scenario: dispose destroys plugins in reverse order

- **GIVEN** a host with plugins `a` and `b` initialized in that order
- **WHEN** `host.dispose()` is awaited
- **THEN** `b.destroy` runs before `a.destroy`

#### Scenario: await using releases the host

- **WHEN** a caller writes `await using host = await openSpecdHost(input)` and the scope exits
- **THEN** `host[Symbol.asyncDispose]()` runs and the kernel's disposers have run

#### Scenario: openSpecdHost result carries disposal members

- **WHEN** `openSpecdHost` resolves
- **THEN** the result has `dispose` and `[Symbol.asyncDispose]`

#### Scenario: Graph providers are not closed by dispose

- **GIVEN** a provider returned by `host.createGraphProvider()`
- **WHEN** `host.dispose()` is awaited
- **THEN** the provider's `close()` was not called by the host

#### Scenario: No API wraps a foreign kernel

- **WHEN** the SDK public surface is inspected
- **THEN** it exposes no function that builds an `SdkHostContext` around a kernel created elsewhere

### Requirement: Config mutation boundary

#### Scenario: Host context has no write methods

- **WHEN** inspecting `SdkHostContext` type exports
- **THEN** no `initProject`, `addPlugin`, or `removePlugin` methods exist on the context
