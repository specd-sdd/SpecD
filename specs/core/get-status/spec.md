# GetStatus

## Purpose

Users and tooling need a quick way to see where a change stands — both its lifecycle state and which artifacts are actually ready — without loading file content. The `GetStatus` use case loads a single change by name and reports its current lifecycle state along with the effective status of each artifact, cascading through dependency chains so that an artifact whose hashes match may still show `in-progress` if any of its required dependencies are not `complete`.

## Requirements

### Requirement: Accepts a change name as input

`GetStatus.execute()` MUST accept a `GetStatusInput` containing:

- `name` (string, required) — the change name to look up
- `refreshImplementationTracking` (boolean, optional) — when omitted or `true`, refresh tracked implementation files before loading status for **active** changes only; when `false`, skip refresh
- `ifModifiedSince` (string, optional) — client revision timestamp (ISO 8601 or any value accepted by `Date.parse`). Used for conditional status short-circuit against `change.updatedAt`

### Requirement: Returns the change and its artifact statuses

On success, `execute()` MUST return a `GetStatusResult` containing:

- `change` — the loaded active `Change` when the name resolves under `changes/`; MUST be absent when only a draft exists
- `draftView` — a `DraftedChangeView` when the name resolves only under `drafts/`; MUST be absent for active changes
- `unchanged` (boolean, optional) — when `true`, the client revision matched or exceeded `change.updatedAt` and full status evaluation was skipped (HTTP-304-style short-circuit)
- `artifactStatuses` — an array of `ArtifactStatusEntry` objects, one per artifact attached to the change; **except** when `unchanged` is `true`, in which case `artifactStatuses` MUST be an empty array (full projection intentionally omitted)
- `specDependsOn` — the map of declared spec dependencies from the change manifest
- `review` — a derived review summary for agents and CLI serializers; when `unchanged` is `true`, review MAY be a minimal stub (`required: false`)
- `blockers` — an array of active blockers preventing progress; when `unchanged` is `true`, blockers MUST be an empty array
- `nextAction` — a recommended next action to guide the actor; when `unchanged` is `true`, nextAction MAY indicate the client revision is current

Resolution order:

1. `ChangeRepository.get(name)` for active storage
2. If null, `ChangeRepository.getDraft(name)` for drafted storage

If both are null, the use case MUST throw `ChangeNotFoundError`.

`GetStatus` MUST NOT call `ChangeRepository.getDiscarded` or load `discarded/` storage. Discarded changes MUST be inspected via `GetDiscarded` (for example `specd discarded show`).

When `draftView` is present, the use case MUST compute artifact and lifecycle projections for inspection only. It MUST NOT expose a mutable `Change` to callers and MUST NOT surface transitions that would mutate the drafted change (`availableTransitions` MUST be empty; `nextAction.command` MUST NOT recommend transition or validate commands).

### Requirement: Revision evaluation for conditional status queries

`GetStatus` SHALL support optional client revision comparison via `ifModifiedSince`.

When `ifModifiedSince` is provided, `GetStatus` MUST parse it with `Date.parse`. If parsing yields a valid timestamp greater than or equal to `change.updatedAt.getTime()`, `GetStatus` SHALL short-circuit like HTTP 304:

- bypass full status re-evaluation (no full artifact effective-status projection, no full review/blocker recomputation)
- MUST NOT invoke `RefreshImplementationTracking`
- return `unchanged: true`
- return `artifactStatuses` as an empty array
- still return the loaded `change` and `specDependsOn`

When `ifModifiedSince` is omitted, unparseable (`NaN`), or strictly older than `change.updatedAt`, `GetStatus` MUST perform the normal full status evaluation path.

### Requirement: Drafted change read-only status

When `GetStatus` loads a change exclusively via `getDraft`, the result MUST satisfy [`core:drafted-change-view`](../drafted-change-view/spec.md).

The use case MUST compute artifact effective statuses via `projectArtifacts` only (the same DAG cascade as `evaluateLifecycleVerdict` with empty `checksByTarget`) so parent-review cascade appears. It MUST NOT call `evaluateLifecycle` or `evaluateLifecycleVerdict` on drafts. It MUST NOT expose a mutable `Change` to callers and MUST NOT surface mutating hops (`availableTransitions` / `availableSteps` MUST be empty; `nextArtifact` MUST be `null`; `nextAction.command` MUST NOT recommend transition or validate commands).

