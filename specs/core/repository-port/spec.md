# Repository Base

## Purpose

All repository ports share construction-time invariants that determine how use cases interact with stored data: workspace, ownership, locality, and the config-root path used to derive repository-owned runtime files. Without a shared base, each port would duplicate these fields, their accessors, and their semantics. `Repository` is the abstract base class that encapsulates these invariants once, so that subclasses only need to declare their storage-specific operations.

## Requirements

### Requirement: RepositoryConfig shape

`Repository` is constructed from a `RepositoryConfig` object:

```typescript
interface RepositoryConfig {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly configPath: string
}
```

- `workspace` — the workspace name this repository is bound to (e.g. `"default"`, `"billing"`)
- `ownership` — the ownership level declared in `specd.yaml`:
  - `owned` — full control, no restrictions
  - `shared` — writes allowed but recorded in the change manifest as `touchedSharedSpecs`
  - `readOnly` — no writes allowed; data may only be read
- `isExternal` — whether this repository points to data outside the current git repository. External repositories may not be accessible to agents restricted to the git root.
- `configPath` — absolute path to the config directory. Repository implementations use it to derive runtime-owned paths such as change locks, graph persistence, and other repository-local support files.

### Requirement: Abstract class, not interface

`Repository` MUST be an `abstract class`. It sets the four invariant fields in its constructor from `RepositoryConfig` and exposes them as methods. This follows the architecture spec requirement that ports with shared construction are abstract classes — the TypeScript compiler enforces both the construction contract and the method contract.

### Requirement: Immutable accessors

`Repository` MUST expose four methods that return the values set at construction time:

- `workspace(): string` — the workspace name
- `ownership(): 'owned' | 'shared' | 'readOnly'` — the ownership level
- `isExternal(): boolean` — whether the repository is external
- `configPath(): string` — the absolute config directory path

These values MUST NOT change during the lifetime of the instance. The backing fields are private — subclasses access them only through the methods.

### Requirement: Subclass contract

Subclasses (`ChangeRepository`, `SpecRepository`, `ArchiveRepository`) extend `Repository` and declare their storage operations as `abstract` methods. The base class defines no storage operations — it only provides the shared construction and accessor contract.

### Requirement: ReadOnlyWorkspaceError

`Repository` MUST export a `ReadOnlyWorkspaceError` class for use by subclasses and use cases that enforce `readOnly` ownership. The error MUST extend the project's base `DomainError` class.

The constructor MUST accept a `message` string. Callers construct the message with context appropriate to the enforcement point (spec ID, workspace name, operation type). The error class itself does not format messages — it is a marker type that consumers can catch or inspect.

`ReadOnlyWorkspaceError` is a domain error because ownership is a domain concept — it represents a violated invariant, not an I/O failure or a user input error.

### Requirement: Shared list pagination types

`Repository` and listable repository ports MUST use these shared types for paginated listing:

```typescript
interface ListCursor {
  /** Sort-key value in canonical order (ISO timestamp for time-sorted buckets; capability path for specs). */
  key: string
  /** Tiebreak id when keys collide (change `name` for change/archive buckets; omit for specs). */
  id?: string
}

interface ListOptions {
  limit?: number
  page?: number
  /** Exclusive keyset cursor: continue after this position in canonical sort order. Mutually exclusive with `page`. */
  after?: ListCursor
}

interface ListMeta {
  total: number
  count: number
  limit: number
  page?: number
  after?: ListCursor
}

interface ListResult<T> {
  items: T[]
  meta: ListMeta
}
```

- When `limit` is **omitted**, the listable port MUST return the **full** filtered result set in canonical order (no default page size). Hosts (CLI, API, agents) that want a capped page MUST pass an explicit `limit`.
- When `limit` is omitted and the result is unpaginated, `meta.limit` MUST equal `meta.total` and `meta.count` MUST equal `meta.total`.
- When `limit` is provided, pagination applies: return at most `limit` items from the selected window.
- `page` is 1-based and MUST be mutually exclusive with `after`. Providing `page` without `limit` MUST be rejected as invalid.
- `after` is an exclusive keyset cursor. When `limit` is also provided, return the next `limit` items strictly after `{ key, id? }` in the bucket's canonical sort order. When `after` is provided **without** `limit`, return **all** remaining items strictly after the cursor (no final slice by page size).
- Pagination applies over canonical sort order owned by the index helper; use cases and CLI MUST NOT re-sort list results.

`ListMeta.after` (normative): when a `list()` call returns a page and more items remain beyond it in canonical order, `meta.after` MUST be the cursor `{ key, id? }` of the **last item actually returned** in that page — computed via the bucket's cursor extraction, never echoed from the request's `options.after`. When the returned page reaches the end of the bucket (no more items remain), `meta.after` MUST be omitted entirely. Callers page forward by feeding the previous response's `meta.after` into the next request's `options.after`; an implementation that echoes the input cursor back as `meta.after` violates this requirement because it yields the same page indefinitely.

Keyset cursor semantics by bucket:

| Bucket         | `after.key`            | `after.id`    |
| -------------- | ---------------------- | ------------- |
| Active changes | `createdAt` ISO-8601   | change `name` |
| Drafts         | `draftedAt` ISO-8601   | change `name` |
| Discarded      | `discardedAt` ISO-8601 | change `name` |
| Archive        | `archivedAt` ISO-8601  | change `name` |
| Specs          | capability path        | omit          |

### Requirement: invalidateCache resets adapter caches

`Repository` MUST expose:

```typescript
async invalidateCache(): Promise<void> {
  // default no-op
}
```

Semantics: reset whatever this adapter caches — not filesystem-specific and not list-only by name. The base implementation MUST be a no-op. Subclasses MAY override to mark index helpers or other adapter caches invalidated. Callers that know storage changed outside normal repository write paths MAY invoke `invalidateCache()` without knowing adapter internals.

## Constraints

- Repository defines no storage operations — it is purely a construction, accessor, and shared listing-type base
- All four accessors are explicit methods, not property signatures (per architecture spec)
- Backing fields are private to Repository — subclasses cannot access them directly
- RepositoryConfig is a plain interface, not a class
- ReadOnlyWorkspaceError extends DomainError and is exported from the repository-port module
- Shared list types (`ListOptions`, `ListMeta`, `ListResult`, `ListCursor`) are exported from the repository-port module for use by listable ports

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — ports with shared construction are abstract classes; all port methods are explicit methods
