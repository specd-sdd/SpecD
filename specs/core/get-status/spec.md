# GetStatus

## Purpose

Users and tooling need a quick way to see where a change stands — both its lifecycle state and which artifacts are actually ready — without loading file content. The `GetStatus` use case loads a single change by name and reports its current lifecycle state along with the effective status of each artifact, cascading through dependency chains so that an artifact whose hashes match may still show `in-progress` if any of its required dependencies are not `complete`.

## Requirements

### Requirement: Accepts a change name as input

`GetStatus.execute()` MUST accept a `GetStatusInput` containing:

- `name` (string, required) — the change name to look up
- `refreshImplementationTracking` (boolean, optional) — when omitted or `true`, refresh tracked implementation files before loading status for **active** changes only; when `false`, skip refresh

### Requirement: Returns the change and its artifact statuses

On success, `execute()` MUST return a `GetStatusResult` containing:

- `change` — the loaded active `Change` when the name resolves under `changes/`; MUST be absent when only a draft exists
- `draftView` — a `DraftedChangeView` when the name resolves only under `drafts/`; MUST be absent for active changes
- `artifactStatuses` — an array of `ArtifactStatusEntry` objects, one per artifact attached to the change
- `specDependsOn` — the map of declared spec dependencies from the change manifest
- `review` — a derived review summary for agents and CLI serializers
- `blockers` — an array of active blockers preventing progress
- `nextAction` — a recommended next action to guide the actor

Resolution order:

1. `ChangeRepository.get(name)` for active storage
2. If null, `ChangeRepository.getDraft(name)` for drafted storage

If both are null, the use case MUST throw `ChangeNotFoundError`.

`GetStatus` MUST NOT call `ChangeRepository.getDiscarded` or load `discarded/` storage. Discarded changes MUST be inspected via `GetDiscarded` (for example `specd discarded show`).

When `draftView` is present, the use case MUST compute artifact and lifecycle projections for inspection only. It MUST NOT expose a mutable `Change` to callers and MUST NOT surface transitions that would mutate the drafted change (`availableTransitions` MUST be empty; `nextAction.command` MUST NOT recommend transition or validate commands).

(rest of requirement content remains unchanged...)

### Requirement: Drafted change read-only status

When `GetStatus` loads a change exclusively via `getDraft`, the result MUST satisfy [`core:drafted-change-view`](../drafted-change-view/spec.md).

The use case MAY use an internal `Change` loaded from drafted storage to compute artifact effective statuses, but that instance MUST NOT appear on `GetStatusResult`.

Drafted status responses MUST be suitable for `drafts show` and read-only CLI inspection without enabling lifecycle mutation.

### Requirement: Implementation status projection

`GetStatusResult` SHALL include implementation-tracking data for delivery layers.

That projection MUST include:

- tracked implementation files with review state
- confirmed implementation links, including file-level links and symbol-level refinements

### Requirement: Optional pre-read implementation tracking refresh

When `refreshImplementationTracking` is not `false` (default `true`) and `ChangeRepository.get(name)` returns a non-null active change, `GetStatus` MUST invoke `RefreshImplementationTracking.execute({ name })` before loading status.

When the change resolves only via `ChangeRepository.getDraft(name)`, or when `refreshImplementationTracking` is `false`, `GetStatus` MUST NOT invoke `RefreshImplementationTracking`.

`GetStatus` MUST NOT invoke `ImplementationDetector` directly and MUST NOT duplicate refresh merge logic.

After any refresh, `GetStatus` MUST project implementation-tracking data from the persisted change state loaded by `ChangeRepository`.

### Requirement: Drift-aware display status

GetStatus SHALL preserve canonical persisted state in `state` / `effectiveStatus`, but it SHALL additionally provide human-facing display-state projections for artifact files and aggregated artifacts.

Each ArtifactFileStatus MUST include:

- `hasDrift` — whether the current file state differs from the validated baseline
- `displayStatus` — a human-facing projection derived from canonical state plus `hasDrift`

Each ArtifactStatusEntry MUST include:

- `displayStatus` — the aggregated human-facing projection for the artifact

`displayStatus` for files SHALL render `complete-with-drift` only when canonical state is `complete` and `hasDrift=true`.

`displayStatus` for aggregated artifacts SHALL be derived from file-level display states, using precedence that keeps real workflow states stronger than display-only drift projections.

