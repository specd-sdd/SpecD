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

When the archive contains a change matching the given name, `GetArchivedChange.execute()` MUST return `Promise<ArchivedChange>` — the matching archived change read model loaded from the archived directory `manifest.json`.

The returned `ArchivedChange` MUST extend `ReadOnlyChangeView` (shared read-only surface) and MUST include archive metadata (`archivedAt`, `archivedBy`, `archivedName`) so callers can inspect archived work without restoring it.

### Requirement: Delegation to ArchiveRepository

`GetArchivedChange` MUST delegate the lookup to `ArchiveRepository.get(name)`. It SHALL NOT perform its own filesystem or index scanning. The `ArchiveRepository` port is responsible for the lookup strategy (index search, fallback glob scan).

### Requirement: ChangeNotFoundError on missing change

When `ArchiveRepository.get(name)` returns `null`, `GetArchivedChange` MUST throw `ChangeNotFoundError` with the requested name. The error code MUST be `'CHANGE_NOT_FOUND'` and the message MUST include the change name.

### Requirement: No side effects

`GetArchivedChange` MUST NOT mutate any state. It SHALL NOT write to any repository, run hooks, or trigger any lifecycle operations. It is a pure read-only query (aside from the potential `index.jsonl` recovery append performed internally by `ArchiveRepository.get()`).

### Requirement: Config-based factory delegates through resolveGetArchivedChangeDeps

The config-based `createGetArchivedChange(config, options?)` form MUST derive `GetArchivedChangeDeps` through `resolveGetArchivedChangeDeps(resolver)` and then delegate to canonical `createGetArchivedChange(deps)`.

`resolveGetArchivedChangeDeps(resolver)` MUST resolve:

- `archive: ArchiveRepository`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- The only error thrown by `GetArchivedChange` itself is `ChangeNotFoundError` -- any other errors originate from the `ArchiveRepository` infrastructure
- The use case does not accept workspace selection -- it operates on the single `ArchiveRepository` injected at construction time
- The returned `ArchivedChange` instance is an immutable domain entity

## Spec Dependencies

- [`core:archive-change`](../archive-change/spec.md)
- [`core:storage`](../storage/spec.md)
- [`core:change`](../change/spec.md)
- [`core:kernel`](../kernel/spec.md)
- [`default:_global/architecture`](../../_global/architecture/spec.md)
- [`core:archived-change-index-entry`](../archived-change-index-entry/spec.md)
- [`core:read-only-change-view`](../read-only-change-view/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
