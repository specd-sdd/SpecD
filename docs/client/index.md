---
title: Studio client
sidebar_position: 1
---

# `@specd/client`

TypeScript client for SpecD Studio and automation. It defines the **`SpecdDataPort`** interface that `@specd/ui` hooks use, plus adapters that implement that port over HTTP, memory fixtures, or (desktop) IPC.

| Topic             | Page                                            |
| ----------------- | ----------------------------------------------- |
| Port surface      | [SpecdDataPort](./specd-data-port.md)           |
| HTTP / Studio API | [Remote adapter](./remote-adapter.md)           |
| Connection modes  | [Connection profiles](./connection-profiles.md) |
| HTTP layer        | [HTTP transport](./http-transport.md)           |
| Failures          | [Errors](./errors.md)                           |
| REST catalogue    | [API routes](../api/routes.md)                  |
| DTO shapes        | [API DTOs](../api/dtos.md)                      |
| OpenAPI           | [openapi.json](../api/openapi.md)               |

## Package layout

```text
packages/client/src/
  specd-data-port.ts      # aggregated port type
  port-*.ts               # method groups (project, changes, graph, …)
  adapter-remote-*.ts     # RemoteSpecdDataAdapter
  adapter-memory-*.ts     # MemorySpecdDataAdapter (tests, Storybook)
  port-http-transport.ts  # fetch-based JSON transport
  adapter-bearer-auth.ts
  adapter-problem-json-errors.ts
  dto/                    # mirrors API response shapes
  inputs.ts               # request input types
  types/connection-profile.ts
  ipc/                    # desktop envelope helpers
```

The client has **no dependency on `@specd/core`** at runtime — only shared DTO shapes and HTTP contracts aligned with `@specd/api`.

## Quick example

```typescript
import { createRemoteSpecdDataAdapter } from '@specd/client'

const data = createRemoteSpecdDataAdapter({
  apiBaseUrl: 'http://127.0.0.1:4450/v1',
})

const status = await data.getProjectStatus()
const changes = await data.listChanges()
```

Use `testRemoteConnection({ apiBaseUrl })` to probe `/health` before showing the Studio connect UI.
