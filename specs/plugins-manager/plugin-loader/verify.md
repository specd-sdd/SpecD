# Verification: plugin-manager:plugin-loader

## Requirements

### Requirement: Load workflow

#### Scenario: Package available

- **GIVEN** a valid `SpecdConfig` is provided
- **AND** a plugin package is in node_modules
- **WHEN** PluginLoader loads it
- **THEN** it returns the plugin instance

### Requirement: Manifest schema

#### Scenario: Manifest schema validates required fields

- **GIVEN** specd-plugin.json has invalid schema
- **WHEN** PluginLoader loads it
- **THEN** PluginValidationError is thrown

#### Scenario: Manifest missing version

- **GIVEN** specd-plugin.json has no `version` field
- **WHEN** PluginLoader loads it
- **THEN** PluginValidationError is thrown

#### Scenario: Unknown plugin type rejected at runtime

- **GIVEN** a plugin whose manifest declares `pluginType: 'agent'` but the runtime object's `type` is not in `PLUGIN_TYPES`
- **WHEN** PluginLoader validates the interface
- **THEN** `isSpecdPlugin` returns `false` and `PluginValidationError` is thrown

#### Scenario: Agent plugin missing install method

- **GIVEN** a plugin whose manifest declares `pluginType: 'agent'` but the runtime object lacks `install` or `uninstall`
- **WHEN** PluginLoader validates the interface
- **THEN** `isAgentPlugin` returns `false` and `PluginValidationError` is thrown

#### Scenario: Valid manifest passes Zod validation

- **GIVEN** a valid specd-plugin.json with all required fields
- **WHEN** PluginLoader validates it with Zod schema
- **THEN** the manifest passes validation

### Requirement: Error handling

#### Scenario: Base contract violation throws PluginValidationError

- **GIVEN** a plugin missing required base fields
- **WHEN** PluginLoader validates it
- **THEN** PluginValidationError is thrown

### Requirement: Factory function

#### Scenario: Plugin exports create factory

- **GIVEN** a plugin npm package
- **WHEN** PluginLoader loads it
- **THEN** it calls `create(options: PluginLoaderOptions)` factory function
- **AND** passes the fully-resolved SpecdConfig
