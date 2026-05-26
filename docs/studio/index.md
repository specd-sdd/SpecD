---
title: SpecD Studio
sidebar_position: 1
---

# SpecD Studio

SpecD Studio is the **spec-work IDE** for SpecD projects. It is not a generic dashboard: the UI is organized around **changes**, **workspaces**, and **specs**, matching the same lifecycle model as the CLI and agent skills.

Studio is delivered as:

| Piece               | Package / app               | Role                                                                           |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| HTTP API            | `@specd/api`                | Fastify adapter over `@specd/core` (and `@specd/code-graph` for graph routes)  |
| Data client         | `@specd/client`             | `SpecdDataPort` + remote HTTP adapter consumed by the UI                       |
| React shell         | `@specd/ui`                 | Shared IDE components (no direct filesystem access)                            |
| Published UI bundle | `@specd/plugin-ui-studio`   | UI plugin with pre-built static assets (production-style `specd ui serve`)     |
| Dev UI plugin       | `@specd/studio-web`         | Vite dev server plugin for local UI development                                |
| Browser app         | `apps/specd-studio-web`     | Wires `@specd/ui` + plugin entry for dev and builds                            |
| Desktop app         | `apps/specd-studio-desktop` | Electron shell (renderer uses `@specd/ui`; main process can host core locally) |

The marketing and handbook site (`apps/public-web`) is separate from Studio. Studio docs live under **Studio** in this site and in [`docs/design/specd-studio-api-and-ui.md`](../design/specd-studio-api-and-ui.md) for deeper API and tab design notes.

## Quick start

1. Install a UI plugin and record it in `specd.yaml`:

   ```bash
   specd plugins install @specd/plugin-ui-studio
   ```

   For UI development with hot reload, use `@specd/studio-web` instead (see [Getting started](./getting-started.md)).

2. Start the embedded stack:

   ```bash
   specd ui serve --open
   ```

   Default API listen address: `http://127.0.0.1:4450` (API base path `/v1`).

See [Getting started](./getting-started.md) for bundle vs dev-server plugins, CORS, and configuration.

## Documentation map

- [Getting started](./getting-started.md) — install plugins, run `specd ui serve` / `specd serve`
- [Packages](./packages.md) — monorepo layout and dependencies
- [Architecture](./architecture.md) — runtime model (API, UI plugin, no CLI in the request path)
- [Studio HTTP API](../api/index.md) — `/v1` routes, errors, auth
- [Studio client (`@specd/client`)](../client/index.md) — `SpecdDataPort`, remote adapter
- [Configuration](../config/config-reference.md#api) — `api` and `plugins.ui` in `specd.yaml`
- [CLI: `ui serve`](../cli/ui-serve.md) — embedded Studio command
- [CLI: `serve`](../cli/serve.md) — API-only server
