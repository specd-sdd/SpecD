# Verification: cli:plugins-update

## Requirements

### Requirement: Command signature

#### Scenario: Update all plugins

- **WHEN** `specd plugins update` is invoked with no arguments
- **THEN** all declared plugins are updated

#### Scenario: Update specific plugins

- **WHEN** `specd plugins update @specd/plugin-agent-claude` is invoked
- **THEN** only the specified plugin is updated

### Requirement: Declaration source

#### Scenario: Update-all uses config.plugins.agents

- **GIVEN** multiple plugins are declared under `plugins.agents` in the loaded config
- **WHEN** `specd plugins update` is invoked with no arguments
- **THEN** all plugins from `config.plugins.agents` are selected for update
- **AND** the command does not call `kernel.project.listPlugins`

#### Scenario: Declaration read does not use ConfigWriter.listPlugins

- **GIVEN** a loaded `SpecdConfig` snapshot is available
- **WHEN** `specd plugins update` resolves the declared plugin set
- **THEN** it reads `config.plugins` in memory
- **AND** it does not call `ConfigWriter.listPlugins`

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
