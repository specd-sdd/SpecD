# Verification: cli:plugins-install

## Requirements

### Requirement: Command signature

#### Scenario: Valid plugin names

- **WHEN** `specd plugins install @specd/plugin-agent-claude` is invoked
- **THEN** the command attempts to install the plugin

#### Scenario: Multiple plugin names

- **WHEN** `specd plugins install @specd/plugin-agent-claude @specd/plugin-agent-copilot` is invoked
- **THEN** the command attempts to install both plugins

### Requirement: Declaration source

#### Scenario: Already-installed check uses config.plugins

- **GIVEN** `@specd/plugin-agent-claude` is declared under `plugins.agents` in the loaded config
- **WHEN** `specd plugins install @specd/plugin-agent-claude` is invoked
- **THEN** the command detects the plugin as already installed from `config.plugins`
- **AND** it does not call `kernel.project.listPlugins`

#### Scenario: UI already-installed check uses plugins.ui

- **GIVEN** `@specd/plugin-ui-studio` is declared under `plugins.ui` in the loaded config
- **WHEN** `specd plugins install @specd/plugin-ui-studio` is invoked
- **THEN** the command detects the plugin as already installed from `config.plugins.ui`
- **AND** it does not call `InstallUiPlugin` again

#### Scenario: Declaration read does not re-read disk via ConfigWriter

- **GIVEN** a loaded `SpecdConfig` snapshot is available
- **WHEN** the install workflow checks declared plugins
- **THEN** it reads `config.plugins` in memory
- **AND** it does not call `ConfigWriter.listPlugins`

### Requirement: Already-installed handling

#### Scenario: Plugin already installed

- **GIVEN** `@specd/plugin-agent-claude` is already in `specd.yaml`
- **WHEN** `specd plugins install @specd/plugin-agent-claude` is invoked
- **THEN** a warning containing "already installed" and "update" is emitted
- **AND** the plugin is NOT re-installed

### Requirement: Display name

#### Scenario: Output displays appropriate header

- **WHEN** `specd plugins install @specd/plugin-agent-claude` is invoked
- **THEN** output displays a header `Installed plugins:` followed by plugin details

### Requirement: Installation workflow

#### Scenario: Calls InstallPlugin use case and records in config

- **WHEN** `specd plugins install @specd/plugin-agent-claude` is invoked with plugin not installed
- **THEN** `InstallPlugin` use case is called
- **AND** `createConfigWriter().addPlugin` is called with bucket `agents`
- **AND** `kernel.project.addPlugin` is not called

#### Scenario: UI plugin uses InstallUiPlugin and plugins.ui

- **GIVEN** `@specd/plugin-ui-studio` is not declared under `plugins.ui`
- **WHEN** `specd plugins install @specd/plugin-ui-studio` is invoked
- **THEN** `LoadPlugin` determines `plugin.type` is `ui`
- **AND** `InstallUiPlugin` use case is called
- **AND** `InstallPlugin` is not called
- **AND** `createConfigWriter().addPlugin` is called with bucket `ui`
- **AND** the declaration is recorded under `plugins.ui` in `specd.yaml`

### Requirement: Plugin type bucket mapping

#### Scenario: Agent plugin maps to agents bucket

- **GIVEN** a loaded agent plugin with `plugin.type` `agent`
- **WHEN** the install workflow persists the declaration
- **THEN** `addPlugin` is called with bucket `agents`

#### Scenario: UI plugin maps to ui bucket

- **GIVEN** a loaded UI plugin with `plugin.type` `ui`
- **WHEN** the install workflow persists the declaration
- **THEN** `addPlugin` is called with bucket `ui`

### Requirement: Exit code

#### Scenario: Installation failure

- **WHEN** any plugin fails to install
- **THEN** the command exits with code 1
- **AND** continues processing the remaining plugins

### Requirement: Output format

#### Scenario: JSON format

- **WHEN** `--format json` is passed
- **THEN** output is machine-parseable JSON
