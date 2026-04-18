# Verification: cli:cli/plugins-update

## Requirements

### Requirement: Command signature

#### Scenario: Update all plugins

- **WHEN** `specd plugins update` is invoked with no arguments
- **THEN** all declared plugins are updated

#### Scenario: Update specific plugins

- **WHEN** `specd plugins update @specd/plugin-agent-claude` is invoked
- **THEN** only the specified plugin is updated

### Requirement: Exit code

#### Scenario: Update failure

- **WHEN** any plugin fails to update
- **THEN** the command exits with code 1
