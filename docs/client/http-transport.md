---
title: HTTP transport
sidebar_position: 5
---

# HTTP transport

Low-level JSON HTTP used by [`RemoteSpecdDataAdapter`](./remote-adapter.md). Most callers use the port adapter instead of touching transport directly.

## createHttpTransport

```typescript
import { createHttpTransport } from '@specd/client'

const transport = createHttpTransport({
  apiBaseUrl: 'http://127.0.0.1:4450/v1',
  headers: { 'X-Custom': 'value' },
})

const project = await transport.request<ProjectDto>({
  method: 'GET',
  path: '/project',
})
```

| Option       | Description                                                       |
| ------------ | ----------------------------------------------------------------- |
| `apiBaseUrl` | Base URL; paths are relative to `/v1` after `normalizeApiBaseUrl` |
| `headers`    | Merged on every request                                           |

## HttpRequestOptions

| Field     | Description                               |
| --------- | ----------------------------------------- |
| `method`  | HTTP verb                                 |
| `path`    | Path under `/v1` (leading slash optional) |
| `query`   | Query record (omitted keys skipped)       |
| `body`    | JSON-serialized body                      |
| `headers` | Per-request headers                       |
| `signal`  | `AbortSignal`                             |

## Composable adapters

| Module                           | Role                                            |
| -------------------------------- | ----------------------------------------------- |
| `adapter-bearer-auth.ts`         | Adds `Authorization: Bearer` when token present |
| `adapter-problem-json-errors.ts` | Maps non-2xx problem+json to `SpecdClientError` |

`RemoteSpecdDataAdapter` stacks: `createHttpTransport` → `withBearerAuth` → `withProblemJsonErrors`.

## HttpTransportError

Raw HTTP failures (non-JSON body, network) surface as `HttpTransportError` before problem-json mapping. Higher layers may wrap these for UI display.

## Custom adapters

Implement `HttpTransport` to add logging, retries, or alternate backends while reusing port method bodies — or implement `SpecdDataPort` directly for non-HTTP transports (memory, IPC).
