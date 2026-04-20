# Verification: plugin-manager:plugin-loader

## Requirements

### Requirement: Load workflow

#### Scenario: Package available

- **GIVEN** a plugin package is in node_modules
- **WHEN** PluginLoader loads it
- **THEN** it returns the plugin instance

### Requirement: Zod validation

#### Scenario: Invalid manifest

- **GIVEN** specd-plugin.json has invalid schema
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
