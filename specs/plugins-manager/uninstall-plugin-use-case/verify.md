# Verification: plugin-manager:uninstall-plugin-use-case

## Requirements

### Requirement: Input

#### Scenario: Input includes pluginName and config

- **WHEN** `UninstallPlugin.execute()` is called
- **THEN** the input includes `pluginName` and `config`
- **AND** optional plugin-specific options

### Requirement: Output

#### Scenario: Output is void on success

- **WHEN** UninstallPlugin completes successfully
- **THEN** output is `void`

### Requirement: Behavior

#### Scenario: Successful uninstall

- **GIVEN** a valid `SpecdConfig` is provided
- **WHEN** UninstallPlugin is executed with valid configuration
- **THEN** it returns void

#### Scenario: Loads plugin via PluginLoader

- **WHEN** UninstallPlugin is executed
- **THEN** it loads the plugin via `PluginLoader`
- **AND** validates it is an `AgentPlugin`

### Requirement: Error handling

#### Scenario: Non-agent plugin rejected

- **GIVEN** a loaded plugin that is a valid SpecdPlugin but not an AgentPlugin
- **WHEN** `UninstallPlugin.execute()` is called
- **THEN** `PluginValidationError` is thrown
