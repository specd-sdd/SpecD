# Verification: core:ui-plugin-errors

## Requirements

### Requirement: UiPluginNotConfiguredError

#### Scenario: Error code is stable

- **WHEN** `UiPluginNotConfiguredError` is constructed
- **THEN** `code` equals `UI_PLUGIN_NOT_CONFIGURED`

#### Scenario: Message points to plugins install only

- **WHEN** `UiPluginNotConfiguredError` is constructed
- **THEN** the message includes `specd plugins install` with `@specd/plugin-ui-studio` or `@specd/studio-web`
- **AND** the message does not instruct manual `plugins.ui` editing in `specd.yaml`

### Requirement: UiPluginTypeMismatchError

#### Scenario: pluginName is exposed

- **WHEN** `UiPluginTypeMismatchError` is thrown for `@specd/foo`
- **THEN** `pluginName` is `@specd/foo`

### Requirement: UiPluginBundleMissingError

#### Scenario: staticRoot is exposed

- **WHEN** `UiPluginBundleMissingError` is thrown for `/var/dist`
- **THEN** `staticRoot` is `/var/dist`
