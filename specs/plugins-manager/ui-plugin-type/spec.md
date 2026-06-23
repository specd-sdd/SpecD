# plugin-manager:ui-plugin-type

## Purpose

Studio needs a first-class **UI plugin** contract so `specd ui serve` can load either an embedded static bundle or a dev-server shell without treating UI packages as agent plugins. This spec defines `UiPlugin`, shared factories, and the `ui` entry in `PLUGIN_TYPES`.

## Requirements

### Requirement: UiPlugin extends SpecdPlugin

`UiPlugin` MUST extend `SpecdPlugin` with `type: 'ui'` and add:

- `hasServer(): boolean` — when `false`, the CLI embeds {@link getStaticRoot} via the API static middleware; when `true`, the plugin owns HTTP for the SPA.
- `getStaticRoot(): string` — absolute directory that MUST contain `index.html` when `hasServer()` is `false`.
- `getServerUrl?(): string` — REQUIRED when `hasServer()` is `true`; MUST be an `http(s)` base URL for the plugin-owned UI server.
- `install?(config, options?)` / `uninstall?(config, options?)` — optional hooks that MUST NOT mutate the project tree (no skill copies).

`init` MUST accept `PluginContext` or `UiServeContext` (extends `PluginContext` with `apiBaseUrl`).

### Requirement: UiServeContext

```typescript
interface UiServeContext extends PluginContext {
  /** Listening API base including `/v1` (e.g. `http://127.0.0.1:4400/v1`). */
  readonly apiBaseUrl: string
}
```

### Requirement: UiInstallOptions and UiInstallResult

```typescript
interface UiInstallOptions {
  readonly requireBuiltDist?: boolean // default true for bundle plugins
}

interface UiInstallResult {
  readonly staticRoot: string
  readonly hasIndexHtml: boolean
  readonly message: string
}
```

### Requirement: UI plugin manifest (`specd-plugin.json`)

UI plugin packages MUST ship `specd-plugin.json` validated by `plugin-manager:plugin-loader`. Beyond the shared agent fields (`schemaVersion`, `name`, `version`, `minCoreVersion`, optional `description`), UI plugins introduce:

| Field        | Required | Purpose                                                                                                                                                                                                                                                                                                      |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pluginType` | yes      | MUST be `"ui"`. Loader rejects unknown values and validates the runtime object with `isUiPlugin`, not `isAgentPlugin`.                                                                                                                                                                                       |
| `staticDir`  | no       | Relative directory under the package root with the built SPA (`index.html`, assets). Applies only when the plugin does **not** run its own HTTP server (`hasServer() === false`). Factory `create()` SHOULD read it and pass it to `createBundleUiPlugin({ staticDir })`. Defaults to `"dist"` when omitted. |

Rules:

- **Embedded bundle mode** (`hasServer() === false`): UI is served from the API origin via static middleware. The manifest SHOULD declare `staticDir` (typically `"dist"`).
- **Own-server mode** (`hasServer() === true`): the plugin runs its own HTTP server (e.g. Vite) and exposes `getServerUrl()`. The manifest MUST NOT declare `staticDir` for serving — `staticDir` is irrelevant because assets are not mounted on the API. `specd ui serve` prints the plugin URL instead of embedding `dist/`.
- The loader MUST accept optional `staticDir` in the Zod manifest schema when `pluginType` is `"ui"` but MUST NOT inject it into `create()` — the package factory reads the manifest and maps fields to `createBundleUiPlugin` / `createServerUiPlugin` options.
- `name` and `version` in the manifest MUST match the npm `package.json` and MUST be passed through to the runtime plugin instance (same rule as `plugin-manager:specd-plugin-type`).

Example (bundle):

```json
{
  "schemaVersion": 1,
  "name": "@specd/plugin-ui-studio",
  "version": "0.1.0",
  "pluginType": "ui",
  "staticDir": "dist",
  "minCoreVersion": "*"
}
```

Example (own server — no `staticDir`; runtime `hasServer() === true`):

```json
{
  "schemaVersion": 1,
  "name": "@specd/studio-web",
  "version": "0.0.0",
  "pluginType": "ui",
  "minCoreVersion": "*"
}
```

### Requirement: isUiPlugin type guard

The package MUST export `isUiPlugin(value: SpecdPlugin): value is UiPlugin` validating:

1. `value.type === 'ui'`
2. `hasServer` and `getStaticRoot` are functions
3. When `hasServer()` is `true`, `getServerUrl` is a function

### Requirement: Bundle and own-server factories

`@specd/plugin-manager` MUST export:

- `createBundleUiPlugin({ name, version, packageRoot, staticDir? })` — embedded mode: `hasServer() === false`, `getStaticRoot()` under `packageRoot/staticDir` (default `dist`).
- `createServerUiPlugin({ name, version, packageRoot, serverPort? })` — own-server mode: `hasServer() === true`, starts the package UI HTTP server in `init`, `getServerUrl()` on `http://127.0.0.1:<port>` (default `5174`). Does not use manifest `staticDir` for serving.

### Requirement: PLUGIN_TYPES includes ui

`PLUGIN_TYPES` (from `plugin-manager:specd-plugin-type`) MUST include `'ui'` so manifests with `pluginType: "ui"` validate at load time.

### Requirement: InstallUiPlugin use case

The application layer MUST provide `InstallUiPlugin` that loads a package, requires `isUiPlugin`, calls `install` when present, and returns `InstallPluginOutput` without mutating `specd.yaml`.

`InstallPlugin` (agent path) MUST reject UI plugins with `PluginValidationError` directing callers to `InstallUiPlugin`.

## Spec Dependencies

- [`plugin-manager:specd-plugin-type`](../../../../../specs/plugins-manager/specd-plugin-type/spec.md) — base `SpecdPlugin` and `PLUGIN_TYPES`
- [`plugin-manager:plugin-loader`](../../../../../specs/plugins-manager/plugin-loader/spec.md) — manifest validation and load workflow
- [`core:config`](../../core/config/spec.md) — `SpecdConfig` and `plugins.ui` (delta in this change)
