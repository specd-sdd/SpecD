# Verification: plugin-manager:load-plugin-use-case

## Requirements

### Requirement: Output

#### Scenario: Plugin loaded

- **WHEN** LoadPlugin is executed with valid plugin
- **THEN** it returns `{ plugin: SpecdPlugin }`

#### Scenario: Plugin not found

- **WHEN** LoadPlugin is executed with non-existent plugin
- **THEN** it returns `{ error: PluginNotFoundError }`