### Requirement: Reports task completion counts for task-capable artifacts

When the schema artifact type has `hasTasks: true` and declares `taskCompletionCheck`, `GetStatus` MUST obtain task-completion counts from `CountTasks`.

The task completion counts MUST be exposed as an optional `taskCompletion` field on each `ArtifactStatusEntry` that corresponds to a task-capable artifact with qualifying content. `GetStatus` MUST map that field from `CountTasksResult.byArtifact` by artifact type ID.

The `taskCompletion` object MUST contain:

- `complete` — count of complete task items (matched via `completePattern`)
- `incomplete` — count of incomplete task items (matched via `incompletePattern`)
- `total` — sum of complete and incomplete; omitted patterns use the schema defaults.

When the artifact file does not exist or the file content is empty, the `taskCompletion` field MUST be omitted.

### Requirement: Throws ChangeNotFoundError for unknown changes

If no change with the given name exists in the repository, `execute()` MUST throw a `ChangeNotFoundError` with code `CHANGE_NOT_FOUND`. It MUST NOT return `null`.

### Requirement: Constructor dependencies

`GetStatus` MUST accept the following constructor arguments:

- `changes: ChangeRepository` — for loading changes by name
- `schemaProvider: SchemaProvider` — for obtaining the fully-resolved active schema
- `lifecycle: LifecycleEngine` — for deriving effective artifact status, blockers, routing, and next-action guidance from the change plus active schema
- `approvals: { readonly spec: boolean; readonly signoff: boolean }` — whether approval gates are active
- `refreshImplementationTracking: RefreshImplementationTracking` — primitive used for optional pre-read refresh
- `countTasks: CountTasks` — required shared query for task-completion counts

It MUST load the change via `ChangeRepository.get(name)` and, when that returns `null`, via `ChangeRepository.getDraft(name)`. It MUST NOT use `getDiscarded`.

`SchemaProvider` replaces the previous `SchemaRegistry` + `schemaRef` + `workspaceSchemasPaths` triple, providing the fully-resolved schema with plugins and overrides applied.

`GetStatus` MUST NOT accept `ImplementationDetector` and MUST NOT invoke implementation autodetection directly.

### Requirement: Config-based factory preserves complete repository bootstrap

When `createGetStatus(config)` wires `GetStatus` from `SpecdConfig`, the resulting read path MUST preserve complete change-repository bootstrap semantics, including schema-driven artifact-type behavior needed for status derivation.

The config-based factory MUST NOT assemble a weaker repository variant that can report different artifact states for the same persisted change than the canonical status read path.

### Requirement: Reports effective status for every artifact

The `artifactStatuses` array MUST contain exactly one entry per artifact in the change's artifact map. It MUST NOT omit artifacts and MUST NOT include entries for artifacts that do not exist on the change.

`GetStatus` MUST derive each entry's `effectiveStatus` through `LifecycleEngine` so the reported value reflects recursive dependency blocking, workflow requirements, and approval-gate semantics from the active schema rather than only persisted aggregate artifact state.

### Requirement: Returns lifecycle context

`GetStatus` MUST compute a `ReviewSummary` that determines whether the change requires artifact review and why.

The review check MUST follow this priority order:

1. **If any artifact file is in `drifted-pending-review` state:** `required` is `true`, `reason` is `'artifact-drift'`, `route` is `'designing'`.
2. **Else if any artifact file is in `pending-review` state and there are unhandled `spec-overlap-conflict` invalidations:** `required` is `true`, `reason` is `'spec-overlap-conflict'`, `route` is `'designing'`.
3. **Else if any artifact file is in `pending-review` state:** `required` is `true`, `reason` is `'artifact-review-required'`, `route` is `'designing'`.
4. **Else:** `required` is `false`, `reason` is `null`, `route` is `null`.

`GetStatus` MAY compute this summary directly from the loaded change facts or obtain it from `LifecycleEngine`, but the outward-facing result MUST reflect the same authoritative lifecycle interpretation used by transition and validation flows.

