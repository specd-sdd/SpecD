# ListChanges

## Purpose

Delivery mechanisms need a way to show the current working set at a glance, filtering out shelved and discarded items automatically. The `ListChanges` use case retrieves all active changes — those that have not been drafted or discarded — from the default workspace, sorted by creation order.

## Requirements

### Requirement: Returns all active changes

`ListChanges.execute(options?)` MUST return `ListResult<ActiveChangeListEntry>` for all active (non-drafted, non-discarded) changes.

It MUST forward `ListOptions` and `includeDescription` to `ChangeRepository.list()` without re-sorting, re-filtering, or re-paginating. Canonical order (`createdAt` ascending) is owned by the repository index helper.

Default `limit` is **100** when callers omit options.

### Requirement: Returns Change entities without content

The returned `ActiveChangeListEntry` items MUST NOT include artifact file content, history, validated hashes, artifact state maps, or other detail fields reserved for `get(name)`.

Optional `description` appears only when `includeDescription` is set on the forwarded options and the repository projected it from the cached entry.

### Requirement: Constructor accepts a ChangeRepository

`ListChanges` MUST accept a `ChangeRepository` as its sole constructor argument. It MUST delegate to `ChangeRepository.list(options)` and return the resulting `ListResult<ActiveChangeListEntry>` unchanged.

The use case MUST NOT re-sort, filter, or paginate after the repository returns.

### Requirement: Returns an empty array when no active changes exist

When the repository contains no active changes, `execute()` MUST return `{ items: [], meta: { total: 0, count: 0, limit: <resolved limit> } }`. It MUST NOT throw.

### Requirement: Config-based factory preserves complete change repository bootstrap

When `createListChanges(config)` initializes a `ChangeRepository` from `SpecdConfig`, the repository MUST preserve complete artifact-type and spec-existence bootstrap semantics.

The config-based factory MUST NOT construct a weaker repository variant that can derive different artifact states for the same persisted change than the canonical status/listing read path.

### Requirement: Config-based factory delegates through resolveListChangesDeps

The config-based `createListChanges(config, options?)` form MUST derive `ListChangesDeps` through `resolveListChangesDeps(resolver)` and then delegate to canonical `createListChanges(deps)`.

`resolveListChangesDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:change-list-entry`](../change-list-entry/spec.md) — `ActiveChangeListEntry` row shape
- [`core:change-repository-port`](../change-repository-port/spec.md) — paginated list/count contract
- [`core:kernel`](../kernel/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
