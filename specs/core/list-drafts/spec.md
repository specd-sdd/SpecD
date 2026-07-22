# ListDrafts

## Purpose

Users who draft changes need visibility into what is parked so they can decide what to resume. The `ListDrafts` use case retrieves all drafted changes from the default workspace — those temporarily set aside that can be restored to active status later.

## Requirements

### Requirement: Returns all drafted changes

`ListDrafts.execute(options?)` MUST return `ListResult<DraftedChangeListEntry>` for all drafted changes.

It MUST forward `ListOptions`, `includeDescription`, and `includeReason` to `ChangeRepository.listDrafts()` without re-sorting, re-filtering, or re-paginating. Canonical order (`draftedAt` descending) is owned by the repository index helper.

Default `limit` is **100** when callers omit options.

### Requirement: Returns DraftedChangeView without content

`ListDrafts.execute()` MUST return `DraftedChangeListEntry` items — not `DraftedChangeView`, not mutable `Change` instances.

Entries MUST NOT include artifact file content, history, or derived artifact state maps. Detail belongs on `getDraft(name)`.

Optional `description` and `reason` appear only when the matching include flags are set and the repository projected them from the cached entry.

### Requirement: Constructor accepts a ChangeRepository

`ListDrafts` MUST accept a `ChangeRepository` as its sole constructor argument. It MUST delegate to `ChangeRepository.listDrafts(options)` and return the resulting `ListResult<DraftedChangeListEntry>` unchanged.

The use case MUST NOT re-sort, filter, or paginate after the repository returns.

### Requirement: Returns an empty array when no drafted changes exist

When the repository contains no drafted changes, `execute()` MUST return `{ items: [], meta: { total: 0, count: 0, limit: <resolved limit> } }`. It MUST NOT throw.

### Requirement: Config-based factory preserves complete change repository bootstrap

When `createListDrafts(config)` initializes a `ChangeRepository` from `SpecdConfig`, the repository MUST preserve complete artifact-type and spec-existence bootstrap semantics.

The config-based factory MUST NOT construct a weaker repository variant that can derive different draft artifact states for the same persisted change than the canonical listing read path.

### Requirement: Config-based factory delegates through resolveListDraftsDeps

The config-based `createListDrafts(config, options?)` form MUST derive `ListDraftsDeps` through `resolveListDraftsDeps(resolver)` and then delegate to canonical `createListDrafts(deps)`.

`resolveListDraftsDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:change-list-entry`](../change-list-entry/spec.md) — `DraftedChangeListEntry` row shape
- [`core:change-repository-port`](../change-repository-port/spec.md) — paginated list/count contract
- [`core:kernel`](../kernel/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
