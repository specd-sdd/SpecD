# plugin-ui-studio:bundle-plugin

## Purpose

End-user projects and distribution installs need a published npm package that ships a pre-built Studio SPA. `@specd/plugin-ui-studio` is the default `plugins.ui` entry: static assets only, same origin as the API when used with `specd ui serve`.

## Requirements

### Requirement: package is a UI plugin

The package MUST ship `specd-plugin.json` with `pluginType: "ui"` and `staticDir: "dist"`.

The factory entrypoint MUST be the package default export or `create()` as defined by `plugin-manager:plugin-loader`.

### Requirement: create returns bundle UiPlugin

`create()` MUST return a `plugin-manager:ui-plugin-type` instance from `createBundleUiPlugin` with:

- `hasServer() === false`
- `getStaticRoot()` resolving to `<packageRoot>/dist`
- `name` and `version` read from the manifest (not hardcoded in source)

### Requirement: install validates dist

`install()` MUST call bundle install validation: when `requireBuiltDist` is not `false`, missing `dist/index.html` MUST throw `core:ui-plugin-errors` `UiPluginBundleMissingError`.

### Requirement: dist is produced from studio-web

The release build pipeline MUST populate `packages/plugin-ui-studio/dist` from `apps/specd-studio-web` build output (copy or equivalent) before publish; the package MUST NOT require consumers to build the monorepo app themselves.

### Requirement: plugins install wiring

`specd plugins install @specd/plugin-ui-studio` MUST use `InstallUiPlugin` and append the package to `plugins.ui` via CLI `ConfigWriter` (not `plugins.agents`).

## Spec Dependencies

- [`plugin-manager:ui-plugin-type`](../plugin-manager/ui-plugin-type/spec.md) — UI contract and bundle factory
- [`studio-web:vite-host`](../../studio-web/vite-host/spec.md) — source of the built SPA
- [`core:ui-plugin-errors`](../../core/ui-plugin-errors/spec.md) — missing bundle error
