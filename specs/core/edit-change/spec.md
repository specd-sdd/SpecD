# EditChange

## Purpose

As a change evolves, its spec scope often needs to grow or shrink — but modifying the spec list has approval implications that must be enforced consistently. The `EditChange` use case adds or removes spec IDs on an existing change, derives workspaces from the resulting `specIds` via the `Change.workspaces` getter, and triggers approval invalidation whenever the spec list effectively changes.

## Requirements

### Requirement: Input contract

`EditChange.execute` SHALL accept an `EditChangeInput` with the following fields:

- `name` (required, string) — the change slug to edit
- `addSpecIds` (optional, string array) — spec IDs to add to the change's `specIds`; each entry is one whole spec ID, validated and normalized per "Spec ID validation"
- `removeSpecIds` (optional, string array) — spec IDs to remove from the change's `specIds`; each entry is one whole spec ID and is never split
- `description` (optional, string) — new description for the change
- `invalidation` (optional, `{ artifacts?, workflow? }`) — partial update of the change's invalidation policy: a provided dimension replaces only that dimension, see "Invalidation policy edits"

### Requirement: Spec ID validation

Before any mutation, the use case MUST validate and normalize every entry of `addSpecIds` with `parseSpecId` and the configured workspaces (see `core:spec-id-format`) and store the fully-qualified IDs. An invalid ID fails with `InvalidSpecIdError` and an unknown workspace with `WorkspaceNotFoundError`, quoting the full original value, and nothing is persisted when any entry is invalid.

Entries of `removeSpecIds` are not validated for syntax: an entry that is not in the change's `specIds` fails with `SpecNotInChangeError`, never with `InvalidSpecIdError`. A change manifest that already holds an invalid stored ID cannot be loaded (it fails as corrupted), so removal of such an ID is not offered by this use case. A valid entry is normalized to its fully-qualified form before matching; an entry that cannot be normalized is compared as given. Duplicate entries in `removeSpecIds` (after normalization) collapse to one removal, the same way duplicate `addSpecIds` entries collapse to one addition; a duplicate never raises `SpecNotInChangeError`. Validation checks syntax and workspace only; the spec may not exist yet.

### Requirement: ReadOnly workspace rejection

After normalizing `addSpecIds` and before any mutation, the use case MUST check the `ownership` of the workspace of every added spec (from the injected workspaces). When one or more added specs belong to a `readOnly` workspace, the use case MUST throw `ReadOnlyWorkspaceError` and persist nothing. The message MUST contain one line per offending spec in the form `Cannot add spec "<specId>" to change — workspace "<workspace>" is readOnly.`, followed by the sentence `ReadOnly workspaces are protected: their specs and code cannot be modified by changes.`, and MUST NOT suggest remediation steps (see `core:workspace`).

`removeSpecIds` is not subject to ownership checks: removing a spec from a change does not write to the workspace. This rule lives in the use case so that every delivery mechanism (CLI, MCP, SDK) enforces it.

### Requirement: Invalidation policy edits

`EditChange.execute` SHALL accept an optional structured `invalidation` update whose `artifacts` value is `none | surgical | downstream | global` and whose `workflow` value is `preserve | redesign`.

Before any mutation the use case MUST reject any other value for `invalidation.artifacts` (allowed: `none`, `surgical`, `downstream`, `global`) or `invalidation.workflow` (allowed: `preserve`, `redesign`) with `InvalidInputError`, quoting the full original value and listing the allowed values, and it MUST persist nothing. The check lives in the use case so that every delivery mechanism (CLI, MCP, SDK) enforces it; a host's type cast is not validation.

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

### Requirement: Host-neutral SpecNotInChangeError

When `EditChange` throws `SpecNotInChangeError` (`SPEC_NOT_IN_CHANGE`), the error `message` MUST state that the spec is not in the change's `specIds` in host-neutral terms without embedding CLI commands such as `specd specs show`. The error MUST expose `specId` and `changeName` as structured metadata properties.

### Requirement: Addition is idempotent

If a spec ID in `addSpecIds` already exists in the change's `specIds` (after removals), it MUST be silently skipped — no duplicate is added and no error is thrown.

### Requirement: Seed specDependsOn for added specs

When `EditChange.execute` effectively adds a spec ID that was not already present in the change, it MUST seed `change.specDependsOn` for that spec before returning the updated change.

Seeding rules:

