# Verification: cli:cli/plugins-show

## Requirements

### Requirement: Command signature

#### Scenario: Show plugin details

- **WHEN** `specd plugins show @specd/plugin-agent-claude` is invoked
- **THEN** plugin metadata, configSchema, and capabilities are displayed

### Requirement: Error handling

#### Scenario: Plugin not found

- **WHEN** `specd plugins show nonexistent-plugin` is invoked
- **THEN** an error message is emitted
- **AND** exit code is 1
