# Design: move-change-locks-to-config-tmp

## Overview

Move the change lock directory from `.specd/change-locks` to `{configPath}/tmp/change-locks`.

## Affected Areas

| File                                                       | Symbol               | Change                           |
| ---------------------------------------------------------- | -------------------- | -------------------------------- |
| `packages/core/src/application/ports/repository.ts`        | `RepositoryConfig`   | Add configPath to base           |
| `packages/core/src/composition/kernel-internals.ts`        | Repository factories | Pass configPath to all           |
| `packages/core/src/infrastructure/fs/change-repository.ts` | `FsChangeRepository` | Derive locksPath from configPath |

## Approach

### Step 1: Add configPath to RepositoryConfig (base)

Since configPath is needed by all repositories, add it to the base `RepositoryConfig`:

```typescript
interface RepositoryConfig {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly configPath: string // NEW: config directory, available to all repositories
}
```

### Step 2: Kernel passes configPath to all repository factories

All repository factories receive config via `SpecdConfig`, which includes `configPath`. This value is passed through to each repository's config object:

```typescript
createChangeRepository({
  workspace: config.workspace,
  ownership: config.ownership,
  isExternal: config.isExternal,
  configPath: config.configPath, // passed to base RepositoryConfig
  // ... repository-specific paths
})
```

Every repository implementation receives `configPath` from the base, regardless of type.

### Step 3: FsChangeRepository derives locksPath

```typescript
this._locksPath = path.join(config.configPath, 'tmp', 'change-locks')
```

## Testing

- `packages/core/test/application/ports/repository.spec.ts` — update test fixtures
- `packages/core/test/infrastructure/fs/change-repository.spec.ts` — update lock assertions

## Open Questions

_none_
