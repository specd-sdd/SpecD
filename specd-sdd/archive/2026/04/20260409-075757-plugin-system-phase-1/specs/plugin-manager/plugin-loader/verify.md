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
