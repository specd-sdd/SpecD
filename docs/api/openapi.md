---
title: OpenAPI
sidebar_position: 6
---

# OpenAPI document

The Studio API publishes an **OpenAPI 3.1** JSON document at:

```http
GET /v1/openapi.json
```

Relative to your API origin (default `http://127.0.0.1:4450`).

## How to obtain it

### 1. With a running server (recommended)

Start the API from your project root:

```bash
specd serve
# or embedded Studio:
specd ui serve
```

Then fetch the document:

```bash
curl -sS http://127.0.0.1:4450/v1/openapi.json | jq .info
```

Save to a file:

```bash
curl -sS http://127.0.0.1:4450/v1/openapi.json -o specd-studio-openapi.json
```

With auth enabled in a future release, pass the same `Authorization: Bearer` header you use for other `/v1` routes.

### 2. From the monorepo (no server)

The document is assembled in TypeScript:

- `packages/api/src/delivery/openapi/openapi-doc.ts` — root export `OPENAPI_DOC`
- `packages/api/src/delivery/openapi/openapi-schemas.ts` — `components.schemas`
- `packages/api/src/delivery/openapi/openapi-paths.ts` — `paths`

After building `@specd/api`, you can import and serialize it from a small script, or rely on the Vitest meta test which asserts the served document shape.

### 3. In tests

`packages/api/test/meta.spec.ts` calls `GET /openapi.json` on the in-process test server and checks version, schemas, and representative paths.

## What it contains

| Section                                 | Source                                            |
| --------------------------------------- | ------------------------------------------------- |
| `paths`                                 | All `/v1` routes registered in `registerV1Routes` |
| `components.schemas`                    | DTOs under `packages/api/src/delivery/http/dto/`  |
| `components.securitySchemes.bearerAuth` | Reserved for future token auth                    |

Wildcard spec routes are modeled as `/workspaces/{ws}/specs/{specPath}` with a note that `specPath` may include slashes. The live server also accepts deeper wildcard paths the same way Fastify does.

## Tooling

Import `specd-studio-openapi.json` into:

- [Swagger UI](https://swagger.io/tools/swagger-ui/)
- [Redoc](https://github.com/Redocly/redoc)
- OpenAPI code generators (TypeScript fetch clients, etc.)

For day-to-day field semantics, see [DTO reference](./dtos.md). For narrative route descriptions, see [Routes](./routes.md).

## Keeping it accurate

When you add or change an API route or DTO:

1. Update the handler and presenter under `packages/api/src/delivery/http/`.
2. Update `openapi-schemas.ts` and/or `openapi-paths.ts` in the same change.
3. Update [DTOs](./dtos.md) and [Routes](./routes.md) if behaviour is user-visible.

The meta test guards against regressions on key paths but does not diff the full catalogue automatically.
