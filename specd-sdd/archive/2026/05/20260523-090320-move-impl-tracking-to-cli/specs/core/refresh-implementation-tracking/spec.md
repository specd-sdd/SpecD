# RefreshImplementationTracking

## Purpose

Delivery adapters need a single application-layer operation to refresh a change's tracked implementation files from an `ImplementationDetector` without coupling that side effect to read-only or transition use cases. `RefreshImplementationTracking` runs targeted VCS-backed detection when a change has historically entered `implementing`, merges new candidate paths into `trackedImplementationFiles`, and persists the result. Callers that need fresh tracking invoke this use case explicitly; use cases such as `GetStatus`, `TransitionChange`, and `CompileContext` project persisted state only.

## Requirements

### Requirement: Input contract

`RefreshImplementationTracking.execute` MUST accept:

- `name` — the change name to refresh

### Requirement: Historical implementing guard

When `Change.getHistoricalImplementationAt()` is `null`, the use case MUST NOT invoke `ImplementationDetector` and MUST NOT mutate tracked implementation files.

When the guard is satisfied, the use case MUST run targeted detection and MAY persist tracking updates.

### Requirement: Detection merge semantics

When detection runs, the use case MUST:

1. Call `ImplementationDetector.detectModifiedFiles(change)` with the loaded change context.
2. For each returned project-relative path not already present in `trackedImplementationFiles`, call `Change.trackImplementationFile(file, 'open')`.
3. Leave existing tracked entries and confirmed implementation links unchanged.

The use case MUST NOT remove tracked files, rewrite link state, or mark files `resolved` or `ignored`.

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

- `changes: ChangeRepository` — for loading and persisting the change
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
