# ui serve

`specd ui serve` starts **SpecD Studio**: the HTTP API plus the active UI plugin declared under `plugins.ui` in `specd.yaml`.

## Command

```bash
specd ui serve [options]
```

## Options

| Option                | Default      | Description                                     |
| --------------------- | ------------ | ----------------------------------------------- |
| `-p, --port <number>` | `4450`       | API listen port                                 |
| `-h, --host <host>`   | `127.0.0.1`  | API bind address                                |
| `-c, --config <path>` | (discovered) | Path to `specd.yaml`                            |
| `--auth <type>`       | from config  | v1 supports only `disabled`                     |
| `-o, --open`          | off          | Open the IDE in the default browser after start |

## Behavior

1. Load config and resolve the first `plugins.ui` entry (see [Studio getting started](../studio/getting-started.md)).
2. Start the API server on the configured host/port.
3. Call `uiPlugin.init({ config, apiBaseUrl })` with `apiBaseUrl` set to `{listenUrl}/v1`.
4. **Bundle plugin** (`staticDir` in manifest): pass `uiDistPath` to the API so the SPA is served from the API origin; stderr reports `Studio UI (embedded)`.
5. **Server plugin** (`hasServer()`): plugin starts its dev server (for example Vite); CLI merges the plugin UI origin into API CORS; stderr reports `Studio UI (plugin server)` and the UI URL.
6. On shutdown (Ctrl+C), call `uiPlugin.destroy()` then close the API server.

If no UI plugin is declared, the command fails with `UiPluginNotConfiguredError` and instructions to run `specd plugins install @specd/plugin-ui-studio` or `@specd/studio-web`.

## Installing the UI plugin

```bash
specd plugins install @specd/plugin-ui-studio
# or, for Vite HMR development:
specd plugins install @specd/studio-web
```

Install persists under `plugins.ui` in `specd.yaml`. See [`plugins install`](./plugins-install.md).

## Related

- [`serve`](./serve.md) — API only
- [Studio architecture](../studio/architecture.md)
- [Configuration: `plugins.ui`](../config/config-reference.md#plugins)
