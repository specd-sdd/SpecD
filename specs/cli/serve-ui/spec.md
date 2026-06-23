# Serve Ui

## Purpose

`specd ui serve` is the “open Studio on this repo” experience: HTTP API plus the **active UI plugin** from `specd.yaml` `plugins.ui`. Bundle plugins embed static `dist/` on the API origin; own-server plugins (`hasServer() === true`) run their HTTP server after `init`.

## Requirements

### Requirement: ui serve inherits serve-api flags plus open

`specd ui serve` MUST expose all `cli:serve-api` flags and add `--open|-o`. It MUST NOT expose `--ui-dist`.

### Requirement: ui serve loads the configured UI plugin

The command MUST read the first `plugins.ui[].name` entry, load it via `plugin-manager:load-plugin-use-case`, and require a `plugin-manager:ui-plugin-type` instance.

When no UI plugin is declared, the command MUST throw `core:ui-plugin-errors` `UiPluginNotConfiguredError` (`UI_PLUGIN_NOT_CONFIGURED`) so the CLI prints a structured `SpecdError` (not a generic `Error`).

### Requirement: embedded plugins mount static dist on the API

When the active UI plugin returns `hasServer() === false`, the command MUST pass `getStaticRoot()` to `createApiServer` as `uiDistPath` so `api:http-server-static-ui` serves the bundle on the same origin as `/v1`.

### Requirement: own-server plugins start after API listen

When the active UI plugin has `hasServer() === true`, the command MUST start the API without static UI, listen, then call `init` with `UiServeContext` including `apiBaseUrl` (`{listenUrl}/v1`). It MUST print `getServerUrl()` for the plugin-owned UI server.

### Requirement: own-server ui serve merges CORS origins

When the active UI plugin has `hasServer() === true`, `specd ui serve` MUST merge the plugin UI origin (from `getServerUrl()`) into effective `api.cors.origins` for that process, in addition to any origins declared in `specd.yaml`, so the Vite host can call the API on a different port without browser CORS errors.

### Requirement: embedded Studio skips remote connect gate

When the embedded bundle is used, the client MUST use same-origin `/v1` and MUST NOT require `ui:connect-panel` before showing the IDE.

## Spec Dependencies

- [`plugin-manager:ui-plugin-type`](../../plugin-manager/ui-plugin-type/spec.md)
- [`api:composition-create-api-server`](../../api/composition-create-api-server/spec.md)
- [`cli:serve-api`](../serve-api/spec.md)
