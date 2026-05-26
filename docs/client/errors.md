---
title: Client errors
sidebar_position: 6
---

# Client errors

## SpecdClientError

Thrown when the API returns a problem+json body (via `withProblemJsonErrors`).

| Property          | Description                   |
| ----------------- | ----------------------------- |
| `status`          | HTTP status                   |
| `code`            | Specd error code when present |
| `detail`, `title` | From problem body             |
| `problem`         | Full parsed body              |

```typescript
import { SpecdClientError } from '@specd/client'

try {
  await data.getChange('missing')
} catch (err) {
  if (err instanceof SpecdClientError && err.code === 'CHANGE_NOT_FOUND') {
    // …
  }
}
```

## ArtifactConflictError

Subclass for HTTP **409** on artifact save (`SAVE_REQUIRES_FORCE`).

| Property     | Description                                                    |
| ------------ | -------------------------------------------------------------- |
| `serverHash` | Server content hash when provided — use for retry with `force` |

```typescript
import { ArtifactConflictError } from '@specd/client'

try {
  await data.saveChangeArtifact({ name, filename, content, originalHash })
} catch (err) {
  if (err instanceof ArtifactConflictError) {
    await data.saveChangeArtifact({
      name,
      filename,
      content,
      originalHash: err.serverHash ?? '',
      force: true,
    })
  }
}
```

## Alignment with API

Problem shape matches [API errors](../api/errors.md). Status/code mapping is owned by `@specd/api` (`toProblemJson`); the client does not re-map domain codes.

## Memory adapter

`MemorySpecdDataAdapter` throws the same error classes where scenarios require failure simulation in UI tests.
