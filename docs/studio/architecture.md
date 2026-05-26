---
title: Architecture
sidebar_position: 4
---

# Studio architecture

## Request path

```text
Browser
  → @specd/ui (React)
  → @specd/client (SpecdDataPort / RemoteSpecdDataAdapter)
  → HTTP /v1
  → @specd/api handler
  → kernel use case (@specd/core)
  → presenter → JSON
```

Graph routes follow the same pattern but call `@specd/code-graph` through the API’s graph provider instead of duplicating graph logic in the UI.

The CLI and MCP are **not** on this path. Agents may still use MCP in parallel; Studio does not shell out to `specd` per request.

## Two UI deployment shapes

### Embedded bundle (single origin)

Used by `@specd/plugin-ui-studio`.

1. `specd ui serve` loads the bundle UI plugin.
2. `createApiServer` receives `uiDistPath` from the plugin static root.
3. API serves `index.html` and assets; API routes live under `/v1`.
4. No cross-origin requests — CORS is irrelevant for same-origin fetches.

### Dev server (two origins)

Used by `@specd/studio-web`.

1. API listens on `127.0.0.1:4450` (default).
2. Plugin starts Vite (for example `http://127.0.0.1:5174`).
3. CLI merges the plugin UI origin into API CORS and passes `apiBaseUrl` (`http://127.0.0.1:4450/v1`) to `plugin.init()`.
4. Renderer uses that base URL so users are not prompted to guess the API port.

Avoid ad-hoc Vite proxy configuration for `/v1` in the monorepo — CORS + injected base URL is the supported integration.

## Configuration touchpoints

| Concern               | `specd.yaml`                             |
| --------------------- | ---------------------------------------- |
| Which UI loads        | `plugins.ui[0].name`                     |
| Per-plugin options    | `plugins.ui[0].config` (plugin-specific) |
| API auth (v1)         | `api.auth.type` — only `disabled`        |
| Extra browser origins | `api.cors.origins`                       |

## Further reading

- [Design draft: SpecD Studio API and UI](../design/specd-studio-api-and-ui.md) — authentication roadmap, tab inventory, OpenAPI notes
- [Core documentation](../core/index.md) — domain model behind the API
