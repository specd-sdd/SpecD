# core:ui-plugin-errors

## Purpose

`specd ui serve` and UI plugin install paths MUST surface structured `SpecdError` subclasses instead of generic `Error` so the CLI and API can print consistent, actionable messages.

## Requirements

### Requirement: UiPluginNotConfiguredError

`@specd/core` MUST export `UiPluginNotConfiguredError` extending `SpecdError` with:

- `code`: `UI_PLUGIN_NOT_CONFIGURED`
- Message that directs the user to `specd plugins install @specd/plugin-ui-studio` or `@specd/studio-web` (which persists `plugins.ui` in `specd.yaml`); MUST NOT instruct manual `plugins.ui` editing

Thrown when `specd ui serve` runs and `plugins.ui` is empty or absent.

### Requirement: UiPluginTypeMismatchError

`@specd/core` MUST export `UiPluginTypeMismatchError` with:

- `code`: `UI_PLUGIN_TYPE_MISMATCH`
- Read-only `pluginName` — configured package from `plugins.ui[0].name`
- Thrown when the loaded package fails `isUiPlugin`

### Requirement: UiPluginBundleMissingError

`@specd/core` MUST export `UiPluginBundleMissingError` with:

- `code`: `UI_PLUGIN_BUNDLE_MISSING`
- Read-only `staticRoot` — path checked for `index.html`
- Thrown when a bundle UI plugin `install` requires built output and `index.html` is missing

## Spec Dependencies

- [`default:_global/error-handling-conventions`](../../../../../specs/_global/error-handling-conventions/spec.md) — `SpecdError` base contract
