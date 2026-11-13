# UpdateSpecDeps

## Purpose

Spec dependencies must be captured during authoring — before metadata files exist — so that `CompileContext` can resolve the full dependency graph from the start. The `UpdateSpecDeps` use case updates the declared `dependsOn` dependencies for a single spec within a change, storing them in `change.specDependsOn` as the highest-priority source for resolution. It supports three mutually exclusive operations: add, remove, and set (replace all).

## Requirements

### Requirement: Input contract

`UpdateSpecDeps.execute` SHALL accept an `UpdateSpecDepsInput` with the following fields:

- `name` (required, string) — the change slug
- `specId` (required, string) — the spec whose dependencies are being updated; validated and normalized per "Spec ID validation", and MUST be present in the change's `specIds`
- `add` (optional, readonly string array) — dependency spec IDs to merge with existing dependencies
- `remove` (optional, readonly string array) — dependency spec IDs to remove from existing dependencies
- `set` (optional, readonly string array) — replaces all dependencies for the spec
- `clear` (optional, boolean) — when `true`, removes every declared dependency of the spec

Every list carries whole spec IDs and is never split or joined by the use case.

### Requirement: Change lookup

The use case MUST load and mutate the change by `name` via `ChangeRepository.mutate`. If no change with the given name exists, it MUST throw `ChangeNotFoundError`.

### Requirement: Spec must belong to the change

The `specId` MUST be present in `change.specIds`. If it is not, the use case MUST throw `InvalidInputError` indicating the spec is not in the change.

### Requirement: Mutual exclusivity of set vs add/remove

`set`, `clear`, and the pair `add`/`remove` are mutually exclusive operations. If `set` is combined with `add`, `remove`, or `clear`, or `clear` is combined with `add` or `remove`, the use case MUST throw a typed error. `add` and `remove` MAY be used together.

### Requirement: At least one operation required

If none of `add`, `remove`, `set`, or `clear` is provided, the use case MUST throw a typed error indicating that at least one operation must be specified.

### Requirement: Set replaces all dependencies

When `set` is provided, the use case MUST replace the entire dependency list for the spec with the given array, discarding any previously stored dependencies. Every entry MUST be a valid spec ID per "Spec ID validation"; an empty or blank entry is rejected and nothing is stored. Clearing the list is the job of `clear`.

### Requirement: Clear removes all dependencies

When `clear` is `true`, the use case MUST replace the dependency list for the spec with an empty list through the shared `applyDependsOnMutation` helper and persist it. The result's `dependsOn` is empty. The use case does not ask for confirmation; confirmation is a delivery concern.

### Requirement: Spec ID validation

The use case MUST validate and normalize `specId` and every entry of `add` and `set` with `parseSpecId` and the configured workspaces (see `core:spec-id-format`), and MUST store the fully-qualified IDs. An invalid ID fails with `InvalidSpecIdError` and an unknown workspace with `WorkspaceNotFoundError`; validation happens before any mutation, so nothing is stored when any entry is invalid.

A dependency target MAY name a spec that does not exist yet, because the change may create it; only syntax and workspace are checked, and a missing spec is not an error. Entries of `remove` are not rejected for syntax, so an invalid stored value can always be removed; the existence rule of "Remove validates existence" still applies. A `remove` entry that is a valid spec ID is normalized to its fully-qualified form before it is matched (a bare `auth/session` matches the stored `default:auth/session`); an entry that is not a valid spec ID is matched literally against the stored values.

### Requirement: Remove validates existence

When `remove` is provided, each spec ID in the list MUST exist in the current dependencies for the spec. If any ID is not found, the use case MUST throw `InvalidInputError` identifying the missing dependency. Removals are applied sequentially — the first missing ID aborts the operation.

### Requirement: Add is idempotent

When `add` is provided, each spec ID is added only if it is not already present in the current dependencies (after any removals). Duplicates are silently skipped.

### Requirement: Remove is applied before add

When both `remove` and `add` are provided in the same call, removals MUST be processed first, followed by additions.

### Requirement: Persistence and output

After computing the new dependency list, the use case MUST update and persist the change through `ChangeRepository.mutate(name, fn)`.

Inside the mutation callback, the repository supplies the fresh persisted `Change` for `name`; the use case calls `change.setSpecDependsOn(specId, result)` on that instance and returns it. When the callback resolves, the repository persists the updated manifest.

`UpdateSpecDeps.execute` then returns an `UpdateSpecDepsResult` containing `specId` and the resulting `dependsOn` array.

### Requirement: Typed errors for dependency update failures

`UpdateSpecDeps` MUST NOT throw generic `Error` for validation or lookup failures. It SHALL use typed `SpecdError` subclasses (or general core validation errors) for the following scenarios:

- Flag validation (mutually exclusive flags, missing flags).
- Dependency lookup failures (dependency not found).

Each error MUST follow the [`default:_global/error-handling-conventions`](../../_global/error-handling-conventions/spec.md) for actionable messaging.

### Requirement: Config-based factory delegates through resolveUpdateSpecDepsDeps

The config-based `createUpdateSpecDeps(config, options?)` form MUST derive `UpdateSpecDepsDeps` through `resolveUpdateSpecDepsDeps(resolver)` and then delegate to canonical `createUpdateSpecDeps(deps)`.

`resolveUpdateSpecDepsDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`
- `workspaces`: the configured workspaces used to validate spec IDs

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- Updating `specDependsOn` does NOT trigger approval invalidation — this is a dependency metadata operation, not a spec scope change
- The use case does not resolve actor identity — dependency updates are not recorded as actor-attributed events
- Dependency spec IDs are validated with the strict `parseSpecId`; validation happens before any mutation
- Dependency targets that do not exist yet are accepted

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:spec-id-format`](../spec-id-format/spec.md)
- [`core:compile-context`](../compile-context/spec.md)
- [`core:composition`](../composition/spec.md)
- [`default:_global/error-handling-conventions`](../../_global/error-handling-conventions/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
