# EditChange

## Purpose

As a change evolves, its spec scope often needs to grow or shrink — but modifying the spec list has approval implications that must be enforced consistently. The `EditChange` use case adds or removes spec IDs on an existing change, derives workspaces from the resulting `specIds` via the `Change.workspaces` getter, and triggers approval invalidation whenever the spec list effectively changes.

## Requirements

### Requirement: Input contract

`EditChange.execute` SHALL accept an `EditChangeInput` with the following fields:

- `name` (required, string) — the change slug to edit
- `addSpecIds` (optional, string array) — spec IDs to add to the change's `specIds`
- `removeSpecIds` (optional, string array) — spec IDs to remove from the change's `specIds`

### Requirement: Change lookup

The use case MUST load the change by `name` via `ChangeRepository.get`. If no change with the given name exists, it MUST throw `ChangeNotFoundError`.

### Requirement: No-op when no spec changes requested

If both `addSpecIds` and `removeSpecIds` are absent or empty, the use case MUST return the unchanged change with `invalidated: false` without persisting or resolving actor identity.

### Requirement: Removal precedes addition

When both `removeSpecIds` and `addSpecIds` are provided, removals MUST be applied before additions. This allows a caller to replace a spec ID by removing the old one and adding the new one in a single call.

### Requirement: Removal of absent spec throws

If any spec ID in `removeSpecIds` is not present in the change's current `specIds`, the use case MUST throw `SpecNotInChangeError` for that spec ID. Removal is atomic per ID — the first missing ID aborts the entire operation.

### Requirement: Addition is idempotent

If a spec ID in `addSpecIds` already exists in the change's `specIds` (after removals), it MUST be silently skipped — no duplicate is added and no error is thrown.

### Requirement: No-op when specIds unchanged after processing

If the resulting `specIds` list is identical (same length, same order) to the change's current `specIds`, the use case MUST return the unchanged change with `invalidated: false` without persisting.

### Requirement: Approval invalidation on effective change

When the resulting `specIds` differ from the current set, the use case MUST:

1. Resolve the current actor via `ActorResolver.identity()`
2. Call `change.updateSpecIds(newSpecIds, actor)` — this records an `invalidated` event with cause `spec-change` and a `transitioned` event
3. Persist the change via `ChangeRepository.save`
4. Call `ChangeRepository.scaffold(change, specExists)` to create directories for any newly added spec-scoped artifacts, using the `specs` map for the `specExists` check
5. Return `{ change, invalidated: true }`

### Requirement: Output contract

`EditChange.execute` MUST return an `EditChangeResult` with:

- `change` — the `Change` entity (updated or unchanged)
- `invalidated` — `true` if approvals were invalidated, `false` otherwise

### Requirement: Dependencies

`EditChange` depends on the following ports injected via constructor:

- `ChangeRepository` — for loading, persisting, and scaffolding changes
- `ActorResolver` — for resolving the current actor identity
- `specs: ReadonlyMap<string, SpecRepository>` — spec repositories keyed by workspace name, used for the `specExists` check during scaffolding

## Constraints

- The use case MUST NOT modify workspaces directly — they are always derived from `specIds`
- The use case MUST NOT validate spec IDs against the filesystem — specs may not yet exist
- Actor identity is only resolved when a persistence-worthy change occurs

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — `Change` entity, `updateSpecIds`, approval invalidation semantics
- [`specs/core/composition/spec.md`](../composition/spec.md) — wiring and port injection
