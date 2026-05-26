# Verification: plugin-manager:ui-plugin-type

## Requirements

### Requirement: UiPlugin extends SpecdPlugin

#### Scenario: Bundle plugin reports no server

- **GIVEN** `createBundleUiPlugin` with a package root containing `dist/index.html`
- **WHEN** the plugin is created
- **THEN** `hasServer()` is `false`
- **AND** `getStaticRoot()` ends with `dist`

#### Scenario: Own-server plugin reports server URL

- **GIVEN** `createServerUiPlugin` with `serverPort` 5174
- **WHEN** the plugin is created
- **THEN** `hasServer()` is `true`
- **AND** `getServerUrl()` is `http://127.0.0.1:5174`

### Requirement: UiServeContext

#### Scenario: apiBaseUrl is required for own-server init

- **GIVEN** a UI plugin with `hasServer() === true` during `specd ui serve`
- **WHEN** `init` is called
- **THEN** the context includes `apiBaseUrl` ending with `/v1`

### Requirement: UiInstallOptions and UiInstallResult

#### Scenario: Install returns staticRoot summary

- **GIVEN** a bundle UI plugin with `dist/index.html`
- **WHEN** `InstallUiPlugin.execute` completes
- **THEN** `data.staticRoot` is set
- **AND** `data.hasIndexHtml` is `true`

### Requirement: Bundle and own-server factories

#### Scenario: createServerUiPlugin exposes own-server URL

- **WHEN** `createServerUiPlugin` is called with `serverPort` 5199
- **THEN** `getServerUrl()` is `http://127.0.0.1:5199`

### Requirement: UI plugin manifest (`specd-plugin.json`)

#### Scenario: Loader accepts ui pluginType and optional staticDir

- **GIVEN** a package with `specd-plugin.json` containing `pluginType: "ui"` and `staticDir: "dist"`
- **WHEN** `PluginLoader.load` runs against a valid `create()` export
- **THEN** manifest validation passes
- **AND** the runtime plugin satisfies `isUiPlugin`

#### Scenario: Own-server manifest has no staticDir

- **GIVEN** a UI plugin manifest with `pluginType: "ui"`, no `staticDir`, and a runtime plugin with `hasServer() === true`
- **WHEN** the package is loaded
- **THEN** manifest validation passes
- **AND** `getServerUrl()` is defined

#### Scenario: Bundle factory honors manifest staticDir

- **GIVEN** a bundle UI plugin factory that reads `staticDir: "out"` from its manifest
- **WHEN** `create()` runs
- **THEN** `getStaticRoot()` ends with `out`

### Requirement: isUiPlugin type guard

#### Scenario: Bundle factory passes guard

- **WHEN** `createBundleUiPlugin` builds a plugin
- **THEN** `isUiPlugin(plugin)` is `true`

#### Scenario: Agent plugin fails guard

- **GIVEN** a loaded agent plugin instance
- **WHEN** `isUiPlugin(plugin)` runs
- **THEN** the result is `false`

### Requirement: PLUGIN_TYPES includes ui

#### Scenario: PLUGIN_TYPES lists agent and ui

- **WHEN** `PLUGIN_TYPES` is imported from `@specd/plugin-manager`
- **THEN** it equals `['agent', 'ui']`

### Requirement: InstallUiPlugin use case

#### Scenario: Missing dist fails install when required

- **GIVEN** a bundle UI plugin whose `dist/index.html` is absent
- **WHEN** `InstallUiPlugin.execute` runs with default options
- **THEN** install throws `UiPluginBundleMissingError`

#### Scenario: InstallPlugin rejects UI plugins

- **GIVEN** a UI plugin loaded by name
- **WHEN** `InstallPlugin.execute` runs
- **THEN** it throws `PluginValidationError` mentioning `InstallUiPlugin`
