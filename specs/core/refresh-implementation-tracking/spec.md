# RefreshImplementationTracking

## Purpose

Delivery adapters need a single application-layer operation to refresh a change's tracked implementation files from an `ImplementationDetector` without coupling that side effect to read-only or transition use cases. `RefreshImplementationTracking` runs targeted VCS-backed detection when a change has historically entered `implementing`, identifies files that have been physically removed from disk, handles the re-appearance of previously removed files, merges candidate paths into `trackedImplementationFiles`, and persists the result. Callers that need fresh tracking invoke this use case explicitly; use cases such as `GetStatus`, `TransitionChange`, and `CompileContext` project persisted state only.

## Requirements

### Requirement: Input contract

`RefreshImplementationTracking.execute` MUST accept:

- `name` — the change name to refresh

### Requirement: Historical implementing guard

When `Change.getHistoricalImplementationAt()` is `null`, the use case MUST NOT invoke `ImplementationDetector` and MUST NOT mutate tracked implementation files.

When the guard is satisfied, the use case MUST run targeted detection and MAY persist tracking updates.

### Requirement: Detection merge semantics

When detection runs, the use case MUST:

1. Call `ImplementationDetector.detectModifiedFiles(change, options)` with the loaded change context and internal paths as exclusions.
2. For each returned project-relative path not already present in `trackedImplementationFiles`, call `Change.trackImplementationFile(file, 'open')`.
3. For each project-relative path returned by the detector that IS already tracked, preserve its existing review state, unless the file was in the `removed` state (see resurrections below).

The use case MUST NOT mark files `resolved` or `ignored` during the merge pass of newly detected files.

### Requirement: Deletion and removal semantics

When detection runs, the use case MUST identify tracked implementation files that have been physically removed from the project.

For every file in `trackedImplementationFiles` that is not in the `ignored` state, the use case MUST verify its existence on disk. If the file is missing, the use case MUST:

1. Call `Change.trackImplementationFile(file, 'removed')` to update its review state.
2. Remove all `implementationLinks` (both file-level and symbol-level) that reference the missing file.

### Requirement: Resurrections and re-appearances

When detection runs, the use case MUST handle files that were previously marked as `removed` but are found to exist again on disk.

A file SHALL be transitioned from `removed` to `open` when:

- It is returned by the `ImplementationDetector` as a modified file.
- It is found to exist on disk during the existence check pass for tracked files.

Returning a file to `open` ensures that it is reviewed again, as its content or purpose may have changed since it was last tracked.

### Requirement: Internal directory filtering

To prevent internal specd metadata and archived changes from being discovered as implementation, the use case MUST collect internal directory paths before detection.

The use case MUST:

1. Query `ChangeRepository.internalPaths()` and `ArchiveRepository.internalPaths()`.
2. Normalize these absolute paths to project-relative portable paths.
3. Pass the normalized paths as `excludePaths` to `ImplementationDetector.detectModifiedFiles`.

### Requirement: Persistence

The use case MUST persist tracking updates through `ChangeRepository.mutate`.

When the historical implementing guard is not satisfied, `mutate` MUST still load the change but MUST NOT alter tracked implementation state.

### Requirement: Result projection

The use case MUST return an `ImplementationTrackingProjection` containing:

- `trackedFiles` — tracked implementation files with review state after any refresh
- `links` — confirmed implementation links after any refresh

Projection MUST use the shared `projectImplementationTracking` helper from the implementation-tracking module.

### Requirement: Change must exist

If no change with the given name exists, the use case MUST throw `ChangeNotFoundError` with code `CHANGE_NOT_FOUND`.

### Requirement: Constructor dependencies

`RefreshImplementationTracking` MUST accept:

- `changes: ChangeRepository` — for loading, persisting, and internal path discovery
- `archives: ArchiveRepository` — for internal path discovery
- `implementationDetector: ImplementationDetector` — for targeted candidate discovery

### Requirement: Delivery-agnostic boundary

This use case MUST NOT reference CLI commands, MCP servers, filesystem watchers, or other delivery mechanisms.

It exposes only the VCS-backed refresh contract. Other adapters MAY update tracked files through different strategies without calling this use case.

## Constraints

- Detection is demand-driven per invocation, not background polling.
- Returned detector paths MUST remain project-relative and forward-slash-normalized per `core:implementation-detector-port`.
- The use case does not perform manual `add` / `remove` / `resolve` / `ignore` mutations — those remain `UpdateImplementationTracking`.

## Spec Dependencies

- [`core:change`](../change/spec.md) — historical implementing guard and tracked-file semantics
- [`core:implementation-detector-port`](../implementation-detector-port/spec.md) — `ImplementationDetector` port
- [`core:storage`](../storage/spec.md) — `ChangeRepository` persistence
- [`core:archive-repository-port`](../archive-repository-port/spec.md) — `ArchiveRepository` for internal path discovery
