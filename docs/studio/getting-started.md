---
title: Getting started
sidebar_position: 2
---

# Getting started with SpecD Studio

## Prerequisites

- A SpecD project with a valid `specd.yaml` (see [Setting up](../guide/_sections/getting-started/setting-up.md)).
- A built CLI and UI packages in the monorepo, or published npm packages for `@specd/plugin-ui-studio` / `@specd/studio-web`.

## Choose a UI plugin

Studio loads **one** UI plugin: the first entry under `plugins.ui` in `specd.yaml`. Install via the CLI — do not hand-edit `plugins.ui` unless you know the package name.

| Package                   | Mode                                                  | Typical use                        |
| ------------------------- | ----------------------------------------------------- | ---------------------------------- |
| `@specd/plugin-ui-studio` | **Bundle** — static files served from the API origin  | Day-to-day IDE, demos, CI fixtures |
| `@specd/studio-web`       | **Own server** — Vite dev server on a separate origin | UI development with HMR            |

```bash
# Production-style embedded UI (same origin as API)
specd plugins install @specd/plugin-ui-studio

# Local UI development (Vite on another port)
specd plugins install @specd/studio-web
```

Each plugin ships a `specd-plugin.json` with `"pluginType": "ui"`. Bundle plugins declare `"staticDir"` (for example `dist`). Server plugins implement `hasServer()` and expose `getServerUrl()` after `init()`.

## Run embedded Studio

```bash
specd ui serve
```

Options:

| Flag           | Default      | Description                             |
| -------------- | ------------ | --------------------------------------- |
| `-p, --port`   | `4450`       | API listen port                         |
| `-h, --host`   | `127.0.0.1`  | Bind address                            |
| `-c, --config` | (discovered) | Path to `specd.yaml`                    |
| `--auth`       | from config  | v1 supports only `disabled`             |
| `-o, --open`   | off          | Open the IDE URL in the default browser |

**Bundle plugin** (`@specd/plugin-ui-studio`): the API serves the SPA at the same origin (for example `http://127.0.0.1:4450/`). The UI talks to `http://127.0.0.1:4450/v1` without extra CORS configuration.

**Server plugin** (`@specd/studio-web`): the CLI starts the API, then the plugin starts Vite (default port **5174**). The CLI merges the plugin’s UI origin into API CORS and passes `apiBaseUrl` into the plugin so the renderer connects to the API automatically. You should not need to type the API URL into the connect panel when using `specd ui serve`.

## API only

When integrating a custom front end or debugging HTTP handlers:

```bash
specd serve
```

Same host, port, and auth defaults as `specd ui serve`, but no UI plugin is loaded. See [`serve`](../cli/serve.md).

## Example `specd.yaml`

```yaml
schema: '@specd/schema-std'

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/

storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive

plugins:
  agents:
    - name: '@specd/plugin-agent-claude'
  ui:
    - name: '@specd/plugin-ui-studio'

api:
  auth:
    type: disabled
  cors:
    origins:
      - http://localhost:5174
```

The `api.cors.origins` list is optional for bundle mode. For a dev-server UI plugin, `specd ui serve` also adds the plugin server origin automatically; extra origins are for standalone clients.

Full field reference: [Configuration reference — `api`](../config/config-reference.md#api) and [`plugins`](../config/config-reference.md#plugins).

## Troubleshooting

| Symptom                                      | Likely cause                                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Error: no UI plugin configured               | Run `specd plugins install @specd/plugin-ui-studio` (or `@specd/studio-web`)                                                                 |
| `pluginType` validation failed on install    | CLI/build older than UI plugin support — use a build that includes `ui` in the plugin manifest schema                                        |
| Browser “Failed to fetch” against API        | UI and API on different origins without CORS — use `specd ui serve` (not manual Vite + separate API) or add origins under `api.cors.origins` |
| Connect panel asks for API URL on `ui serve` | Usually means the injected API base was not passed — rebuild `@specd/studio-web` / `@specd/ui` and restart `specd ui serve`                  |

## Next steps

- [Packages](./packages.md) — what each workspace package does
- [Architecture](./architecture.md) — how requests flow from browser to kernel
- [Configuration example: Studio local](../config/examples/studio-local.md)
