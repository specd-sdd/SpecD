# Verification: cli:plugins-update

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
- **AND** continues processing the remaining plugins

### Requirement: Update behavior

#### Scenario: Update all plugins when no arguments provided

- **WHEN** `specd plugins update` is invoked with no arguments
- **THEN** all declared plugins in `specd.yaml` are updated

#### Scenario: Update behavior is idempotent

- **GIVEN** `specd plugins update @specd/plugin-agent-claude` has been run successfully
- **WHEN** `specd plugins update @specd/plugin-agent-claude` is run again
- **THEN** the command succeeds and does not produce an error
- **AND** `specd.yaml` is not modified

### Requirement: Output

#### Scenario: Machine-parseable JSON output

- **WHEN** `specd plugins update --format json` is invoked
- **THEN** output is machine-parseable JSON with plugin names and status
