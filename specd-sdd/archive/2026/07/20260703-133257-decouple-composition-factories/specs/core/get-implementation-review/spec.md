# GetImplementationReview

## Purpose

Implementation-traceability workflows need a read-only way to inspect the current tracked implementation files and confirmed implementation links of a change without mutating anything. `GetImplementationReview` provides that read model: it loads one active change, projects its implementation-tracking state, and returns the current in-scope spec IDs so delivery adapters can review implementation coverage against change scope.

## Requirements

### Requirement: Input contract

`GetImplementationReview.execute` SHALL accept a change name.

### Requirement: Change must exist

If no active change with the given name exists, the use case MUST throw `ChangeNotFoundError`.

### Requirement: Result projection

The use case MUST return:

- `implementationTracking` — the raw `ImplementationTrackingProjection` for the change
- `specIds` — the change's current in-scope spec IDs

The implementation-tracking projection MUST be derived from persisted change state and MUST NOT mutate that state during the read.

### Requirement: Delivery-agnostic read boundary

The use case MUST expose a delivery-agnostic read model only. It MUST NOT embed CLI formatting, symbol-graph rendering, or archive-time materialization logic.

### Requirement: Config-based factory delegates through resolveGetImplementationReviewDeps

The config-based `createGetImplementationReview(config, options?)` form MUST derive `GetImplementationReviewDeps` through `resolveGetImplementationReviewDeps(resolver)` and then delegate to canonical `createGetImplementationReview(deps)`.

`resolveGetImplementationReviewDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- The use case is read-only.
- The use case operates on active changes through persisted change state.
- The use case does not perform autodetection or mutation; those belong to `RefreshImplementationTracking` and `UpdateImplementationTracking`.

## Spec Dependencies

- [`core:change`](../change/spec.md) — source of tracked implementation and in-scope spec state
- [`core:update-implementation-tracking`](../update-implementation-tracking/spec.md) — companion mutation path
- [`core:refresh-implementation-tracking`](../refresh-implementation-tracking/spec.md) — companion autodetection refresh path
- [`core:composition-resolver`](../composition-resolver/spec.md) — normalized public composition path for the factory