Drafted status responses MUST be suitable for `drafts show` and read-only CLI inspection without enabling lifecycle mutation.

### Requirement: Implementation status projection

`GetStatusResult` SHALL include implementation-tracking data for delivery layers.

That projection MUST include:

- tracked implementation files with review state
- confirmed implementation links, including file-level links and symbol-level refinements

### Requirement: Optional pre-read implementation tracking refresh

When `refreshImplementationTracking` is not `false` (default `true`) and `ChangeRepository.get(name)` returns a non-null active change, `GetStatus` MUST invoke `RefreshImplementationTracking.execute({ name })` before loading status — **except** when the `ifModifiedSince` short-circuit applies (client revision current), in which case `GetStatus` MUST NOT invoke `RefreshImplementationTracking`.

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

When the schema artifact type has `hasTasks: true` and declares `taskCompletionCheck`, `GetStatus` MUST expose task-completion counts from the `workflow.taskCompletion` check (which SHALL call `CountTasks` in its `execute`).

`GetStatus` MUST NOT call `evaluateLifecycle` first and then CountTasks only for painting `taskCompletion` on artifacts. `GetStatus` MUST NOT gather a global snapshot bag for all checks.

The task completion counts MUST be exposed as an optional `taskCompletion` field on each `ArtifactStatusEntry` that corresponds to a task-capable artifact with qualifying content. `GetStatus` MUST map that field from `CountTasksResult.byArtifact` by artifact type ID (from the check result details or the same CountTasks outcome that check already produced — it MUST NOT invoke `CountTasks` a second time).

The `taskCompletion` object MUST contain:

- `complete` — count of complete task items (matched via `completePattern`)
- `incomplete` — count of incomplete task items (matched via `incompletePattern`)
- `total` — sum of complete and incomplete; omitted patterns use the schema defaults.

When the artifact file does not exist or the file content is empty, the `taskCompletion` field MUST be omitted.

### Requirement: Execute matching predicates then project

Before composing lifecycle guidance, `GetStatus` MUST, for each protocol-legal candidate target, select matching **predicates** from the binding table and call `check.execute(ctx)` (see [`core:transition-checks`](../transition-checks/spec.md)). GetStatus MUST collect **every** matching predicate for each hop (no `protocol.edge` fail-fast) so blockers and the repair guide show the full why.

When `change.state` is `archivable`, GetStatus MUST also execute **all archive-scope predicates** (not `hook.pre` / `hook.post` effects) with `allowOverlap` and `allowOutOfScope` false. Live `spec.overlap` failure MAY then appear as public `OVERLAP_CONFLICT` with `--allow-overlap`. Invalidation-from-another-archive MUST NOT use that blocker (see review).

`CountTasks` MUST be memoized on the **current evaluation pass** so one `GetStatus.execute` counts once for all legal targets. The check MUST NOT cache counts on the Kernel-lived instance across executes.

`GetStatus` MUST NOT gather a global snapshot type for all checks. Each check obtains its own I/O through `create*` ports (`CountTasks` inside `workflow.taskCompletion`, extract inside `deps.consistent`, ownership inside `workspace.readOnly`, impl facts inside `impl.*`).

`evaluateLifecycle` MUST project `availableTransitions` / `nextAction` from those `CheckResult`s. Domain projection MUST remain I/O-free.

`GetStatus` MUST call `evaluateLifecycle` (domain verdict + application guidance) to obtain public `nextAction.command`. It MUST NOT read command strings from domain `nextHop`.

The status result MUST expose check-derived `availableTransitions` and `nextAction`. It MUST expose enough check rows (id, kind, outcome, code/message on fail) that a later dry-run UI does not need a second result type. `effect` rows MUST NOT be required for `allowed` on status.

### Requirement: Throws ChangeNotFoundError for unknown changes

If no change with the given name exists in the repository, `execute()` MUST throw a `ChangeNotFoundError` with code `CHANGE_NOT_FOUND`. It MUST NOT return `null`.

### Requirement: Constructor dependencies

`GetStatus` MUST accept the following constructor arguments:

- `changes: ChangeRepository` — for loading changes by name
- `schemaProvider: SchemaProvider` — for obtaining the fully-resolved active schema
- `approvals: { readonly spec: boolean; readonly signoff: boolean }` — whether approval gates are active
- `refreshImplementationTracking: RefreshImplementationTracking` — primitive used for optional pre-read refresh
- composed transition `Check` instances from `create*` factories (`CountTasks` lives only inside `createWorkflowTaskCompletion`, not as a `GetStatus` constructor gatherer)
- composed archive `Check` instances (`archiveBindings`) so `archivable` status can run archive predicates

