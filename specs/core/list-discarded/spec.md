# ListDiscarded

## Purpose

Discarded changes remain in storage for audit purposes, and teams need to review them — for example, to confirm a superseded change was properly replaced. The `ListDiscarded` use case retrieves all discarded changes from the default workspace, providing visibility into abandoned work that has not been permanently deleted.

## Requirements

### Requirement: Returns all discarded changes

`ListDiscarded.execute(options?)` MUST return `ListResult<DiscardedChangeListEntry>` for all discarded changes.

It MUST forward `ListOptions`, `includeDescription`, `includeReason`, and `includeSupersededBy` to `ChangeRepository.listDiscarded()` without re-sorting, re-filtering, or re-paginating. Canonical order (`discardedAt` descending) is owned by the repository index helper.

Default `limit` is **100** when callers omit options.

### Requirement: Returns DiscardedChangeView without content

`ListDiscarded.execute()` MUST return `DiscardedChangeListEntry` items — not `DiscardedChangeView`, not mutable `Change` instances.

Entries MUST NOT include artifact file content, history, or derived artifact state maps. Detail belongs on `getDiscarded(name)`.

Optional `description`, `reason`, and `supersededBy` appear only when the matching include flags are set and the repository projected them from the cached entry.

### Requirement: Constructor accepts a ChangeRepository

`ListDiscarded` MUST accept a `ChangeRepository` as its sole constructor argument. It MUST delegate to `ChangeRepository.listDiscarded(options)` and return the resulting `ListResult<DiscardedChangeListEntry>` unchanged.

The use case MUST NOT re-sort, filter, or paginate after the repository returns.

### Requirement: Returns an empty array when no discarded changes exist

When the repository contains no discarded changes, `execute()` MUST return `{ items: [], meta: { total: 0, count: 0, limit: <resolved limit> } }`. It MUST NOT throw.

### Requirement: Config-based factory preserves complete change repository bootstrap

When `createListDiscarded(config)` initializes a `ChangeRepository` from `SpecdConfig`, the repository MUST preserve complete artifact-type and spec-existence bootstrap semantics.

The config-based factory MUST NOT construct a weaker repository variant that can derive different discarded artifact states for the same persisted change than the canonical listing read path.

### Requirement: Config-based factory delegates through resolveListDiscardedDeps

The config-based `createListDiscarded(config, options?)` form MUST derive `ListDiscardedDeps` through `resolveListDiscardedDeps(resolver)` and then delegate to canonical `createListDiscarded(deps)`.

`resolveListDiscardedDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:change-list-entry`](../change-list-entry/spec.md) — `DiscardedChangeListEntry` row shape
- [`core:change-repository-port`](../change-repository-port/spec.md) — paginated list/count contract
- [`core:kernel`](../kernel/spec.md)
- [`core:discarded-change-view`](../discarded-change-view/spec.md) — detail read model for `getDiscarded`
- [`core:composition-resolver`](../composition-resolver/spec.md)
