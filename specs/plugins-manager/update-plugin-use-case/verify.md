# Verification: plugin-manager:update-plugin-use-case

## Requirements

### Requirement: Input

#### Scenario: Input includes pluginName and config

- **WHEN** `UpdatePlugin.execute()` is called
- **THEN** the input includes `pluginName` and `config`
- **AND** optional plugin-specific options

### Requirement: Output

#### Scenario: Output indicates success or failure

- **WHEN** `UpdatePlugin.execute()` completes
- **THEN** output includes `success: boolean`, `message: string`, and optional `data`

### Requirement: Behavior

#### Scenario: Loads plugin via PluginLoader

- **WHEN** UpdatePlugin is executed
- **THEN** it loads the plugin via `PluginLoader`
- **AND** validates it is an `AgentPlugin`

### Requirement: Idempotency

#### Scenario: Multiple updates produce same result

- **GIVEN** a valid `SpecdConfig` is provided
- **WHEN** UpdatePlugin is executed twice with same configuration
- **THEN** both return the same result

### Requirement: Error handling

#### Scenario: Non-agent plugin rejected

- **GIVEN** a loaded plugin that is a valid SpecdPlugin but not an AgentPlugin
- **WHEN** `UpdatePlugin.execute()` is called
- **THEN** `PluginValidationError` is thrown