`GetStatus` MUST NOT accept `evaluateLifecycle`, `LifecycleEngine`, or `CountTasks` as constructor dependencies. It MUST import `evaluateLifecycle` as a module function.

It MUST load the change via `ChangeRepository.get(name)` and, when that returns `null`, via `ChangeRepository.getDraft(name)`. It MUST NOT use `getDiscarded`.

`SchemaProvider` replaces the previous `SchemaRegistry` + `schemaRef` + `workspaceSchemasPaths` triple, providing the fully-resolved schema with plugins and overrides applied.

`GetStatus` MUST NOT accept `ImplementationDetector` and MUST NOT invoke implementation autodetection directly.

### Requirement: Config-based factory preserves complete repository bootstrap

When `createGetStatus(config)` wires `GetStatus` from `SpecdConfig`, the resulting read path MUST preserve complete change-repository bootstrap semantics, including schema-driven artifact-type behavior needed for status derivation.

The config-based factory MUST NOT assemble a weaker repository variant that can report different artifact states for the same persisted change than the canonical status read path.

### Requirement: Reports effective status for every artifact

When `unchanged` is not `true`, the `artifactStatuses` array MUST contain exactly one entry per artifact type declared by the active schema (`schema.artifacts()`). Entries for types not yet attached on the change MUST use persisted/effective status `missing`. It MUST NOT omit schema-declared types on the full evaluation path.

When `unchanged` is `true`, `artifactStatuses` MUST be empty (full projection omitted by the revision short-circuit).

On the full evaluation path, `GetStatus` MUST derive each entry's `effectiveStatus` through `evaluateLifecycle` / `projectArtifacts` so the reported value reflects recursive dependency blocking from the active schema rather than only persisted aggregate artifact state.

### Requirement: Returns lifecycle context

`GetStatus` MUST compute a `ReviewSummary` that determines whether the change requires artifact review and why.

The review check MUST follow this priority order:

1. **If any artifact file is in `drifted-pending-review` state:** `required` is `true`, `reason` is `'artifact-drift'`, `route` is `'designing'`.
2. **Else if any artifact file is in `pending-review` state and there are unhandled `spec-overlap-conflict` invalidations:** `required` is `true`, `reason` is `'spec-overlap-conflict'`, `route` is `'designing'`. `review.message` MUST be human prose (for example that a conflict was detected with archived overlapping specs). `nextAction.command` MUST be `/specd-design`. MUST NOT advertise `--allow-overlap` for this victim path.
3. **Else if any artifact file is in `pending-review` state:** `required` is `true`, `reason` is `'artifact-review-required'`, `route` is `'designing'`.
4. **Else:** `required` is `false`, `reason` is `null`, `route` is `null`.

`GetStatus` MAY compute this summary directly from the loaded change facts or obtain it from `evaluateLifecycle`, but the outward-facing result MUST reflect the same authoritative lifecycle interpretation used by transition and validation flows.

**Unhandled overlap collection:** To determine unhandled `spec-overlap-conflict` invalidations, `GetStatus` MUST scan `change.history` in reverse (newest to oldest) collecting `invalidated` events with `cause: 'spec-overlap-conflict'`. The scan MUST stop at the first `transitioned` event whose `to` field is not `'designing'` — this indicates the change moved forward from a prior invalidation and those earlier overlaps were already handled. If no such boundary event is found, the scan includes all matching events back to the beginning of history.

`ReviewSummary.reason` type MUST be extended to: `'artifact-drift' | 'artifact-review-required' | 'spec-overlap-conflict' | null`.

When `reason` is `'spec-overlap-conflict'`, `ReviewSummary` MUST additionally include:

- `overlapDetail` — an array of `OverlapEntry` objects, one per unhandled `spec-overlap-conflict` invalidation event, each containing:
  - `archivedChangeName` — the name of the archived change that caused the overlap (extracted from the `invalidated.message`)
  - `overlappingSpecIds` — readonly array of spec IDs that overlapped (extracted from the `invalidated.message`)
    The array is ordered newest-first (matching the reverse scan order). This preserves the full picture when multiple changes were archived with overlapping specs before the current change was able to address any of them.

When `reason` is not `'spec-overlap-conflict'`, `overlapDetail` MUST be an empty array.

