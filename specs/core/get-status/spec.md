# GetStatus

## Purpose

Users and tooling need a canonical view of lifecycle, artifacts, approvals, verification, and the next valid action. Active status therefore reconciles fresh artifact and linked implementation inputs before projection, while drafted inspection remains read-only.

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

`ifModifiedSince` MAY short-circuit expensive response projection only after the active change has completed configured implementation refresh and canonical validity reconciliation. Manifest `updatedAt` alone cannot prove that externally edited artifact or implementation files are unchanged.

After reconciliation, if the parsed client timestamp is at least the reconciled `change.updatedAt`, `GetStatus` MAY return `unchanged: true`, an empty `artifactStatuses`, and minimal review/blocker guidance while still returning the reconciled change and dependency snapshot. Invalid timestamps or older revisions use the full projection path. Drafted read-only status may use its existing revision optimization because it does not authorize progress.

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

For an active change, `GetStatus` SHALL invoke `RefreshImplementationTracking.execute({ name })` before canonical validity reconciliation unless `refreshImplementationTracking` is explicitly `false`. Conditional `ifModifiedSince` does not skip this freshness step.

Drafted changes never refresh. `GetStatus` MUST NOT invoke `ImplementationDetector` directly or duplicate merge logic. After refresh and reconciliation it projects implementation state from the newly persisted change.

### Requirement: Operational status reconciliation

For an active change, `GetStatus` SHALL first resolve the active schema without mutating the change. If schema resolution fails, it returns the existing actionable read-only status projection with a `SCHEMA_RESOLUTION_FAILED` blocker, disables lifecycle mutation guidance, and performs neither implementation refresh nor validity reconciliation.

When schema resolution succeeds, `GetStatus` SHALL refresh implementation tracking as configured, then invoke the single application reconciler before constructing its response. Unlike plain repository hydration, status is an operational validity observation and MAY persist newly detected artifact review, stale or revoked projections, audit events, and an automatic lifecycle return.

Detection and recovery MUST be committed atomically. The response SHALL describe the committed change, never the pre-reconciliation state. Repeating status with unchanged facts MUST NOT append duplicate events or repeat an already completed return. Drafted, archived, and schema-unavailable status paths remain read-only and are not reconciled.

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

`GetStatus` SHALL receive the change repository, schema provider, approval-gate configuration, `RefreshImplementationTracking`, the central validity reconciler, and the composed transition/archive checks needed for projection. It imports pure lifecycle projection functions rather than injecting an alternative lifecycle engine or collecting one shared snapshot bag. All construction paths MUST supply the reconciler; absence MUST fail explicitly rather than enable a legacy invalidation fallback.

The config factory SHALL resolve these through the existing composition resolver and both established factory signatures. `GetStatus` MUST NOT construct filesystem adapters, invoke `ImplementationDetector` directly, or implement a second invalidation path.

Active resolution uses `get` and may reconcile; draft resolution uses `getDraft` and remains read-only. Discarded changes are out of scope.

### Requirement: Config-based factory preserves complete repository bootstrap

When `createGetStatus(config)` wires `GetStatus` from `SpecdConfig`, the resulting read path MUST preserve complete change-repository bootstrap semantics, including schema-driven artifact-type behavior needed for status derivation.

The config-based factory MUST NOT assemble a weaker repository variant that can report different artifact states for the same persisted change than the canonical status read path.

### Requirement: Reports effective status for every artifact

When `unchanged` is not `true`, the `artifactStatuses` array MUST contain exactly one entry per artifact type declared by the active schema (`schema.artifacts()`). Entries for types not yet attached on the change MUST use persisted/effective status `missing`. It MUST NOT omit schema-declared types on the full evaluation path.

When `unchanged` is `true`, `artifactStatuses` MUST be empty (full projection omitted by the revision short-circuit).

On the full evaluation path, `GetStatus` MUST derive each entry's `effectiveStatus` through `evaluateLifecycle` / `projectArtifacts` so the reported value reflects recursive dependency blocking from the active schema rather than only persisted aggregate artifact state.

### Requirement: Returns lifecycle context

`GetStatus` SHALL derive `ReviewSummary`, lifecycle projections, blockers, and next action from the same canonical validity verdict used by transitions and archive.

