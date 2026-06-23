# Verification: plugin-manager:install-plugin-use-case

## Requirements

### Requirement: Input

#### Scenario: Input includes pluginName and config

- **WHEN** `InstallPlugin.execute()` is called
- **THEN** the input includes `pluginName` and `config`
- **AND** optional plugin-specific options

### Requirement: Output

#### Scenario: Output indicates success or failure

- **WHEN** `InstallPlugin.execute()` completes
- **THEN** output includes `success: boolean`, `message: string`, and optional `data`

### Requirement: Behavior

#### Scenario: Plugin not found

- **WHEN** InstallPlugin is executed with non-existent plugin
- **THEN** PluginNotFoundError is thrown

#### Scenario: Successful install

- **GIVEN** a valid `SpecdConfig` is provided
- **WHEN** InstallPlugin is executed with valid plugin and configuration
- **THEN** it returns success with message

#### Scenario: Loads plugin via PluginLoader

- **WHEN** InstallPlugin is executed
- **THEN** it loads the plugin via `PluginLoader`
- **AND** validates it is an `AgentPlugin`

#### Scenario: UI plugin rejected by InstallPlugin

- **GIVEN** a loaded UI plugin (`isUiPlugin` is true)
- **WHEN** `InstallPlugin.execute()` is called
- **THEN** `PluginValidationError` is thrown
- **AND** the message or detail mentions `InstallUiPlugin`

### Requirement: Error handling

#### Scenario: Non-agent plugin rejected

- **GIVEN** a loaded plugin that is a valid SpecdPlugin but not an AgentPlugin
- **WHEN** `InstallPlugin.execute()` is called
- **THEN** `PluginValidationError` is thrown
