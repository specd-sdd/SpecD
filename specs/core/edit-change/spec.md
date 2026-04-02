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

The use case MUST throw `ChangeNotFoundError` when no change with the given name exists.

Snapshot reads via `ChangeRepository.get(name)` MAY be used for read-only early returns, but any effective update to an existing persisted change's `specIds` MUST be performed through `ChangeRepository.mutate(name, fn)` so the mutation runs against fresh persisted state.

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

When the resulting `specIds` differ from the current set, the use case MUST resolve the current actor identity, then update the change inside `ChangeRepository.mutate(name, fn)`.

Inside the mutation callback, the use case MUST call `change.updateSpecIds(specIds, actor)` on the fresh persisted `Change`. This is the operation that invalidates active approvals and appends the corresponding history events for a spec-scope change.

The repository MUST persist the updated change before `EditChange.execute` returns an `invalidated: true` result.

### Requirement: Directory cleanup on removal

When the resulting `specIds` differ from the current set due to removals, the use
case MUST call `ChangeRepository.unscaffold(change, removedSpecIds)` to remove the
scaffolded directories for each removed spec from the change directory. This call
MUST happen after the change is persisted and before returning the result. If any
directory contains files, they MUST be removed along with the directory.

Directories to remove follow the change directory layout:

- `specs/<workspace>/<capability-path>/` — new-spec artifact directories
- `deltas/<workspace>/<capability-path>/` — delta artifact directories

The `unscaffold` operation is idempotent — if a directory does not exist, it
is silently skipped.

### Requirement: Output contract

`EditChange.execute` MUST return an `EditChangeResult` with:

- `change` — the `Change` entity (updated or unchanged)
- `invalidated` — `true` if approvals were invalidated, `false` otherwise

### Requirement: Dependencies

### Requirement: Dependencies

`EditChange` depends on the following ports injected via constructor:

- `ChangeRepository` — for loading, persisting, scaffolding, and unscaffolding changes
- `ActorResolver` — for resolving the current actor identity
- `specs: ReadonlyMap<string, SpecRepository>` — spec repositories keyed by workspace name, used for the `specExists` check during scaffolding

## Constraints

- The use case MUST NOT modify workspaces directly — they are always derived from `specIds`
- The use case MUST NOT validate spec IDs against the filesystem — specs may not yet exist
- Actor identity is only resolved when a persistence-worthy change occurs

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — `Change` entity, `updateSpecIds`, approval invalidation semantics
- [`specs/core/composition/spec.md`](../composition/spec.md) — wiring and port injection
