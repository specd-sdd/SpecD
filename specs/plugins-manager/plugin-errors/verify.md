# Verification: plugin-manager:plugin-errors

## Requirements

### Requirement: PluginNotFoundError

#### Scenario: Error has pluginName

- **WHEN** PluginNotFoundError is thrown
- **THEN** it includes the pluginName property

### Requirement: PluginValidationError

#### Scenario: Error has fields

- **WHEN** PluginValidationError is thrown
- **THEN** it includes the fields property

### Requirement: Contribution and configuration errors

#### Scenario: Errors name the plugin

- **WHEN** any of `DuplicateContributionError`, `UnknownContributionError`, `UnknownContributionKindError`, `InvalidPluginConfigError`, `UnsupportedSchemaKeywordError` or `PluginInitError` is thrown
- **THEN** it exposes `pluginName` and its message contains the plugin name

#### Scenario: Stable codes

- **WHEN** these errors are thrown
- **THEN** their `code` values are `DUPLICATE_CONTRIBUTION_ID`, `UNKNOWN_CONTRIBUTION`, `UNKNOWN_CONTRIBUTION_KIND`, `INVALID_PLUGIN_CONFIG`, `UNSUPPORTED_SCHEMA_KEYWORD` and `PLUGIN_INIT_FAILED` respectively

#### Scenario: Each class message contains the plugin name

- **WHEN** each of the plugin-named error classes is constructed with plugin `@acme/x`
- **THEN** every message contains `@acme/x` (asserted per class)

#### Scenario: Init error keeps the cause

- **GIVEN** a plugin whose `init` throws `new Error('boom')`
- **WHEN** `PluginInitError` wraps it
- **THEN** `cause` is the original error

#### Scenario: Wrapped cause message is visible

- **GIVEN** an `install()` hook that throws `Error("disk full")`
- **WHEN** the install use case wraps it in `PluginValidationError`
- **THEN** the error message contains `disk full`
- **AND** `cause` is the original error

#### Scenario: Destroy error names the failing plugins

- **GIVEN** the `destroy` of plugins `@acme/a` and `@acme/c` throws
- **WHEN** the disposer aggregates the failures
- **THEN** `PluginDestroyError.pluginNames` is `['@acme/c', '@acme/a']` in destroy order, aligned with `errors`
- **AND** the message names both plugins

#### Scenario: Manifest walk failures are wrapped

- **GIVEN** a manifest whose `contributes` getter throws on the second read, or one with 130,000 contribution ids
- **WHEN** `InstallPlugin`, `UpdatePlugin` or `UninstallPlugin` runs
- **THEN** the getter case raises `PluginValidationError` with `fields: ['load']` and the original as `cause`
- **AND** the 130,000-id case succeeds without a `RangeError`

#### Scenario: Hostile inputs still surface a SpecdError

- **GIVEN** a plugin whose accessor throws, a loader resolving to `undefined`, or a rejection with `undefined`
- **WHEN** the plugin is loaded or registered
- **THEN** the error that escapes is a `SpecdError`
- **AND** a thrown `undefined` is still recorded as `cause`

### Requirement: Host wiring and address errors

#### Scenario: DuplicateHandlerKindError

- **WHEN** `DuplicateHandlerKindError` is constructed for kind `agents`
- **THEN** its `code` is `DUPLICATE_HANDLER_KIND`, `kind` is `agents` and it has no `pluginName`

#### Scenario: InvalidContributionAddressError

- **WHEN** `InvalidContributionAddressError` is constructed for address `@acme/x.a.b`
- **THEN** its `code` is `INVALID_CONTRIBUTION_ADDRESS`

#### Scenario: Non-object schema node keyword

- **WHEN** `UnsupportedSchemaKeywordError` is raised for a non-object `configSchema` root
- **THEN** its `keyword` is `configSchema`, and for a non-object nested node it is `type`

#### Scenario: Validation error carries fields and cause

- **WHEN** `PluginValidationError` is created with fields `['destroy']` and a cause
- **THEN** `fields` is `['destroy']`, `cause` is the cause and `code` is `PLUGIN_VALIDATION_ERROR`
