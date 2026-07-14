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

`ListArchived.execute()` accepts no parameters. It always operates on the full set of archived changes in the repository.

### Requirement: Output

`ListArchived.execute()` MUST return a `Promise` resolving to a result object containing the entries and metadata:

```typescript
interface ListArchivedResult {
  items: ArchivedChangeIndexEntry[]
  meta: {
    total: number
    count: number
    limit: number
    page?: number
    startAt?: string
  }
}
```

The `items` array contains the archived changes, ordered oldest first (chronological order by `archivedAt`) unless the repository implementation provides a different default order.

### Requirement: Delegation to ArchiveRepository

`ListArchived` MUST delegate entirely to `ArchiveRepository.list()`. It SHALL NOT apply additional filtering, sorting, or transformation to the repository result. The ordering guarantee (oldest first) is the responsibility of the `ArchiveRepository` port.

### Requirement: No side effects

`ListArchived` MUST NOT mutate any state. It SHALL NOT write to any repository, run hooks, or trigger any lifecycle operations. It is a pure read-only query.

### Requirement: Config-based factory delegates through resolveListArchivedDeps

The config-based `createListArchived(config, options?)` form MUST derive `ListArchivedDeps` through `resolveListArchivedDeps(resolver)` and then delegate to canonical `createListArchived(deps)`.

`resolveListArchivedDeps(resolver)` MUST resolve:

- `archive: ArchiveRepository`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- `ListArchived` has no error cases of its own -- any errors originate from the `ArchiveRepository` infrastructure
- The use case does not accept workspace selection -- it operates on the single `ArchiveRepository` injected at construction time
- The returned `ArchivedChangeIndexEntry` instances are immutable read-only records

## Spec Dependencies

- [`core:archive-change`](../archive-change/spec.md)
- [`core:storage`](../storage/spec.md)
- [`core:kernel`](../kernel/spec.md)
- [`default:_global/architecture`](../../_global/architecture/spec.md)
- [`core:archived-change-index-entry`](../archived-change-index-entry/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