- Seeding applies only to spec IDs newly entering the change scope.
- If the spec already has an entry in `change.specDependsOn`, `EditChange` MUST NOT overwrite it just because the scope was edited again later.
- Otherwise the seeded value is the `dependsOn` of the spec's persisted state, read through the spec repository's `readPersistedState(spec)` (the `spec-lock.json` state). No fallback to `metadata.json.dependsOn` exists.
- If the workspace is unknown, the spec does not exist in its repository, or the repository has no persisted state for it, the seeded value is an empty array.

This seeding establishes the baseline dependency snapshot for the change so later artifact validation and archive do not start from an empty dependency set for existing specs.

### Requirement: No-op when specIds unchanged after processing

If the resulting `specIds` list is identical (same length, same order) to the change's current `specIds`, the use case MUST return the unchanged change with `invalidated: false` without persisting.

### Requirement: Approval invalidation on effective change

When `specIds` effectively change, `EditChange` SHALL run the scope update and central validity reconciliation within one serialized repository mutation. The reconciler compares the fresh post-edit canonical scope with the scope-aware spec-approval fingerprint, reports explicit `spec-added` and `spec-removed` differences, and determines affected artifact review, approval and verification staleness or revocation, and required recovery while retaining all prior audit events. Reordering or normalization that leaves the canonical spec set unchanged MUST NOT stale approval.

A required spec approval made stale by scope change SHALL cause an immediate return to `designing` from any state after `ready`, even when `invalidation.workflow` is `preserve`. In `ready` no return is requested: `approval.spec` blocks leaving `ready` and consent is renewed there, so the change stays in `ready` with the approval reported stale. Without a required spec gate, `preserve` retains the current lifecycle state but unresolved non-task artifact review blocks forward progress. Sign-off and verification are invalidated only when their independently fingerprinted input set changes.

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
- `resolveChangeSchema: ResolveChangeSchema`
- `refreshImplementationTracking: RefreshImplementationTracking`
- `reconcile: ReconcileChangeValidity`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

### Requirement: Schema compatibility guardrail

When `addSpecIds` is provided, the system MUST verify that every new spec is compatible with the Change's sovereign schema (resolved through `ResolveChangeSchema`). For every added spec:

1. If the spec has no persisted semantic state (uninitialized) or its persisted state lacks a schema definition, the spec is compatible: it has no schema identity of its own and adopts the Change's schema. The workspace default or project global schema (`GetActiveSchema`) MUST NOT be consulted.
2. Otherwise, it extracts the spec's persisted schema identity (`name` and `version`).

A spec with a persisted schema identity is considered compatible if its schema name matches the Change's schema name, or if the Change's schema explicitly declares a `compat` property matching the spec's schema name.

If any added spec is found to be incompatible, the use case MUST throw an `IncompatibleSchemaError` and abort the edit operation without mutating the change.

### Requirement: Sovereign schema resolution

After loading the target change, `EditChange` MUST resolve its direct schema-dependent compatibility decision through `ResolveChangeSchema` rather than through the workspace default schema.

`EditChange` MUST resolve that sovereign schema once before mutation when validating added-spec compatibility. Inside the serialized repository mutation it MUST update the fresh persisted change with `replaceSpecIds()` and delegate artifact-DAG and validity synchronization to the canonical reconciler through `ctx.reconcileAfter()`. It MUST NOT call `updateSpecIds()` or perform a second direct schema lookup for synchronization, because the reconciler owns that decision against the fresh persisted change.

A workspace default that differs from `change.schemaName` MUST NOT affect compatibility results, artifact topology, or invalidation. A compatibility schema-resolution error MUST abort before mutation, and a reconciliation error MUST prevent persistence of a partial scope edit.

## Constraints

- The use case MUST NOT modify workspaces directly — they are always derived from `specIds`
- The use case MUST NOT validate that a spec exists in the filesystem — specs may not yet exist; it does validate spec ID syntax and workspace
- The use case never splits a spec ID on commas or any other character
- Actor identity is resolved only when the request contains an edit to apply (a description, an invalidation policy, or spec changes); a request with nothing to apply does not resolve it and does not mutate

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:composition`](../composition/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
- [`core:list-workspaces`](../list-workspaces/spec.md) — workspace-owned repository views used by edit orchestration
- [core:resolve-change-schema](../resolve-change-schema/spec.md) — named sovereign lookup, provider identity validation, and same-name version advisory
- [`core:spec-id-format`](../spec-id-format/spec.md) — spec ID validation and normalization of the input IDs
- [`core:workspace`](../workspace/spec.md) — workspace ownership (`readOnly` rejection) and workspace names
