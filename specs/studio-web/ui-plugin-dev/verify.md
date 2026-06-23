# Verification: studio-web:ui-plugin-dev

## Requirements

### Requirement: package is a UI plugin

#### Scenario: Manifest declares ui type

- **WHEN** `apps/specd-studio-web/specd-plugin.json` is read
- **THEN** `pluginType` is `ui`

### Requirement: create returns own-server UiPlugin

#### Scenario: Factory enables own-server mode

- **WHEN** `create()` resolves the plugin
- **THEN** `hasServer()` is `true`
- **AND** `getServerUrl()` matches `http://127.0.0.1:5174`

### Requirement: init starts Vite with API base

#### Scenario: SPECD_API_BASE_URL is passed to Vite

- **GIVEN** `UiServeContext.apiBaseUrl` is `http://127.0.0.1:4400/v1`
- **WHEN** `init` runs
- **THEN** the spawned Vite process environment includes `SPECD_API_BASE_URL=http://127.0.0.1:4400/v1`

### Requirement: own-server vs embedded bundle selection

#### Scenario: ui serve help has no dev flag

- **WHEN** `specd ui serve --help` runs
- **THEN** output does not list `--dev`
- **AND** plugin selection is documented as `plugins.ui` configuration
