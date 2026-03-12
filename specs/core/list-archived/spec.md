# ListArchived

## Overview

`ListArchived` is the application use case that retrieves all archived changes in the default workspace. It is a read-only query with no side effects, no input parameters, and no lifecycle hooks.

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

`ListArchived.execute()` MUST return `Promise<ArchivedChange[]>`. The returned array contains all archived changes in the repository, ordered oldest first (chronological order by `archivedAt`). If no archived changes exist, the result MUST be an empty array.

### Requirement: Delegation to ArchiveRepository

`ListArchived` MUST delegate entirely to `ArchiveRepository.list()`. It SHALL NOT apply additional filtering, sorting, or transformation to the repository result. The ordering guarantee (oldest first) is the responsibility of the `ArchiveRepository` port.

### Requirement: No side effects

`ListArchived` MUST NOT mutate any state. It SHALL NOT write to any repository, run hooks, or trigger any lifecycle operations. It is a pure read-only query.

## Constraints

- `ListArchived` has no error cases of its own -- any errors originate from the `ArchiveRepository` infrastructure
- The use case does not accept workspace selection -- it operates on the single `ArchiveRepository` injected at construction time
- The returned `ArchivedChange` instances are immutable domain entities

## Spec Dependencies

- [`specs/core/archive-change/spec.md`](../archive-change/spec.md) -- `ArchiveChange` use case that produces archived changes; `ArchivedChange` entity
- [`specs/core/storage/spec.md`](../storage/spec.md) -- `ArchiveRepository` port, `index.jsonl` ordering guarantees
- [`specs/core/kernel/spec.md`](../kernel/spec.md) -- kernel wiring under `changes.listArchived`
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) -- port-based architecture, manual DI