Drifted or pending-review non-task artifacts set `review.required=true`. The route is the current lifecycle skill under `workflow: preserve` unless required stale spec consent or an explicit redesign requires `designing`; under `workflow: redesign` it is `designing`. Unhandled overlap invalidations remain identifiable with human-readable overlap detail, but their recovery follows the same policy and gate precedence rather than a hard-coded route.

Lifecycle fields and `availableTransitions` SHALL come from check evaluation after reconciliation. Stale verification is reported but does not replace normal guidance before `verifying`; at or after verification it blocks the applicable forward boundary. Drafted status exposes no mutating transitions.

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

### Requirement: Approval, verification, and fingerprint status projection

Status SHALL expose independently:

- structured artifact and workflow policies
- non-task artifact drift and pending-review details
- spec-approval and sign-off state as absent, `valid`, `stale`, or `revoked`
- completed verification as never completed, legacy unknown, `valid`, or `stale`, separately from the active attempt identity, baseline, and freshness
- changed, missing, added, removed, renamed, or unlinked fingerprint inputs and their causes
- any automatic return committed during this request
- the canonical blockers and next action from the shared validity verdict

The public result SHALL expose a rich `ValidityStatusProjection` assembled from the reconciled aggregate and canonical verdict. It SHALL NOT expose the evaluator's raw `ChangeValidityVerdict` as a substitute for status. The projection MUST retain active-attempt and completed-evidence fields simultaneously when both exist.

Required stale spec consent has recovery priority and yields committed `designing` guidance. Required stale sign-off alone returns a later change to `done`; stale verification then recommends verification before renewed sign-off. Verification staleness in `designing`, `ready`, or `implementing` remains context and MUST NOT replace the phase's normal next action. At verification-requiring boundaries, missing or stale completed evidence recommends running the verification skill in the current state. A mismatched active attempt requires explicit start and repeated checks before completion, never a forced exit/re-entry. Status MUST NOT call `CompleteVerification` or treat an active attempt as completed evidence.

Under ungated `workflow: preserve`, artifact review remains in the current state, but unresolved non-task drift or review still blocks forward progress. Status MUST NOT suggest that structural validation alone renews human approval or verification.

### Requirement: Graceful degradation when schema resolution fails

If `SchemaProvider.get()` throws, the `lifecycle` object MUST still be present with degraded values:

- `validTransitions` MUST be populated normally (it is a static lookup, independent of schema)
- `availableTransitions` MUST be an empty array
- `lifecycle.blockers` MUST be an empty array because target-specific transition checks cannot run without a schema
- `approvals` MUST be populated normally (it is injected config, independent of schema)
- `nextArtifact` MUST be `null`
- `changePath` MUST be populated normally
- `schemaInfo` MUST be `null`

The public result `blockers` array MUST contain the stable `SCHEMA_RESOLUTION_FAILED` blocker with actionable recovery guidance. The use case MUST NOT throw when schema resolution fails, MUST remain read-only, and MUST NOT enable a lifecycle mutation or weaken fail-closed transition validation.

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

- Active `GetStatus` is an operational observation: after successful schema resolution it MAY persist only the validity effects selected by the single application reconciler. It MUST NOT independently mutate approval, verification, artifact, or lifecycle state. Drafted, archived, and schema-unavailable inspection remains read-only.
- Artifact and linked implementation contents MAY be read to establish fresh validity facts. Ordinary artifact-status projection need not load full content except in the matching check execution. Applicable `workflow.taskCompletion` counts MUST be reused from that check; `CountTasks` MUST NOT run a second time for the same projection.
- Effective lifecycle and review status MAY be delegated to `evaluateLifecycle` / `projectArtifacts`; the `Change` entity does not own dependency-aware presentation.
- Schema-provider resolution failures, including `SchemaNotFoundError`, MUST produce the actionable `SCHEMA_RESOLUTION_FAILED` read-only status without refresh or reconciliation. Once schema resolution succeeds, failures of check execution or reconciliation MUST propagate rather than be swallowed by the schema-failure path.
- `changePath` comes from `ChangeRepository.changePath(change)`.

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
