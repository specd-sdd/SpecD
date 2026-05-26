# Verification: Serve Ui

## Requirements

### Requirement: ui serve inherits serve-api flags plus open

#### Scenario: ui-dist flag is not registered

- **WHEN** `specd ui serve --help` is run
- **THEN** output does not list `--ui-dist`
- **AND** `--open` is listed

### Requirement: ui serve loads the configured UI plugin

#### Scenario: Missing plugins.ui throws UiPluginNotConfiguredError

- **GIVEN** `specd.yaml` has no `plugins.ui` entry
- **WHEN** `specd ui serve` runs
- **THEN** the command exits non-zero
- **AND** stderr shows `error:` with `UI_PLUGIN_NOT_CONFIGURED` semantics via `UiPluginNotConfiguredError`
- **AND** the message mentions `specd plugins install` with `@specd/plugin-ui-studio` or `@specd/studio-web`
- **AND** the message does not instruct editing `plugins.ui` manually in `specd.yaml`

### Requirement: embedded plugins mount static dist on the API

#### Scenario: Bundle plugin passes uiDistPath

- **GIVEN** active UI plugin has `hasServer() === false`
- **WHEN** `specd ui serve` starts
- **THEN** `createApiServer` receives `uiDistPath` from `getStaticRoot()`

### Requirement: own-server plugins start after API listen

#### Scenario: Own-server plugin receives apiBaseUrl in init

- **GIVEN** active UI plugin has `hasServer() === true`
- **WHEN** API is listening and `init` runs
- **THEN** `UiServeContext.apiBaseUrl` ends with `/v1`

### Requirement: embedded Studio skips remote connect gate

#### Scenario: Bundle plugin uses same-origin API

- **GIVEN** active UI plugin has `hasServer() === false`
- **WHEN** the user opens the embedded Studio URL
- **THEN** the client uses same-origin `/v1` without showing `ui:connect-panel` first
