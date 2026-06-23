# studio-web:ui-plugin-dev

## Purpose

Monorepo contributors need hot-reload Studio without rebuilding `dist/` on every UI change. `@specd/studio-web` is a **own-server** UI plugin (`hasServer() === true`): it runs its own Vite HTTP server during `specd ui serve` while the API stays on the CLI listen port.

## Requirements

### Requirement: package is a UI plugin

The package MUST ship `specd-plugin.json` with `pluginType: "ui"`.

### Requirement: create returns own-server UiPlugin

`create()` MUST return `createServerUiPlugin` from `@specd/plugin-manager` with:

- `hasServer() === true` (plugin-owned UI server; manifest MUST NOT declare `staticDir` for serving)
- `serverPort` default `5174` and `getServerUrl()` `http://127.0.0.1:5174`
- Manifest `name` / `version` loaded from `specd-plugin.json`

### Requirement: init starts Vite with API base

After the API is listening, `specd ui serve` MUST call `init` with `UiServeContext.apiBaseUrl` ending in `/v1`.

`init` MUST spawn Vite (`pnpm exec vite --port <port> --strictPort`) in the package root and MUST set `SPECD_API_BASE_URL` in the child environment when `apiBaseUrl` is provided.

`destroy` MUST terminate the Vite child process.

### Requirement: own-server vs embedded bundle selection

Projects MUST choose exactly one active UI plugin via `plugins.ui[0]`:

- Own server (Vite): `@specd/studio-web` (this spec)
- Embedded bundle (`staticDir` / API origin): `@specd/plugin-ui-studio` (`plugin-ui-studio:bundle-plugin`)

The CLI MUST NOT expose a `--dev` flag; switching plugins is configuration-only.

## Spec Dependencies

- [`plugin-manager:ui-plugin-type`](../plugin-manager/ui-plugin-type/spec.md) — own-server factory and `UiServeContext`
- [`cli:serve-ui`](../../cli/serve-ui/spec.md) — startup order and `init` contract
- [`studio-web:vite-host`](../vite-host/spec.md) — Vite app host and proxy to `/v1`
