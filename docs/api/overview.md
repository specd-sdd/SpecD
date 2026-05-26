---
title: Overview
sidebar_position: 2
---

# API overview

## Startup

1. Load `SpecdConfig` from the project `specd.yaml` (same discovery as the CLI).
2. `createKernel(config, …)` — one kernel per API process.
3. Register Fastify routes under prefix `/v1`.
4. Optionally serve a **bundle** UI from `uiDistPath` when embedded by `specd ui serve`.

There is no subprocess and no per-request CLI spawn.

## Handler pattern

```text
HTTP request
  → CORS (when configured)
  → auth middleware (v1: disabled = no token required)
  → route handler
  → kernel use case(s)
  → presenter → JSON DTO
```

Handlers stay thin: validation, call `ctx.kernel.*`, map domain errors to [problem+json](./errors.md).

Graph routes use `ctx.createGraphProvider()` from `@specd/code-graph`, not duplicated graph logic in handlers.

## Static UI (bundle plugins)

When `createApiServer({ uiDistPath })` is set:

- `GET /` and non-API paths serve the SPA (`index.html` fallback).
- `/v1/*` remains JSON API.

Server UI plugins (Vite) are **not** served by the API; they run on a separate origin and call `/v1` over HTTP.

## Configuration

From `specd.yaml`:

- [`api.auth`](../config/config-reference.md#apiauth) — v1: `type: disabled` only
- [`api.cors`](../config/config-reference.md#apicors) — extra browser origins

See [Authentication](./authentication.md).

## Related

- [Studio architecture](../studio/architecture.md)
- [Design draft](../design/specd-studio-api-and-ui.md)