Lifecycle fields `validTransitions`, `availableTransitions`, `availableSteps`, and `nextAction` MUST be the projections from transition-check evaluation, not a protocol-only graph lookup followed by a separate task paint. `availableSteps` MUST be the extras-bearing `schema.workflow()` rows from `evaluateLifecycle` (not protocol membership). Drafted status MUST set `availableSteps` to empty.

### Requirement: Identifies blockers

`GetStatus` MUST identify explicit blockers that prevent lifecycle progression.

Blockers MUST be collected for:

- **Artifact Drift**: code `'ARTIFACT_DRIFT'` if `review.reason` is `'artifact-drift'`.
- **Review Required**: code `'REVIEW_REQUIRED'` if `review.reason` is `'artifact-review-required'`.
- **Incomplete artifacts**: code `'INCOMPLETE_ARTIFACT'` for each required artifact whose effective status is `missing` or `in-progress`. There is no separate `MISSING_ARTIFACT` code — absence and in-progress share `INCOMPLETE_ARTIFACT`.
  Failed predicates for candidate hops MUST appear on public `blockers` with their check codes (`INCOMPLETE_ARTIFACT`, `APPROVAL_REQUIRED`, `INCOMPLETE_TASKS`, `DEPS_INCONSISTENT`, `READ_ONLY_WORKSPACE`, `IMPLEMENTATION_STATE`, `INVALID_TRANSITION`, archive codes when in scope including `OVERLAP_CONFLICT` **only** from archive predicates while `state === 'archivable'`). `review.reason === 'spec-overlap-conflict'` MUST NOT add `OVERLAP_CONFLICT` to `blockers`. `GetStatus` MUST NOT drop requires or approval failures from `blockers` while omitting those hops from `availableTransitions`.

When a failed predicate has code `IMPLEMENTATION_STATE`, `bypassFlag: '--allow-out-of-scope'` (and skippable for that flag) MUST attach only if the failing check id is `impl.linksInScope`. Open-file failures from `impl.filesResolved` MUST NOT advertise that bypass even though they share the same code.

Blockers projected from a failed check MUST include that check’s gerund `label` (and SHOULD include `checkId`) alongside `code` and `message`. Review-only blockers (`ARTIFACT_DRIFT`, `REVIEW_REQUIRED`) MAY omit `label`. Agents use `label` as a human hint for what the machine code means (for example `DEPS_INCONSISTENT` → `Checking spec dependencies`).

When `review.required` is true, `review` MUST include a human `message`. For `spec-overlap-conflict` the message MUST explain conflict with archived overlapping specs (not the kebab token alone). `nextAction.reason` SHOULD use that message.

When public `blockers` include `OVERLAP_CONFLICT`, `nextAction.command` MUST remain `/specd-archive` and `targetStep` MUST remain `archivable`. `nextAction.reason` MUST NOT be `Ready to archive`. It MUST name live overlap and `--allow-overlap`. Overlap is an archive operation predicate, not a hop, so `availableTransitions` MAY still list `archiving`.

`GetStatus` MAY assemble these blockers directly or obtain them from `evaluateLifecycle`, but the blocker set MUST be derived from the same authoritative evaluation used for effective statuses and `availableTransitions`.

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
- composed workflow checks from `create*` (ports such as `CountTasks`, deps extract, workspace ownership live on those checks, not on a gather helper)
- `transitionBindings` from `resolveWorkflowCheckRegistry`
- `archiveBindings` from `resolveWorkflowCheckRegistry`

It MUST NOT resolve `lifecycle`, `LifecycleEngine`, or `evaluateLifecycle`. `GetStatus` imports `evaluateLifecycle` as a module function.

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- The use case does not modify the change — it is a read-only query.
- Artifact content is not loaded for lifecycle and artifact-status metadata except inside matching check `execute` (for example `CountTasks` from `workflow.taskCompletion`). When task-completion projection is applicable, `GetStatus` MUST reuse that check’s counts and MUST NOT invoke `CountTasks` a second time.
- The effective status computation may be delegated to `evaluateLifecycle` / `projectArtifacts`; it is not an entity-owned concern of `Change`.
- Schema resolution failure (`SchemaNotFoundError`) MUST degrade lifecycle fields without throwing. Other errors from `SchemaProvider.get()` MUST propagate. Check `execute` failures MUST NOT be swallowed by that same catch.
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
- [`core:transition-checks`](../transition-checks/spec.md) — shared evaluation consumed by status projections.
