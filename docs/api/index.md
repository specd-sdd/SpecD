---
title: Studio HTTP API
sidebar_position: 1
---

# SpecD Studio HTTP API (`@specd/api`)

The Studio API is a **Fastify HTTP adapter** over `@specd/core`. It exposes project, change, spec, graph, and Studio-panel operations as JSON under `/v1`.

| Topic                   | Page                                  |
| ----------------------- | ------------------------------------- |
| Runtime model           | [Overview](./overview.md)             |
| Route catalogue         | [Routes](./routes.md)                 |
| Request/response shapes | [DTOs](./dtos.md)                     |
| OpenAPI JSON            | [OpenAPI](./openapi.md)               |
| Error responses         | [Errors](./errors.md)                 |
| Auth (v1)               | [Authentication](./authentication.md) |
| Run locally             | [CLI: `specd serve`](../cli/serve.md) |

## Base URL

When started with `specd serve` or `specd ui serve` (default port **4450**):

```text
http://127.0.0.1:4450/v1
```

All routes below are relative to `/v1`. Discovery:

```http
GET /v1/health
GET /v1/openapi.json
```

`openapi.json` is the full **OpenAPI 3.1** document (paths + component schemas). See [how to obtain it](./openapi.md). Narrative references: [Routes](./routes.md), [DTOs](./dtos.md).

## Consumers

- **SpecD Studio UI** — via `@specd/client` (`RemoteSpecdDataAdapter`)
- **Custom tools** — any HTTP client; use `Authorization: Bearer` when auth is enabled (future)
- **Tests** — `@specd/api` Vitest suite with in-process server helpers

The API does **not** invoke the `specd` CLI or MCP per request.

## Package

Monorepo path: `packages/api`. Depends on `@specd/core` and `@specd/code-graph` only.
