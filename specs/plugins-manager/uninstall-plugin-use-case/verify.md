# Verification: plugin-manager:uninstall-plugin-use-case

## Requirements

### Requirement: Behavior

#### Scenario: Successful uninstall

- **WHEN** UninstallPlugin is executed
- **THEN** it returns void

### Requirement: Error handling

#### Scenario: Non-agent plugin rejected

- **GIVEN** a loaded plugin that is a valid SpecdPlugin but not an AgentPlugin
- **WHEN** `UninstallPlugin.execute()` is called
- **THEN** `PluginValidationError` is thrown
