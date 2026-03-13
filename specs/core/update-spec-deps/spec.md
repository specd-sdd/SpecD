# UpdateSpecDeps

## Purpose

Spec dependencies must be captured during authoring — before metadata files exist — so that `CompileContext` can resolve the full dependency graph from the start. The `UpdateSpecDeps` use case updates the declared `dependsOn` dependencies for a single spec within a change, storing them in `change.specDependsOn` as the highest-priority source for resolution. It supports three mutually exclusive operations: add, remove, and set (replace all).

## Requirements

### Requirement: Input contract

`UpdateSpecDeps.execute` SHALL accept an `UpdateSpecDepsInput` with the following fields:

- `name` (required, string) — the change slug
- `specId` (required, string) — the spec whose dependencies are being updated; MUST be present in the change's `specIds`
- `add` (optional, readonly string array) — dependency spec IDs to merge with existing dependencies
- `remove` (optional, readonly string array) — dependency spec IDs to remove from existing dependencies
- `set` (optional, readonly string array) — replaces all dependencies for the spec

### Requirement: Change lookup

The use case MUST load the change by `name` via `ChangeRepository.get`. If no change with the given name exists, it MUST throw `ChangeNotFoundError`.

### Requirement: Spec must belong to the change

The `specId` MUST be present in `change.specIds`. If it is not, the use case MUST throw an `Error` indicating the spec is not in the change.

### Requirement: Mutual exclusivity of set vs add/remove

`set` MUST NOT be used together with `add` or `remove`. If both `set` and either `add` or `remove` are provided, the use case MUST throw an `Error`.

### Requirement: At least one operation required

If none of `add`, `remove`, or `set` are provided, the use case MUST throw an `Error` indicating that at least one operation must be specified.

### Requirement: Set replaces all dependencies

When `set` is provided, the use case MUST replace the entire dependency list for the spec with the given array, discarding any previously stored dependencies.

### Requirement: Remove validates existence

When `remove` is provided, each spec ID in the list MUST exist in the current dependencies for the spec. If any ID is not found, the use case MUST throw an `Error` identifying the missing dependency. Removals are applied sequentially — the first missing ID aborts the operation.

### Requirement: Add is idempotent

When `add` is provided, each spec ID is added only if it is not already present in the current dependencies (after any removals). Duplicates are silently skipped.

### Requirement: Remove is applied before add

When both `remove` and `add` are provided in the same call, removals MUST be processed first, followed by additions.

### Requirement: Persistence and output

After computing the new dependency list, the use case MUST:

1. Call `change.setSpecDependsOn(specId, result)` to update the change entity
2. Persist the change via `ChangeRepository.save`
3. Return an `UpdateSpecDepsResult` containing `specId` and the resulting `dependsOn` array

## Constraints

- Updating `specDependsOn` does NOT trigger approval invalidation — this is a dependency metadata operation, not a spec scope change
- The use case does not resolve actor identity — dependency updates are not recorded as actor-attributed events
- Dependency spec IDs are parsed via `parseSpecId` for format validation but the function is lenient and does not throw on invalid formats

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — `Change` entity, `specDependsOn`, `setSpecDependsOn`
- [`specs/core/spec-id-format/spec.md`](../spec-id-format/spec.md) — spec ID parsing via `parseSpecId`
- [`specs/core/compile-context/spec.md`](../compile-context/spec.md) — consumer of `specDependsOn` for dependency resolution
- [`specs/core/composition/spec.md`](../composition/spec.md) — wiring and port injection
