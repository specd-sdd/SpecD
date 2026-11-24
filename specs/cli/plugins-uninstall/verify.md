# Verification: cli:plugins-uninstall

## Requirements

### Requirement: Command signature

#### Scenario: Uninstall multiple plugins

- **WHEN** `specd plugins uninstall @specd/plugin-agent-claude @specd/plugin-agent-copilot` is invoked
- **THEN** both plugins are uninstalled

### Requirement: Exit code

#### Scenario: Uninstall failure

- **GIVEN** `specd plugins uninstall @acme/x @acme/y` where uninstalling `@acme/x` fails
- **WHEN** the command runs
- **THEN** `@acme/y` is still uninstalled and removed from config
- **AND** the command exits with code 1

### Requirement: Uninstall workflow

#### Scenario: Uninstall calls plugin hook and removes from config

- **WHEN** `specd plugins uninstall @specd/plugin-agent-claude` is invoked
- **THEN** the `UninstallPlugin` use case is called with the selected contribution ids
- **AND** the plugin's `uninstall()` method is invoked before the declaration is removed
- **AND** `createConfigWriter().removePlugin(configPath, name)` is called to remove the plugin from `specd.yaml`
- **AND** `kernel.project.removePlugin` is not called

#### Scenario: Plugin that is not an agent plugin

- **GIVEN** a declared plugin contributing only `checks` (no `uninstall` hook)
- **WHEN** `specd plugins uninstall @acme/x` is invoked
- **THEN** the plugin is uninstalled and removed from the list

#### Scenario: Allowlist is honoured

- **GIVEN** `@acme/x` declared with `contributions: ['audit']`
- **WHEN** it is uninstalled
- **THEN** `UninstallPlugin` receives `contributions: ['audit']`

#### Scenario: Duplicate names are processed once

- **WHEN** `specd plugins uninstall @acme/x @acme/x` is invoked for a declared plugin
- **THEN** the uninstall hook runs once and `removePlugin` is called once
- **AND** the second name is reported as `skipped` with the detail `already processed`

#### Scenario: Declared plugin whose package is missing

- **GIVEN** `@acme/x` is declared but its package cannot be resolved
- **WHEN** `specd plugins uninstall @acme/x` is invoked
- **THEN** `removePlugin` is called and the declaration disappears from `specd.yaml`
- **AND** the result is `uninstalled` with the detail `package not found; only the declaration was removed`

#### Scenario: Declared plugin that fails to load for another reason

- **GIVEN** `@acme/x` is declared and its `specd-plugin.json` is invalid
- **WHEN** `specd plugins uninstall @acme/x` is invoked
- **THEN** `removePlugin` is called and the declaration disappears from `specd.yaml`
- **AND** the result is `uninstalled` with the detail `plugin failed to load (<reason>); only the declaration was removed`

#### Scenario: Plugin not declared

- **WHEN** `specd plugins uninstall @acme/unknown` is invoked and it is not in `config.plugins`
- **THEN** an error is reported for that name and the plugin is not called
- **AND** `removePlugin` is not called
- **AND** the command exits with code 1

#### Scenario: Hook failure retains the declaration

- **GIVEN** a declared plugin whose `uninstall()` throws
- **WHEN** `specd plugins uninstall @acme/x` is invoked
- **THEN** `removePlugin` is not called
- **AND** an error is reported for that name and the command exits with code 1

### Requirement: Host bootstrap without plugins

#### Scenario: Uninstall works with a broken configured plugin

- **GIVEN** a configured plugin whose `init` would throw
- **WHEN** `specd plugins uninstall` is invoked for it
- **THEN** the host is opened with `plugins: false` and the uninstall proceeds
- **AND** `resolveCliContext` receives `plugins: false`

### Requirement: Output

#### Scenario: Machine-parseable JSON output

- **WHEN** `specd plugins uninstall @specd/plugin-agent-claude --format json` is invoked
- **THEN** output is machine-parseable JSON with plugin name and status
