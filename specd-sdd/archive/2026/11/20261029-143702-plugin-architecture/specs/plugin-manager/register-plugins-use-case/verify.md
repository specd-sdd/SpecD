# Verification: plugin-manager:register-plugins-use-case

## Requirements

### Requirement: Signature

#### Scenario: Called before build

- **GIVEN** a kernel builder and a config with one plugin
- **WHEN** `registerPlugins(builder, config, { handlers })` resolves, using a real `KernelBuilder`
- **THEN** the plugin was initialized and its contributions registered before `builder.build()` is called

#### Scenario: Registration handle disposes plugins

- **GIVEN** two initialized plugins and the returned registration
- **WHEN** `registration.dispose()` is called before any kernel exists
- **THEN** both plugins are destroyed in reverse order
- **AND** calling `dispose()` again does nothing
- **AND** no kernel was ever built

#### Scenario: Input defaults

- **GIVEN** a config with one plugin
- **WHEN** `registerPlugins(builder, config)` is called without `input`
- **THEN** the plugin is initialized with the standard loader and the built-in `agents` handler

#### Scenario: Duplicate handler kind

- **GIVEN** `input.handlers` containing a handler for kind `agents`, or two handlers of the same kind
- **WHEN** `registerPlugins` is called
- **THEN** the returned promise rejects with `DuplicateHandlerKindError` before any plugin is loaded
- **AND** the call itself does not throw synchronously, whether or not `input.loader` is supplied

### Requirement: Registration order

#### Scenario: Init in list order

- **GIVEN** plugins `@a/one` then `@a/two`
- **WHEN** `registerPlugins` runs
- **THEN** `init` is called on `@a/one` first and on `@a/two` second

#### Scenario: Validation before any init

- **GIVEN** plugin `@a/one` valid and `@a/two` with invalid config
- **WHEN** `registerPlugins` runs
- **THEN** it fails and `init` was not called on `@a/one`

#### Scenario: Handlers receive selected contributions only

- **GIVEN** a plugin declaring `a` and `b` and `contributions: ['a']`
- **WHEN** `registerPlugins` runs
- **THEN** the handler of the kind receives `a` and not `b`

#### Scenario: Init called for plugins without runtime handlers

- **GIVEN** a plugin whose only kind is `agents`
- **WHEN** `registerPlugins` runs
- **THEN** `init` is called and nothing is activated

#### Scenario: One named disposer

- **GIVEN** three configured plugins
- **WHEN** `registerPlugins` completes
- **THEN** exactly one disposer is registered on the builder

### Requirement: Selection and config validation

#### Scenario: Unknown allowlist id

- **GIVEN** `contributions: ['nope']` not declared by the manifest
- **WHEN** `registerPlugins` runs
- **THEN** `UnknownContributionError` is thrown naming the plugin

#### Scenario: Config does not satisfy schema

- **GIVEN** a `config` that violates `configSchema`
- **WHEN** `registerPlugins` runs
- **THEN** `InvalidPluginConfigError` is thrown

#### Scenario: Defaults applied

- **GIVEN** a `configSchema` default `severity: 'error'` and a config without `severity`
- **WHEN** `registerPlugins` runs
- **THEN** `init` receives `pluginConfig.severity` equal to `'error'`

#### Scenario: Config without schema

- **GIVEN** a plugin without `configSchema` and a `config` in the list
- **WHEN** `registerPlugins` runs
- **THEN** `InvalidPluginConfigError` is thrown

#### Scenario: Duplicate plugin entry

- **GIVEN** the same plugin name twice in the list
- **WHEN** `registerPlugins` runs
- **THEN** `PluginValidationError` is thrown

### Requirement: Destroy and error isolation

#### Scenario: Destroy in reverse order

- **GIVEN** plugins initialized in order `a`, `b`, `c`
- **WHEN** the kernel is disposed
- **THEN** `destroy` is called on `c`, `b`, `a`

#### Scenario: Destroy error isolation

