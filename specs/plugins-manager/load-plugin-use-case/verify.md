# Verification: plugin-manager:load-plugin-use-case

## Requirements

### Requirement: Input

#### Scenario: Input includes plugin name

- **WHEN** LoadPlugin is executed
- **THEN** the input includes `pluginName`

### Requirement: Output

#### Scenario: Plugin loaded

- **WHEN** LoadPlugin is executed with valid plugin
- **THEN** it returns `{ plugin, manifest }`

#### Scenario: Plugin not found

- **WHEN** LoadPlugin is executed with non-existent plugin
- **THEN** it throws `PluginNotFoundError`

### Requirement: Behavior

#### Scenario: Loads plugin via PluginLoader

- **WHEN** LoadPlugin is executed
- **THEN** it loads the plugin via `PluginLoader`
- **AND** validates the plugin implements the base contract

#### Scenario: No lifecycle calls

- **WHEN** LoadPlugin is executed
- **THEN** `init`, `install` and `destroy` are not called