**Unhandled overlap collection:** To determine unhandled `spec-overlap-conflict` invalidations, `GetStatus` MUST scan `change.history` in reverse (newest to oldest) collecting `invalidated` events with `cause: 'spec-overlap-conflict'`. The scan MUST stop at the first `transitioned` event whose `to` field is not `'designing'` — this indicates the change moved forward from a prior invalidation and those earlier overlaps were already handled. If no such boundary event is found, the scan includes all matching events back to the beginning of history.

`ReviewSummary.reason` type MUST be extended to: `'artifact-drift' | 'artifact-review-required' | 'spec-overlap-conflict' | null`.

When `reason` is `'spec-overlap-conflict'`, `ReviewSummary` MUST additionally include:

- `overlapDetail` — an array of `OverlapEntry` objects, one per unhandled `spec-overlap-conflict` invalidation event, each containing:
  - `archivedChangeName` — the name of the archived change that caused the overlap (extracted from the `invalidated.message`)
  - `overlappingSpecIds` — readonly array of spec IDs that overlapped (extracted from the `invalidated.message`)
    The array is ordered newest-first (matching the reverse scan order). This preserves the full picture when multiple changes were archived with overlapping specs before the current change was able to address any of them.

When `reason` is not `'spec-overlap-conflict'`, `overlapDetail` MUST be an empty array.

### Requirement: Identifies blockers

`GetStatus` MUST identify explicit blockers that prevent lifecycle progression.

Blockers MUST be collected for:

- **Artifact Drift**: code `'ARTIFACT_DRIFT'` if `review.reason` is `'artifact-drift'`.
- **Review Required**: code `'REVIEW_REQUIRED'` if `review.reason` is `'artifact-review-required'`.
- **Overlap Conflict**: code `'OVERLAP_CONFLICT'` if `review.reason` is `'spec-overlap-conflict'`.
- **Missing Artifacts**: code `'MISSING_ARTIFACT'` for each artifact in the current state's `requires` list that is in `missing` or `in-progress` state.

`GetStatus` MAY assemble these blockers directly or obtain them from `LifecycleEngine`, but the blocker set MUST be derived from the same authoritative lifecycle interpretation used for effective statuses and transition validation.

### Requirement: Graceful degradation when schema resolution fails

If `SchemaProvider.get()` throws, the `lifecycle` object MUST still be present with degraded values:

- `validTransitions` MUST be populated normally (it is a static lookup, independent of schema)
- `availableTransitions` MUST be an empty array
- `blockers` MUST be an empty array
- `approvals` MUST be populated normally (it is injected config, independent of schema)
- `nextArtifact` MUST be `null`
- `changePath` MUST be populated normally
- `schemaInfo` MUST be `null`

The use case MUST NOT throw when schema resolution fails — it degrades the lifecycle fields silently. It MUST wrap the `SchemaProvider.get()` call in a `try/catch` to achieve this.

### Requirement: Config-based factory delegates through resolveGetStatusDeps

The config-based `createGetStatus(config, options?)` form MUST derive `GetStatusDeps` through `resolveGetStatusDeps(resolver)` and then delegate to canonical `createGetStatus(deps)`.

`resolveGetStatusDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`
- `schemaProvider: SchemaProvider`
- `approvals: { readonly spec: boolean; readonly signoff: boolean }`
- `refreshImplementationTracking: RefreshImplementationTracking`
- `lifecycle: LifecycleEngine`
- `countTasks: CountTasks`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- The use case does not modify the change — it is a read-only query.
- Artifact content is not loaded for lifecycle and artifact-status metadata. When task-completion projection is applicable, `GetStatus` delegates the required content reads to `CountTasks`.
- The effective status computation may be delegated to `LifecycleEngine`; it is not an entity-owned concern of `Change`.
- The lifecycle computation adds zero additional I/O beyond schema resolution — `VALID_TRANSITIONS` is a static lookup, while derived lifecycle interpretation is computed in memory from the loaded change, schema, and approval config.
- `changePath` is obtained from `ChangeRepository.changePath(change)` which the repository already exposes.

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:kernel`](../kernel/spec.md)
- [`core:transition-change`](../transition-change/spec.md)
- [`core:schema-format`](../schema-format/spec.md)
- [`core:config`](../config/spec.md)
- [`core:lifecycle-engine`](../lifecycle-engine/spec.md)
- [`core:refresh-implementation-tracking`](../refresh-implementation-tracking/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
- [`core:count-tasks`](../count-tasks/spec.md) — supplies shared task-completion counts.
