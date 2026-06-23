# Spec: User Storage Port

## Purpose

Define the platform-agnostic client storage interface `IUserStorage` and its LocalStorage and FileStorage adapters in `@specd/client` to allow unified persistence for profiles and recent connections in both web and desktop environments.

## Requirements

### Requirement: IUserStorage interface exists

The `@specd/client` package SHALL export the `IUserStorage` interface defined as:

```typescript
export interface IUserStorage {
  get<T>(key: string): T | null
  set<T>(key: string, value: T): void
  remove(key: string): void
}
```

### Requirement: LocalStorageUserStorage implementation

The `@specd/client` package SHALL implement and export `LocalStorageUserStorage` which implements `IUserStorage` and persists data in the browser's native `window.localStorage`.

### Requirement: FileUserStorage implementation

The `@specd/client` package SHALL implement and export `FileUserStorage` which implements `IUserStorage` and persists data on the local filesystem by coordinating with the Electron main process via `window.specd.storage` (preloaded IPC bridge).

## Constraints

- Client storage implementations MUST NOT import `@specd/core`.
- The storage interface SHALL handle JSON serialization and deserialization internally for objects/arrays.

## Spec Dependencies

- [`default:_global/architecture`](../../../default/_global/architecture/spec.md) — client boundaries
