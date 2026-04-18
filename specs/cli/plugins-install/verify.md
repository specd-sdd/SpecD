# Verification: cli:cli/plugins-install

## Requirements

### Requirement: Command signature

#### Scenario: Valid plugin names

- **WHEN** `specd plugins install @specd/plugin-agent-claude` is invoked
- **THEN** the command attempts to install the plugin

#### Scenario: Multiple plugin names

- **WHEN** `specd plugins install @specd/plugin-agent-claude @specd/plugin-agent-copilot` is invoked
- **THEN** the command attempts to install both plugins

### Requirement: Already-installed handling

#### Scenario: Plugin already installed

- **GIVEN** `@specd/plugin-agent-claude` is already in `specd.yaml`
- **WHEN** `specd plugins install @specd/plugin-agent-claude` is invoked
- **THEN** a warning containing "already installed" and "update" is emitted
- **AND** the plugin is NOT re-installed

### Requirement: Exit code

#### Scenario: Installation failure

- **WHEN** any plugin fails to install
- **THEN** the command exits with code 1

### Requirement: Output format

#### Scenario: JSON format

- **WHEN** `--format json` is passed
- **THEN** output is machine-parseable JSON
