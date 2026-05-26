# serve

`specd serve` starts the **SpecD Studio HTTP API** for the current project on loopback. It does not start a UI plugin or open a browser.

## Command

```bash
specd serve [options]
```

## Options

| Option                | Default      | Description                 |
| --------------------- | ------------ | --------------------------- |
| `-p, --port <number>` | `4450`       | Listen port                 |
| `-h, --host <host>`   | `127.0.0.1`  | Bind address                |
| `-c, --config <path>` | (discovered) | Path to `specd.yaml`        |
| `--auth <type>`       | from config  | v1 supports only `disabled` |

## Behavior

- Loads project config via the same discovery rules as other commands.
- Builds `createApiServer` from `@specd/api` with `projectRoot`, auth, and optional CORS from `specd.yaml`.
- Does **not** set `uiDistPath` — no embedded SPA.
- Prints the API base URL (for example `http://127.0.0.1:4450/v1`) on stderr.
- Runs until SIGINT/SIGTERM.

Use this when building a custom Studio client, running API integration tests, or debugging handlers without the UI stack.

For API **and** UI, use [`ui serve`](./ui-serve.md).

## Auth

`--auth` and `api.auth.type` must resolve to `disabled` in v1. Other values throw at startup.

## Related

- [`ui serve`](./ui-serve.md)
- [Studio getting started](../studio/getting-started.md)
- [Configuration: `api`](../config/config-reference.md#api)