- **GIVEN** `b.destroy` throws
- **WHEN** the kernel is disposed
- **THEN** `a.destroy` is still called
- **AND** the error is reported after all destroys ran
- **AND** the reported error is a `PluginDestroyError` (instance of `SpecdError`) whose `errors` contains the thrown value

#### Scenario: Idempotent disposer

- **WHEN** the kernel is disposed twice
- **THEN** `destroy` is called once per plugin

### Requirement: Failure policy

#### Scenario: Partial init failure

- **GIVEN** plugins `a`, `b`, `c` and `c.init` throws
- **WHEN** `registerPlugins` runs
- **THEN** `PluginInitError` naming `c` is thrown
- **AND** `destroy` is called on `b` then `a`
- **AND** no disposer remains registered

#### Scenario: Rollback failure does not mask the startup error

- **GIVEN** plugins `a`, `b` and `b.init` throws, and `a.destroy` also throws during rollback
- **WHEN** `registerPlugins` runs
- **THEN** `PluginInitError` naming `b` is thrown
- **AND** `destroy` was still attempted on every initialized plugin

#### Scenario: SpecdError from init propagates unchanged

- **GIVEN** plugins `a`, `b` and `b.init` throws a `SpecdError`
- **WHEN** `registerPlugins` runs
- **THEN** that same error propagates, not wrapped in `PluginInitError`
- **AND** `destroy` is called on `a`

#### Scenario: Activate failure rolls back

- **GIVEN** plugins `a`, `b` where the handler `activate` throws a plain error for a contribution of `b`
- **WHEN** `registerPlugins` runs
- **THEN** `PluginInitError` naming `b` is thrown with the original error as `cause`
- **AND** `destroy` is called on `b` then `a`
- **AND** no disposer remains registered

#### Scenario: Load failure fails startup

- **GIVEN** a configured plugin that cannot be resolved
- **WHEN** `registerPlugins` runs
- **THEN** a typed error naming the plugin is thrown and nothing is initialized

#### Scenario: Plain loader error is wrapped

- **GIVEN** a caller-supplied loader whose `load` rejects with a plain `Error('missing')`
- **WHEN** `registerPlugins` runs
- **THEN** `PluginValidationError` naming the plugin is thrown with the original error as `cause`
- **AND** nothing is initialized

#### Scenario: Malformed loader result is a load failure

- **GIVEN** a caller-supplied loader whose `load` resolves to `undefined` or to an object without `manifest`
- **WHEN** `registerPlugins` runs
- **THEN** `PluginValidationError` naming the plugin with `fields: ['load']` is thrown

#### Scenario: registerDisposer failure names the plugins

- **GIVEN** plugins `@acme/a` and `@acme/b` and a builder whose `registerDisposer` throws
- **WHEN** `registerPlugins` runs
- **THEN** `PluginInitError` is thrown with the plugin name `@acme/a, @acme/b`
- **AND** the already initialized plugins were destroyed

#### Scenario: Concurrent dispose shares one outcome

- **GIVEN** a registration whose `destroy` rejects
- **WHEN** `dispose()` is called twice concurrently
- **THEN** both calls reject with the identical `PluginDestroyError`

#### Scenario: Frozen init error keeps its identity

- **GIVEN** an `init` that throws a frozen `SpecdError` and a rollback `destroy` that also fails
- **WHEN** `registerPlugins` runs
- **THEN** the frozen `SpecdError` is the error that propagates
- **AND** the rollback failure is logged at `warn`

### Requirement: Bypass

#### Scenario: Plugins disabled

- **GIVEN** the host created its context with `plugins: false`
- **WHEN** the context is built (SDK-level scenario, see `sdk:host-context`)
- **THEN** no plugin is loaded, no `init` is called and no disposer is registered

#### Scenario: Duplicate handler kind with an empty list

- **GIVEN** no `plugins` entries and `input.handlers` containing a handler for kind `agents`
- **WHEN** `registerPlugins` runs
- **THEN** `DuplicateHandlerKindError` is thrown and nothing is registered

#### Scenario: Empty list

- **GIVEN** no `plugins` entries
- **WHEN** `registerPlugins` runs
- **THEN** nothing is registered and no disposer is added
