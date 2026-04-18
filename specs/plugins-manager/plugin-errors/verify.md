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
