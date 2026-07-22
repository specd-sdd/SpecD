# ListArchived

## Purpose

Teams need to browse the history of completed spec work — for audits, onboarding, or tracing when a particular spec was last modified. `ListArchived` retrieves all archived changes in the default workspace as a read-only query with no side effects, no input parameters, and no lifecycle hooks.

## Requirements

### Requirement: Ports and constructor

`ListArchived` receives at construction time a single dependency: `ArchiveRepository`.

```typescript
class ListArchived {
  constructor(archive: ArchiveRepository)
}
```

The `ArchiveRepository` instance is scoped to the default workspace and is injected by the kernel composition layer.

### Requirement: No input

`ListArchived.execute(options?)` accepts optional list options (`limit`, `page`, `after`, `includeArchivedBy`) and forwards them to `ArchiveRepository.list(options)`.

Default `limit` is **100** when callers omit options. `page` and `after` are mutually exclusive per shared `ListOptions`.

### Requirement: Output

`ListArchived.execute(options?)` MUST return `Promise<ListResult<ArchiveListEntry>>` (alias `ListArchivedResult`).

Items are ordered in the repository's canonical sort (`archivedAt` descending — newest first). `meta.total` reflects the full archive count; `meta.count` reflects the returned page size.

Keyset pagination uses `after: { key: archivedAt ISO-8601, id: change name }` — not legacy `startAt`.

### Requirement: Delegation to ArchiveRepository

`ListArchived` MUST delegate entirely to `ArchiveRepository.list(options)` and return the result unchanged. It SHALL NOT apply additional filtering, sorting, pagination, or transformation.

Canonical sort order is owned by the archive index helper; the use case MUST NOT re-sort.

### Requirement: No side effects

`ListArchived` MUST NOT mutate any state. It SHALL NOT write to any repository, run hooks, or trigger any lifecycle operations. It is a pure read-only query.

### Requirement: Config-based factory delegates through resolveListArchivedDeps

The config-based `createListArchived(config, options?)` form MUST derive `ListArchivedDeps` through `resolveListArchivedDeps(resolver)` and then delegate to canonical `createListArchived(deps)`.

`resolveListArchivedDeps(resolver)` MUST resolve:

- `archive: ArchiveRepository`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- `ListArchived` has no error cases of its own — any errors originate from the `ArchiveRepository` infrastructure
- The use case does not accept workspace selection — it operates on the single `ArchiveRepository` injected at construction time
- The returned `ArchiveListEntry` instances are immutable read-only records
- Optional `archivedBy` appears only when `includeArchivedBy` is set on forwarded options

## Spec Dependencies

- [`core:archive-change`](../archive-change/spec.md)
- [`core:storage`](../storage/spec.md)
- [`core:kernel`](../kernel/spec.md)
- [`default:_global/architecture`](../../_global/architecture/spec.md)
- [`core:archived-change-index-entry`](../archived-change-index-entry/spec.md) — `ArchiveListEntry` row shape
- [`core:archive-repository-port`](../archive-repository-port/spec.md) — paginated list/count contract
- [`core:composition-resolver`](../composition-resolver/spec.md)
