---
title: Connection profiles
sidebar_position: 4
---

# Connection profiles

Studio shells describe **how** the UI reaches data using `SpecdConnectionProfile` (`packages/client/src/types/connection-profile.ts`).

## Variants

| `kind`          | Meaning                                                                    |
| --------------- | -------------------------------------------------------------------------- |
| `remote`        | `RemoteSpecdDataAdapter` against `apiBaseUrl` (+ optional `token`)         |
| `embedded`      | UI served from API origin; API base derived from `window.location` + `/v1` |
| `desktop-local` | Electron renderer uses IPC to main process (not HTTP)                      |

## Remote

```typescript
const profile: SpecdConnectionProfile = {
  kind: 'remote',
  apiBaseUrl: 'http://127.0.0.1:4450/v1',
  token: process.env.SPECD_TOKEN,
}
```

`normalizeApiBaseUrl` ensures a trailing `/v1`:

```typescript
import { normalizeApiBaseUrl } from '@specd/client'

normalizeApiBaseUrl('http://127.0.0.1:4450') // → http://127.0.0.1:4450/v1
normalizeApiBaseUrl('http://127.0.0.1:4450/v1') // → unchanged
```

## Embedded

Used when the SPA and API share one origin (bundle plugin via `specd ui serve` + `@specd/plugin-ui-studio`). The UI builds the API base as `${origin}/v1` without user input.

## Desktop local

Reserved for `apps/specd-studio-desktop` where the main process runs kernel use cases and the renderer speaks IPC (`createIpcRequest` / `createIpcSuccess` in `ipc/envelope.ts`).

For graph features, the desktop main process composes against `@specd/code-graph-electron`, an internal-only workspace package that keeps Electron's native sqlite rebuild flow separate from the standard `@specd/code-graph` package used by CLI and API.

## Connect panel

When no profile is injected, `@specd/ui` shows `ConnectPanel` to collect `apiBaseUrl` and optional token, then probes with `testRemoteConnection`.

`specd ui serve` with a server UI plugin should inject `initialProfile` so the connect step is skipped in normal development.
