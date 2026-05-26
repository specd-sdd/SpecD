---
title: Remote adapter
sidebar_position: 3
---

# RemoteSpecdDataAdapter

HTTP implementation of [`SpecdDataPort`](./specd-data-port.md) for web Studio and remote desktop profiles.

## Create

```typescript
import { createRemoteSpecdDataAdapter, testRemoteConnection } from '@specd/client'

const apiBaseUrl = 'http://127.0.0.1:4450/v1'

const ok = await testRemoteConnection({ apiBaseUrl })
if (!ok) {
  throw new Error('API unreachable')
}

export const specdData = createRemoteSpecdDataAdapter({
  apiBaseUrl,
  bearerToken: undefined, // optional; v1 local API usually omits
})
```

`createRemoteSpecdDataAdapter` is an alias for `new RemoteSpecdDataAdapter(options)`.

## Options

| Field         | Description                                                                 |
| ------------- | --------------------------------------------------------------------------- |
| `apiBaseUrl`  | API origin; may include or omit `/v1` — normalized by `normalizeApiBaseUrl` |
| `bearerToken` | Optional token; wrapped as `Authorization: Bearer`                          |

## Request pipeline

```text
port method
  → HttpTransport.request
  → withBearerAuth (if token set)
  → withProblemJsonErrors
  → fetch → JSON parse
```

Non-2xx responses with problem+json bodies become `SpecdClientError` or `ArtifactConflictError`. See [Errors](./errors.md).

## Path mapping

The adapter encodes path segments and maps each port method to the [API route](../api/routes.md) it belongs to. Examples:

- `getProject()` → `GET /project`
- `listChanges()` → `GET /changes`
- `saveChangeArtifact(input)` → `PUT /changes/:name/artifacts/:filename`
- `searchGraph(input)` → `GET /graph/search`

Workspace spec paths use encoded segments: `/workspaces/{ws}/specs/{path…}`.

## Studio UI wiring

`@specd/ui` expects a `SpecdDataProvider` with a `SpecdDataPort` instance. For `specd ui serve` with `@specd/studio-web`, the Vite build injects `VITE_SPECD_API_BASE_URL` so the shell opens already pointed at the API.

For standalone Vite (`pnpm --filter @specd/studio-web dev`), pass a `connectionProfile` with `kind: 'remote'` and `apiBaseUrl`, or use the connect panel.

## AbortSignal

Port methods accept an optional `AbortSignal` forwarded to `fetch` for cancellation (tab switches, unmount).
