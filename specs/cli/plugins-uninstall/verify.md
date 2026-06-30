# Verification: cli:plugins-uninstall

## Requirements

### Requirement: Command signature

#### Scenario: Uninstall multiple plugins

- **WHEN** `specd plugins uninstall @specd/plugin-agent-claude @specd/plugin-agent-copilot` is invoked
- **THEN** both plugins are uninstalled

### Requirement: Exit code

#### Scenario: Uninstall failure

- **WHEN** any plugin fails to uninstall
- **THEN** the command exits with code 1
- **AND** continues processing the remaining plugins

### Requirement: Uninstall workflow

#### Scenario: Uninstall calls plugin hook and removes from config

- **WHEN** `specd plugins uninstall @specd/plugin-agent-claude` is invoked
- **THEN** the plugin is loaded via `LoadPlugin` use case
- **AND** the plugin's `uninstall()` method is called
- **AND** `createConfigWriter().removePlugin` is called to remove the plugin from `specd.yaml`
- **AND** `kernel.project.removePlugin` is not called

### Requirement: UI plugin uninstall bucket

#### Scenario: UI plugin removes plugins.ui declaration

- **GIVEN** `@specd/plugin-ui-studio` is declared under `plugins.ui`
- **WHEN** `specd plugins uninstall @specd/plugin-ui-studio` is invoked
- **THEN** `LoadPlugin` determines `plugin.type` is `ui`
- **AND** `createConfigWriter().removePlugin` is called with bucket `ui`
- **AND** the declaration is removed from `plugins.ui` in `specd.yaml`

### Requirement: Output

#### Scenario: Machine-parseable JSON output

- **WHEN** `specd plugins uninstall @specd/plugin-agent-claude --format json` is invoked
- **THEN** output is machine-parseable JSON with plugin name and status
