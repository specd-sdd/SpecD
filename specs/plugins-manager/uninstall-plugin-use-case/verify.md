# Verification: plugin-manager:uninstall-plugin-use-case

## Requirements

### Requirement: Input

#### Scenario: Input includes pluginName and config

- **WHEN** `UninstallPlugin.execute()` is called
- **THEN** the input includes `pluginName` and `config`
- **AND** optional plugin-specific options

### Requirement: Output

#### Scenario: Output is void on success

- **WHEN** UninstallPlugin completes successfully
- **THEN** output is `void`

### Requirement: Behavior

#### Scenario: Successful uninstall

- **GIVEN** a valid `SpecdConfig` is provided
- **WHEN** UninstallPlugin is executed with valid configuration
- **THEN** it returns void

#### Scenario: Plugin not found

- **WHEN** UninstallPlugin is executed with a non-existent plugin
- **THEN** `PluginNotFoundError` is thrown

#### Scenario: Unknown contribution id

- **GIVEN** `contributions: ['nope']` not declared by the manifest
- **WHEN** UninstallPlugin is executed
- **THEN** `UnknownContributionError` is thrown

#### Scenario: Mixed kinds pass only agents ids to the hook

- **GIVEN** a plugin declaring `agents` contribution `claude` and a `checks` contribution `audit`
- **WHEN** UninstallPlugin is executed
- **THEN** `uninstall()` receives `['claude']`

#### Scenario: Loads plugin via PluginLoader

- **WHEN** UninstallPlugin is executed
- **THEN** it loads the plugin via `PluginLoader`

#### Scenario: Not tied to the agents bucket

- **GIVEN** a plugin that does not contribute agents
- **WHEN** UninstallPlugin is executed
- **THEN** it calls the plugin's `uninstall` with the selected contribution ids

#### Scenario: Plugin without uninstall hook

- **GIVEN** a plugin that does not implement `uninstall`
- **WHEN** UninstallPlugin is executed
- **THEN** it completes without error

#### Scenario: Init is not called

- **WHEN** UninstallPlugin is executed
- **THEN** `init` is not called

### Requirement: Error handling

#### Scenario: Agent declaration without agent contract rejected

- **GIVEN** a plugin whose manifest declares `contributes.agents` but lacks `uninstall`
- **WHEN** `UninstallPlugin.execute()` is called
- **THEN** `PluginValidationError` is thrown

#### Scenario: Uninstall failure is wrapped

- **GIVEN** a plugin whose `uninstall()` throws
- **WHEN** `UninstallPlugin.execute()` is called
- **THEN** `PluginValidationError` naming the plugin is thrown with the original error as `cause`

#### Scenario: SpecdError from the hook propagates unchanged

- **GIVEN** a plugin whose hook throws a `SpecdError`
- **WHEN** the use case is executed
- **THEN** that same `SpecdError` is rethrown without wrapping
