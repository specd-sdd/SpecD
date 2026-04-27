# GetStatus

## Purpose

Users and tooling need a quick way to see where a change stands — both its lifecycle state and which artifacts are actually ready — without loading file content. The `GetStatus` use case loads a single change by name and reports its current lifecycle state along with the effective status of each artifact, cascading through dependency chains so that an artifact whose hashes match may still show `in-progress` if any of its required dependencies are not `complete`.

## Requirements

### Requirement: Accepts a change name as input

`GetStatus.execute()` MUST accept a `GetStatusInput` containing a `name` string that identifies the change to look up.

### Requirement: Returns the change and its artifact statuses

On success, `execute()` MUST return a `GetStatusResult` containing:

- `change` — the loaded `Change` entity with its current artifact state
- `artifactStatuses` — an array of `ArtifactStatusEntry` objects, one per artifact attached to the change
- `review` — a derived review summary for agents and CLI serializers
- `blockers` — an array of active blockers preventing progress
- `nextAction` — a recommended next action to guide the actor

Each `ArtifactStatusEntry` MUST contain:

- `type` — the artifact type identifier (e.g. `'proposal'`, `'specs'`)
- `state` — the persisted aggregate artifact state
- `effectiveStatus` — the dependency-aware artifact status used for legacy compatibility and lifecycle explanations
- `files` — an array of `ArtifactFileStatus` objects, one per file in the artifact

Each `ArtifactFileStatus` MUST contain:

- `key` — the file key (artifact type id for `scope: change`, spec ID for `scope: spec`)
- `filename` — the relative filename within the change directory
- `state` — the persisted state of that individual file
- `validatedHash` — the stored validation hash or skip sentinel

The `review` object MUST contain:

- `required: boolean`
- `route: 'designing' | null`
- `reason: 'artifact-drift' | 'artifact-review-required' | 'spec-overlap-conflict' | null`
- `affectedArtifacts` — a grouped list of artifact IDs with concrete affected files currently in `pending-review` or `drifted-pending-review`
- `overlapDetail` — details about overlapping changes when reason is `spec-overlap-conflict`

A `Blocker` object MUST contain:

- `code` — a unique machine-readable error code (e.g. `'ARTIFACT_DRIFT'`, `'MISSING_ARTIFACT'`)
- `message` — a human-readable description of the blocker

The `nextAction` object MUST contain:

- `targetStep` — the lifecycle step this action targets
- `actionType` — `'cognitive'` (requires human/agent thought) or `'mechanical'` (can be automated)
- `reason` — a short human-readable reason for the recommendation
- `command` — the recommended CLI command to run

Each review file entry inside `affectedArtifacts` MUST contain:

- `filename` — the artifact file's relative filename within the change directory
- `path` — the artifact file's absolute filesystem path
- `key` — the file key used internally to match persisted invalidation history to current artifact files; included as supplemental context, not as the primary outward-facing identifier

`review.required` is `true` if at least one file is in `pending-review` or `drifted-pending-review`; otherwise it is `false`.

`review.reason` is:

- `'artifact-drift'` when at least one file is `drifted-pending-review`
- `'spec-overlap-conflict'` when no file is drifted, but unhandled overlap invalidations exist
- `'artifact-review-required'` when no file is drifted or overlapping, but at least one file is `pending-review`
- `null` when `review.required` is `false`

`review.route` is `'designing'` whenever `review.required` is `true`, otherwise `null`.

`GetStatus` MUST resolve `review.affectedArtifacts` against the current artifact file entries so agent-facing consumers can inspect the actual file directly. The outward-facing review summary MUST prioritize `filename` and `path`; consumers must not need to understand manifest-internal file keys in order to locate the affected artifact.

### Requirement: Throws ChangeNotFoundError for unknown changes

If no change with the given name exists in the repository, `execute()` MUST throw a `ChangeNotFoundError` with code `CHANGE_NOT_FOUND`. It MUST NOT return `null`.

### Requirement: Constructor dependencies

`GetStatus` MUST accept the following constructor arguments:

- `changes: ChangeRepository` — for loading changes by name
- `schemaProvider: SchemaProvider` — for obtaining the fully-resolved active schema
- `approvals: { readonly spec: boolean; readonly signoff: boolean }` — whether approval gates are active

It MUST delegate to `ChangeRepository.get(name)` to load the change. `SchemaProvider` replaces the previous `SchemaRegistry` + `schemaRef` + `workspaceSchemasPaths` triple, providing the fully-resolved schema with plugins and overrides applied.

### Requirement: Reports effective status for every artifact

The `artifactStatuses` array MUST contain exactly one entry per artifact in the change's artifact map. It MUST NOT omit artifacts and MUST NOT include entries for artifacts that do not exist on the change.

### Requirement: Returns lifecycle context

`GetStatus` MUST compute a `ReviewSummary` that determines whether the change requires artifact review and why.

The review check MUST follow this priority order:

1. **If any artifact file is in `drifted-pending-review` state:** `required` is `true`, `reason` is `'artifact-drift'`, `route` is `'designing'`.
2. **Else if any artifact file is in `pending-review` state and there are unhandled `spec-overlap-conflict` invalidations:** `required` is `true`, `reason` is `'spec-overlap-conflict'`, `route` is `'designing'`.
3. **Else if any artifact file is in `pending-review` state:** `required` is `true`, `reason` is `'artifact-review-required'`, `route` is `'designing'`.
4. **Else:** `required` is `false`, `reason` is `null`, `route` is `null`.

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

## Constraints

- The use case does not modify the change — it is a read-only query
- Artifact content is not loaded; only status metadata is returned
- The effective status computation is delegated to the `Change` entity, not performed by the use case itself
- The `lifecycle` computation adds zero additional I/O beyond schema resolution — `VALID_TRANSITIONS` is a static lookup, `effectiveStatus` is already computed, and `schema.workflowStep()` / `schema.artifacts()` are in-memory after resolution
- `changePath` is obtained from `ChangeRepository.changePath(change)` which the repository already exposes

## Spec Dependencies

- [`core:core/change`](../change/spec.md) — change entity and artifact state model
- [`core:core/kernel`](../kernel/spec.md) — kernel wiring for `GetStatus`
- [`core:core/transition-change`](../transition-change/spec.md) — lifecycle gating and transition rules
- [`core:core/schema-format`](../schema-format/spec.md) — `SchemaProvider`, workflow, and artifact definitions
- [`core:core/config`](../config/spec.md) — project approval configuration
