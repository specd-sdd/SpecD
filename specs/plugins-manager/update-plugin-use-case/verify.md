# Verification: plugin-manager:update-plugin-use-case

## Requirements

### Requirement: Idempotency

#### Scenario: Multiple updates produce same result

- **WHEN** UpdatePlugin is executed twice
- **THEN** both return the same result

### Requirement: Error handling

#### Scenario: Non-agent plugin rejected

- **GIVEN** a loaded plugin that is a valid SpecdPlugin but not an AgentPlugin
- **WHEN** `UpdatePlugin.execute()` is called
- **THEN** `PluginValidationError` is thrown
