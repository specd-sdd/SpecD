# UpdateImplementationTracking

## Purpose

Implementation tracking needs an application-level mutation primitive so delivery hosts can record file review state and confirmed implementation links without reimplementing change-manifest rules themselves. `UpdateImplementationTracking` is that primitive: it applies one implementation-tracking mutation to a change, enforces file-existence and tracked-entry rules at the core boundary, and persists the resulting implementation-tracking projection.

## Requirements

### Requirement: Input contract

`UpdateImplementationTracking.execute` SHALL accept:

- `name` — change name
- `action` — one of `add`, `remove`, `ignore`, `resolve`, or `unresolve`
- `file` — raw project-relative file path
- `specId` — optional canonical spec ID for link mutations
- `symbols` — optional symbol refinements for link mutations

### Requirement: Add mutation creates or enriches implementation links

When `action = add`, the use case MUST require the target file to exist on disk.

It MUST create or enrich a confirmed implementation link for the given `specId + file` pair, using symbol refinements when provided. When the file is not already tracked, it MUST add a tracked implementation file entry with state `open`.

### Requirement: Remove mutation removes implementation links

When `action = remove`, the use case SHALL remove confirmed implementation links.

When symbols are provided, it MUST remove only those symbol refinements. When symbols are omitted, it MUST remove the whole `specId + file` link set.

### Requirement: Resolve mutation closes tracked-file review

When `action = resolve`, the use case MUST require the target file to exist on disk and already be tracked by the change.

It MUST move the tracked file into the `resolved` review state.

### Requirement: Unresolve mutation reopens tracked-file review

When `action = unresolve`, the use case MUST require the target file to exist on disk and already be tracked.

It MUST move `resolved` or `ignored` tracked files back to `open`. It MUST NOT reopen tracked files in the `removed` state; those may return to `open` only through refresh-driven resurrection.

### Requirement: Ignore mutation preserves tracked history

When `action = ignore`, the use case SHALL mark the tracked file as `ignored`.

It MAY ignore a missing file only when that file is already tracked. For an untracked file, physical existence MUST be validated before adding it as `ignored`. Confirmed implementation links for the file MUST be preserved.

### Requirement: Change must exist

If no change with the given name exists, the use case MUST throw `ChangeNotFoundError`.

### Requirement: Missing-file validation uses typed errors

When a file-required mutation targets a file that is missing on disk or invalid for the requested transition, the use case MUST throw `ImplementationFileNotFoundError` rather than silently mutating state.

### Requirement: Persistence and result projection

The use case MUST persist mutations through `ChangeRepository.mutate`.

It MUST return the resulting `ImplementationTrackingProjection` after the mutation completes.

### Requirement: Config-based factory delegates through resolveUpdateImplementationTrackingDeps

The config-based `createUpdateImplementationTracking(config, options?)` form MUST derive `UpdateImplementationTrackingDeps` through `resolveUpdateImplementationTrackingDeps(resolver)` and then delegate to canonical `createUpdateImplementationTracking(deps)`.

`resolveUpdateImplementationTrackingDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`
- `files: FileReader`
- `projectRoot: string`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- `UpdateImplementationTracking` mutates only implementation-tracking state; it does not validate or transition lifecycle state.
- The use case operates on raw project-relative file paths during active-change authoring.
- The use case does not perform autodetection of implementation candidates; that remains `RefreshImplementationTracking`.

## Spec Dependencies

- [`core:change`](../change/spec.md) — tracked implementation file and confirmed link semantics
- [`core:refresh-implementation-tracking`](../refresh-implementation-tracking/spec.md) — complementary autodetection-based refresh path
- [`core:composition-resolver`](../composition-resolver/spec.md) — normalized public composition path for the factory
