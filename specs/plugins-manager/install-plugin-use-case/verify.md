# Verification: plugin-manager:install-plugin-use-case

## Requirements

### Requirement: Behavior

#### Scenario: Plugin not found

- **WHEN** InstallPlugin is executed with non-existent plugin
- **THEN** PluginNotFoundError is thrown

#### Scenario: Successful install

- **GIVEN** a valid `SpecdConfig` is provided
- **WHEN** InstallPlugin is executed with valid plugin and configuration
- **THEN** it returns success with message

### Requirement: Error handling

#### Scenario: Non-agent plugin rejected

- **GIVEN** a loaded plugin that is a valid SpecdPlugin but not an AgentPlugin
- **WHEN** `InstallPlugin.execute()` is called
- **THEN** `PluginValidationError` is thrown
