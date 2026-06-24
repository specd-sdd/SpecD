---
title: Packages
sidebar_position: 3
---

# Studio packages

Studio spans several workspace packages. Dependencies must stay acyclic: `ui → client`, `api → core, code-graph`, apps depend on `ui` and/or `api`, not the reverse.

## `@specd/api`

HTTP delivery adapter for SpecD. **Documentation:** [Studio HTTP API](../api/index.md).

- Resolves `SpecdConfig` and builds a `Kernel` via the same composition path as the CLI.
- Exposes REST routes under `/v1` with Zod-validated DTOs and RFC 7807-style problem responses.
- Optionally serves a **bundle** UI from disk when `uiDistPath` is set (used by `specd ui serve` with `@specd/plugin-ui-studio`).
- Supports extra CORS origins for browser clients on other hosts (dev-server UI plugins, custom apps).

Not used: subprocess calls to `specd` CLI or MCP.

## `@specd/client`

TypeScript client for Studio and automation. **Documentation:** [Studio client](../client/index.md).

- Defines `SpecdDataPort` (changes, specs, workspaces, graph, project).
- `RemoteSpecdDataAdapter` — HTTP transport against `@specd/api`.
- Shared DTO types aligned with API presenters.

## `@specd/ui`

React IDE shell shared by web and desktop renderers.

- Consumes `SpecdDataPort` from React context (remote or in-memory adapters in tests).
- No imports from `@specd/core` filesystem adapters — all data through the port.
- Major surfaces: connect gate, change overview, artifact editor, graph status, inspector save flows.

## `@specd/plugin-manager` (UI plugin types)

Extends plugin loading for `pluginType: "ui"`:

- **Bundle UI plugin** — `staticDir` in `specd-plugin.json`; `getStaticRoot()` for API static hosting.
- **Server UI plugin** — `hasServer()`, `init({ apiBaseUrl })`, `getServerUrl()` for Vite or similar.

Install/uninstall use cases: `InstallUiPlugin` / agent `InstallPlugin` split by type.

## `@specd/plugin-ui-studio`

Published **bundle** UI plugin for embedded `specd ui serve`. The SPA in `dist/` is **not** built inside this package — it is copied from `@specd/studio-web` after `vite build`.

```json
{
  "pluginType": "ui",
  "staticDir": "dist"
}
```

`dist/` layout after a full bundle build:

| Path                     | Source                                        |
| ------------------------ | --------------------------------------------- |
| `index.html`, `assets/*` | `apps/specd-studio-web/dist` (Vite)           |
| `index.js`, `index.d.ts` | `packages/plugin-ui-studio/src` (tsup loader) |

**Build (monorepo):**

```bash
pnpm --filter @specd/studio-web build
# or: pnpm studio-plugin:build
```

That runs Vite, builds the dev-server plugin entry for `studio-web`, then `apps/specd-studio-web/scripts/sync-plugin-ui-studio.mjs` copies the SPA into `packages/plugin-ui-studio/dist` and aligns `version` in `package.json` + `specd-plugin.json` with `@specd/studio-web`.

Root `pnpm build` **does not** invoke `@specd/plugin-ui-studio#build` (avoids a placeholder-only dist). Turbo still runs `@specd/studio-web#build`, which refreshes the published bundle.

To rebuild only the loader after sync: `pnpm --filter @specd/plugin-ui-studio build`.

## `@specd/studio-web` (`apps/specd-studio-web`)

**Server** UI plugin wrapping the Vite dev server.

- `pnpm dev` — Vite alone (standalone connect flow; useful for UI-only work).
- `specd ui serve` — CLI starts API + plugin; Vite receives `apiBaseUrl` via `UiServeContext`.

## `apps/specd-studio-desktop`

Electron application: main process can host core locally; renderer reuses `@specd/ui` with an IPC-backed data adapter (see design doc for desktop auth and process model).

- Local graph operations import `@specd/code-graph-electron`, not `@specd/code-graph`.
- `@specd/code-graph-electron` is an internal workspace package used only to isolate the Electron-native `better-sqlite3` runtime path from the Node runtime used by CLI and API.
- The vendored sqlite tree under `packages/code-graph-electron/vendor/` is generated locally and is not committed to git.
- Rebuild the Electron-targeted sqlite addon with `pnpm --filter @specd/studio-desktop rebuild:graph-electron`. Desktop `prestart` and `build` run this automatically; the first run on a fresh clone may compile native code.

## `@specd/cli` commands

| Command                   | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| `specd ui serve`          | API + active `plugins.ui` plugin         |
| `specd serve`             | API only                                 |
| `specd plugins install …` | Records `plugins.agents` or `plugins.ui` |

Agent plugins remain under `plugins.agents`; UI plugins are not bundled inside the CLI package — install them like any other npm dependency and declare them in config.
