---
title: Authentication
sidebar_position: 3
---

# API authentication

## v1 (current)

Local Studio (`specd serve`, `specd ui serve`) runs with **`api.auth.type: disabled`**. No `Authorization` header is required. The health endpoint reports the effective auth type:

```json
{ "status": "ok", "auth": { "type": "disabled" } }
```

The CLI flag `--auth` must also resolve to `disabled`; other values fail at startup.

## Future remote deployments

The API layer is designed to accept bearer tokens via `Authorization: Bearer <token>` once verifiers are wired in `api.auth.config`. `@specd/core` continues to use `ActorResolver` for change history (`by` on transitions); HTTP auth is delivery-layer only.

## Client usage

When tokens are supported, pass them through `@specd/client`:

```typescript
import { createRemoteSpecdDataAdapter } from '@specd/client'

const port = createRemoteSpecdDataAdapter({
  apiBaseUrl: 'http://127.0.0.1:4450/v1',
  bearerToken: process.env.SPECD_API_TOKEN,
})
```

See [Remote adapter](../client/remote-adapter.md).
