# GetArchivedChange

## Purpose

When inspecting the archive — for audit, diffing, or post-mortem — users need to retrieve a specific archived change by name rather than scanning the full list. `GetArchivedChange` is a read-only query that looks up a single archived change by name and throws `ChangeNotFoundError` when the requested change does not exist.

## Requirements

### Requirement: Ports and constructor

`GetArchivedChange` receives at construction time a single dependency: `ArchiveRepository`.

```typescript
class GetArchivedChange {
  constructor(archive: ArchiveRepository)
}
```

The `ArchiveRepository` instance is scoped to the default workspace and is injected by the kernel composition layer.

### Requirement: Input

`GetArchivedChange.execute()` accepts a `GetArchivedChangeInput` object with a single required field:

- `name` (string) -- the change name to look up in the archive

### Requirement: Output on success

When the archive contains a change matching the given name, `GetArchivedChange.execute()` MUST return `Promise<ArchivedChange>` -- the matching archived change entity.

### Requirement: Delegation to ArchiveRepository

`GetArchivedChange` MUST delegate the lookup to `ArchiveRepository.get(name)`. It SHALL NOT perform its own filesystem or index scanning. The `ArchiveRepository` port is responsible for the lookup strategy (index search, fallback glob scan).

### Requirement: ChangeNotFoundError on missing change

When `ArchiveRepository.get(name)` returns `null`, `GetArchivedChange` MUST throw `ChangeNotFoundError` with the requested name. The error code MUST be `'CHANGE_NOT_FOUND'` and the message MUST include the change name.

### Requirement: No side effects

`GetArchivedChange` MUST NOT mutate any state. It SHALL NOT write to any repository, run hooks, or trigger any lifecycle operations. It is a pure read-only query (aside from the potential `index.jsonl` recovery append performed internally by `ArchiveRepository.get()`).

## Constraints

- The only error thrown by `GetArchivedChange` itself is `ChangeNotFoundError` -- any other errors originate from the `ArchiveRepository` infrastructure
- The use case does not accept workspace selection -- it operates on the single `ArchiveRepository` injected at construction time
- The returned `ArchivedChange` instance is an immutable domain entity

## Spec Dependencies

- [`specs/core/archive-change/spec.md`](../archive-change/spec.md) -- `ArchiveChange` use case that produces archived changes; `ArchivedChange` entity
- [`specs/core/storage/spec.md`](../storage/spec.md) -- `ArchiveRepository` port, `get()` lookup strategy with index search and fallback glob scan
- [`specs/core/change/spec.md`](../change/spec.md) -- `ChangeNotFoundError` shared error type
- [`specs/core/kernel/spec.md`](../kernel/spec.md) -- kernel wiring under `changes.getArchived`
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) -- port-based architecture, manual DI
