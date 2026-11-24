# Verification: plugin-manager:plugin-repository-port

## Requirements

### Requirement: PluginRepositoryPort interface

#### Scenario: Has required methods

- **WHEN** PluginRepositoryPort is inspected
- **THEN** it has `addPlugin()`, `removePlugin()`, and `listPlugins()`
- **AND** every method takes `configPath` as its first parameter

#### Scenario: addPlugin accepts name and optional config and contributions

- **WHEN** `addPlugin(configPath, name, options)` is called
- **THEN** it accepts `name` and optional `config` and `contributions`
- **AND** it has no `type` parameter

#### Scenario: removePlugin removes a plugin

- **WHEN** `removePlugin(configPath, name)` is called
- **THEN** the specified plugin is removed

#### Scenario: listPlugins returns the flat list

- **WHEN** `listPlugins(configPath)` is called
- **THEN** it returns every declared plugin with its optional `config` and `contributions`

#### Scenario: DeclaredPlugin is the core type

- **WHEN** the port's `DeclaredPlugin` is compared with core `ConfigDeclaredPlugin`
- **THEN** they are the same type

### Requirement: ConfigWriter conformance

#### Scenario: ConfigWriter is assignable to the port

- **GIVEN** a type-level test that assigns a `ConfigWriter` value to `PluginRepositoryPort`
- **WHEN** the test suite is type-checked
- **THEN** compilation succeeds

#### Scenario: Signature drift fails compilation

- **GIVEN** a change to a `ConfigWriter` plugin method signature without the port
- **WHEN** the conformance test is type-checked
- **THEN** compilation fails

### Requirement: Implementation note

#### Scenario: CLI implementation uses ConfigWriter

- **GIVEN** the CLI implementation
- **WHEN** PluginRepositoryPort methods are called
- **THEN** they delegate to `ConfigWriter.addPlugin()`, `ConfigWriter.removePlugin()`, and `ConfigWriter.listPlugins()`
