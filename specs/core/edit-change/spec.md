# EditChange

## Purpose

As a change evolves, its spec scope often needs to grow or shrink — but modifying the spec list has approval implications that must be enforced consistently. The `EditChange` use case adds or removes spec IDs on an existing change, derives workspaces from the resulting `specIds` via the `Change.workspaces` getter, and triggers approval invalidation whenever the spec list effectively changes.

## Requirements

### Requirement: Input contract

`EditChange.execute` SHALL accept an `EditChangeInput` with the following fields:

- `name` (required, string) — the change slug to edit
- `addSpecIds` (optional, string array) — spec IDs to add to the change's `specIds`
- `removeSpecIds` (optional, string array) — spec IDs to remove from the change's `specIds`
- `description` (optional, string) — new description for the change

### Requirement: Invalidation policy edits

`EditChange.execute` SHALL accept an optional structured `invalidation` update whose `artifacts` value is `none | surgical | downstream | global` and whose `workflow` value is `preserve | redesign`.

Updating either dimension is persistence-worthy even when scope and description are unchanged. It changes the default used by later reconciliation but MUST NOT invent drift, reopen files, restore validity, or move lifecycle state by itself. The v2 manifest SHALL persist only the structured shape.

### Requirement: Change lookup

The use case MUST throw `ChangeNotFoundError` when no change with the given name exists.

Snapshot reads via `ChangeRepository.get(name)` MAY be used for read-only early returns, but any effective update to an existing persisted change's `specIds` MUST be performed through `ChangeRepository.mutate(name, fn)` so the mutation runs against fresh persisted state.

### Requirement: No-op when no spec changes requested

If both `addSpecIds` and `removeSpecIds` are absent or empty BUT `description` is provided, the use case MUST update the change's description and return with `invalidated: false`.

If NO specification changes are requested at all (no addSpecIds, no removeSpecIds, no description), the use case MUST return the unchanged change with `invalidated: false` without persisting or resolving actor identity.

### Requirement: Description update does not invalidate

When the only modification requested is updating the description field (no addSpecIds or removeSpecIds), the use case MUST update `Change.description` and return with `invalidated: false`. The change remains in its current state without triggering approval invalidation.

### Requirement: Removal precedes addition

When both `removeSpecIds` and `addSpecIds` are provided, removals MUST be applied before additions. This allows a caller to replace a spec ID by removing the old one and adding the new one in a single call.

### Requirement: Removal of absent spec throws

If any spec ID in `removeSpecIds` is not present in the change's current `specIds`, the use case MUST throw `SpecNotInChangeError` for that spec ID. Removal is atomic per ID — the first missing ID aborts the entire operation.

### Requirement: Addition is idempotent

If a spec ID in `addSpecIds` already exists in the change's `specIds` (after removals), it MUST be silently skipped — no duplicate is added and no error is thrown.

### Requirement: Seed specDependsOn for added specs

When `EditChange.execute` effectively adds a spec ID that was not already present in the change, it MUST seed `change.specDependsOn` for that spec before returning the updated change.

Seeding rules:

- Seeding applies only to spec IDs newly entering the change scope.
- If the repository exposes persisted dependency state for the spec via `readPersistedDependsOn(spec)`, that value MUST be used.
- Otherwise, if canonical `metadata.json.dependsOn` exists for the spec, that value MUST be used as the legacy fallback even when the persisted metadata file is stale.
- Otherwise, the seeded value is an empty array.
- If the spec already has an entry in `change.specDependsOn`, `EditChange` MUST NOT overwrite it just because the scope was edited again later.

This seeding establishes the baseline dependency snapshot for the change so later artifact validation and archive do not start from an empty dependency set for existing specs.

### Requirement: No-op when specIds unchanged after processing

If the resulting `specIds` list is identical (same length, same order) to the change's current `specIds`, the use case MUST return the unchanged change with `invalidated: false` without persisting.

### Requirement: Approval invalidation on effective change

When `specIds` effectively change, `EditChange` SHALL run the scope update and central validity reconciliation within one serialized repository mutation. The reconciler compares the fresh post-edit canonical scope with the scope-aware spec-approval fingerprint, reports explicit `spec-added` and `spec-removed` differences, and determines affected artifact review, approval and verification staleness or revocation, and required recovery while retaining all prior audit events. Reordering or normalization that leaves the canonical spec set unchanged MUST NOT stale approval.

A required spec approval made stale by scope change SHALL cause an immediate return to `designing` even when `invalidation.workflow` is `preserve`. Without a required spec gate, `preserve` retains the current lifecycle state but unresolved non-task artifact review blocks forward progress. Sign-off and verification are invalidated only when their independently fingerprinted input set changes.

`EditChange` MUST NOT independently append recovery transitions or delete approval history. The repository persists the reconciled result before returning.

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

### Requirement: Implementation tracking refresh on spec change

When the canonical `specIds` set actually changes (`scopeChanged: true`), `EditChange` MUST invoke an available `RefreshImplementationTracking.execute({ name })` after the scope mutation to sweep links to removed specs. This refresh MUST NOT depend on `invalidated` or `validityChanged`: an ungated preserve edit may change scope without changing an existing approval projection.

### Requirement: Output contract

`EditChange.execute` SHALL return the reconciled change, `scopeChanged`, whether validity actually changed, the effective structured policy, projection status changes, affected artifact files, canonical blockers, next action, and any automatic lifecycle return. Description-only, canonical no-op scope, and policy-only edits report no invented invalidation. A legacy compatibility field named `invalidated`, if retained temporarily, SHALL reflect actual validity change rather than scope change and SHALL be deprecated.

### Requirement: Dependencies

`EditChange` SHALL receive `ChangeRepository`, `ListWorkspaces`, `ActorResolver`, `SchemaProvider`, the central validity reconciler, and an optional `RefreshImplementationTracking` through constructor dependencies. The application obtains workspace-specific `SpecRepository` views through `ListWorkspaces`; callers MUST NOT supply a separate `ReadonlyMap<string, SpecRepository>` as a competing source of workspace truth. The actor is resolved only when a persistence-worthy edit occurs, and the same decorated identity is used by the edit and reconciliation audit events.

The config-based factory SHALL resolve these dependencies through `CompositionResolver`. Direct-dependency and config-based forms MUST have equivalent behavior.

### Requirement: Config-based factory delegates through resolveEditChangeDeps

The config-based `createEditChange(config, options?)` form MUST derive `EditChangeDeps` through `resolveEditChangeDeps(resolver)` and then delegate to canonical `createEditChange(deps)`.

`resolveEditChangeDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`
- `listWorkspaces: ListWorkspaces`
- `actor: ActorResolver`
- `schemaProvider: SchemaProvider`
- `refreshImplementationTracking?: RefreshImplementationTracking`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- The use case MUST NOT modify workspaces directly — they are always derived from `specIds`
- The use case MUST NOT validate spec IDs against the filesystem — specs may not yet exist
- Actor identity is only resolved when a persistence-worthy change occurs

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:composition`](../composition/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
- [`core:list-workspaces`](../list-workspaces/spec.md) — workspace-owned repository views used by edit orchestration
