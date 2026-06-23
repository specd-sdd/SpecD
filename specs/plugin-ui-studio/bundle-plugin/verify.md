# Verification: plugin-ui-studio:bundle-plugin

## Requirements

### Requirement: package is a UI plugin

#### Scenario: Manifest declares ui type

- **WHEN** `packages/plugin-ui-studio/specd-plugin.json` is read
- **THEN** `pluginType` is `ui`
- **AND** `staticDir` is `dist`

### Requirement: create returns bundle UiPlugin

#### Scenario: Factory is bundle mode

- **GIVEN** `dist/index.html` exists under the package root
- **WHEN** `create()` resolves the plugin
- **THEN** `hasServer()` is `false`
- **AND** `getStaticRoot()` contains `dist`

### Requirement: install validates dist

#### Scenario: Install without dist throws

- **GIVEN** `dist/index.html` is absent
- **WHEN** `install()` runs with default options
- **THEN** `UiPluginBundleMissingError` is thrown

### Requirement: dist is produced from studio-web

#### Scenario: Build script copies studio-web output

- **WHEN** the package `build:studio` (or release build) script runs after `studio-web` build
- **THEN** `packages/plugin-ui-studio/dist/index.html` exists

### Requirement: plugins install wiring

#### Scenario: Install targets plugins.ui

- **GIVEN** `specd plugins install @specd/plugin-ui-studio` succeeds
- **WHEN** `specd.yaml` is read
- **THEN** `plugins.ui` contains an entry with `name` `@specd/plugin-ui-studio`
- **AND** `plugins.agents` is unchanged by the UI install path
