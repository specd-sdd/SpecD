# Verification: plugin-manager:update-plugin-use-case

## Requirements

### Requirement: Input

#### Scenario: Input includes pluginName and config

- **WHEN** `UpdatePlugin.execute()` is called
- **THEN** the input includes `pluginName` and `config`
- **AND** optional plugin-specific options

### Requirement: Output

#### Scenario: Output indicates success or failure

- **WHEN** `UpdatePlugin.execute()` completes
- **THEN** output includes `success: boolean`, `message: string`, and optional `data`

### Requirement: Behavior

#### Scenario: Loads plugin via PluginLoader

- **WHEN** UpdatePlugin is executed
- **THEN** it loads the plugin via `PluginLoader`

#### Scenario: Selection is preserved

- **GIVEN** a plugin declaring `a` and `b` and a selection `['a']`
- **WHEN** UpdatePlugin is executed
- **THEN** `install()` receives `['a']` and `b` is not activated

#### Scenario: Selected id removed by new version

- **GIVEN** a selection `['a']` and an updated manifest that no longer declares `a`
- **WHEN** UpdatePlugin is executed
- **THEN** UnknownContributionError is thrown

#### Scenario: Plugin not found

- **WHEN** UpdatePlugin is executed with a non-existent plugin
- **THEN** `PluginNotFoundError` is thrown

#### Scenario: Output shape

- **WHEN** UpdatePlugin completes
- **THEN** the output has `success`, `message` and `contributions`, and no `defaultConfig`

#### Scenario: Update is idempotent

- **GIVEN** the same input
- **WHEN** UpdatePlugin is executed twice
- **THEN** both calls succeed with the same output and `install()` received the same ids both times

#### Scenario: Mixed kinds pass only agents ids to the hook

- **GIVEN** a plugin declaring `agents` contribution `claude` and a `checks` contribution `audit`
- **WHEN** UpdatePlugin is executed
- **THEN** `install()` receives `['claude']` and the output `contributions` is `['claude']`

#### Scenario: Config is not modified

- **WHEN** UpdatePlugin is executed
- **THEN** no config is written

### Requirement: Idempotency

#### Scenario: Multiple updates produce same result

- **GIVEN** a valid `SpecdConfig` is provided
- **WHEN** UpdatePlugin is executed twice with same configuration
- **THEN** both return the same result

### Requirement: Error handling

#### Scenario: Agent declaration without agent contract rejected

- **GIVEN** a plugin whose manifest declares `contributes.agents` but lacks `install` or `uninstall`
- **WHEN** `UpdatePlugin.execute()` is called
- **THEN** `PluginValidationError` is thrown

#### Scenario: Update failure is wrapped

- **GIVEN** a plugin whose `install()` throws during update
- **WHEN** `UpdatePlugin.execute()` is called
- **THEN** `PluginValidationError` naming the plugin is thrown with the original error as `cause`

#### Scenario: SpecdError from the hook propagates unchanged

- **GIVEN** a plugin whose hook throws a `SpecdError`
- **WHEN** the use case is executed
- **THEN** that same `SpecdError` is rethrown without wrapping
