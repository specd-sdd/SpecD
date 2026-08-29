# TransitionChange

## Purpose

Changes must advance through a strict lifecycle, and the rules for doing so — approval gates, task completion checks, validation clearing, requires enforcement, and hook execution — are too complex for callers to enforce ad-hoc. The `TransitionChange` use case centralises lifecycle state transitions, importing `evaluateLifecycle` for schema-aware interpretation (approval-gate checks, workflow requires, recursive blocking, and task gating) while still owning hook execution, redesign invalidation, and persistence of the final transitioned state.

## Requirements

### Requirement: Input contract

`TransitionChange.execute` SHALL accept a `TransitionChangeInput` with the following fields:

- `name` (string, required) — the change to transition
- `to` (`ChangeState | 'next'`, required) — the requested target state, or the happy-path next sentinel (see Requirement: to next is the happy-path next state)
- `skipHookPhases` (ReadonlySet\<HookPhaseSelector>, optional, default empty set) — which hook phases to skip. Valid values: `'source.pre'`, `'source.post'`, `'target.pre'`, `'target.post'`, `'all'`. When `'all'` is in the set, all hook phases are skipped. When the set is empty (default), all applicable hooks execute.
- `refreshImplementationTrackingBefore` (boolean, optional) — when omitted or `true`, refresh tracked implementation files before transition for **active** changes only; when `false`, skip refresh
- `allowOutOfScope` (boolean, optional) — when `true`, `impl.linksInScope` is skippable on the forward exit from `implementing`. It MUST NOT skip `impl.filesResolved`.

Approval gate state (`approvalsSpec`, `approvalsSignoff`) MUST NOT appear on `TransitionChangeInput`. Gate state is baked at construction from `SpecdConfig.approvals` (see Requirement: Approval gates baked at construction).

The `implementingTaskChecks` and `implementingRequires` fields are removed. Task completion checks are now derived automatically from the schema during requires enforcement (see Requirement: Task completion check during requires enforcement). Artifact validation clearing on `verifying → implementing` reads the `implementing` step's `requires` from the schema directly.

### Requirement: Approval gates baked at construction

`TransitionChange` SHALL accept approval gate configuration at construction time:

```typescript
type ApprovalGates = { readonly spec: boolean; readonly signoff: boolean }
```

The constructor MUST receive `approvals: ApprovalGates` as a dependency. `createTransitionChange(config)` and kernel wiring MUST pass `config.approvals`.

`TransitionChange.execute` MUST read gate state from the constructor-provided `approvals` value. Callers MUST NOT supply gate flags per invocation.

### Requirement: Change must exist

The use case MUST load the change from the `ChangeRepository` by name. If no change exists with the given name, it MUST throw `ChangeNotFoundError`.

### Requirement: Optional pre-transition implementation tracking refresh

When `refreshImplementationTrackingBefore` is not `false` (default `true`) and the change exists in active storage, `TransitionChange` MUST invoke `RefreshImplementationTracking.execute({ name })` before lifecycle evaluation, hook execution, and mutation.

When `refreshImplementationTrackingBefore` is `false`, `TransitionChange` MUST NOT invoke `RefreshImplementationTracking`.

`TransitionChange` MUST NOT invoke `ImplementationDetector` directly and MUST NOT duplicate refresh merge logic.

Lifecycle rules MUST be evaluated against tracked implementation state after any refresh.

### Requirement: Spec approval is a check not a pending hop

When the change is in `ready`, the requested target is `implementing`, and `approvals.spec` is `true`, `TransitionChange` MUST NOT rewrite the target to `pending-spec-approval`. It MUST evaluate `approval.spec`. If no spec approval is recorded, it MUST throw `InvalidStateTransitionError` with reason `{ type: 'approval-required', gate: 'spec' }` and leave the change in `ready`.

### Requirement: Signoff is a check not a pending hop

When the change is in `done`, the requested target is `archivable`, and `approvals.signoff` is `true`, `TransitionChange` MUST NOT rewrite the target to `pending-signoff`. It MUST evaluate `approval.signoff`. If no signoff is recorded, it MUST throw `InvalidStateTransitionError` with reason `{ type: 'approval-required', gate: 'signoff' }` and leave the change in `done`.

### Requirement: Human-approval pending states produce explicit transition failures

For in-flight changes already in `pending-spec-approval` or `pending-signoff`, `TransitionChange` MUST still fail automatic progression except `designing` (and the historic approve-forward targets used by drain). New work MUST NOT enter those states.

When the change is in `ready` waiting on spec approval, callers MUST use `ApproveSpec`, not `change transition` to a pending state.

### Requirement: Direct transition when gates are inactive

`TransitionChange` MUST persist the requested target when all predicates pass. There is no effective-target rewrite for approval gates.

### Requirement: Workflow requires enforcement

After resolving the effective target, `TransitionChange` MUST call `execute` on matching **predicates** for the attempt (see [`core:transition-checks`](../transition-checks/spec.md)). `evaluateLifecycle` SHALL project `allowed` from those results. `workflow.requires` SHALL be that evaluation for the effective target's schema step.

If any required artifact has an effective status other than `complete` or `skipped`, the use case MUST throw `InvalidStateTransitionError` with a structured reason explaining the block. It MUST map the failed predicate — it MUST NOT re-walk `requires` with a different status algorithm after a green `execute` of the same attempt.

The error reason MUST include:

- `type`: `'incomplete-artifact'`
- `artifactId`: The ID of the blocking artifact.
- `status`: The artifact's current effective status (e.g. `'drifted-pending-review'`, `'pending-parent-artifact-review'`).
- `blockedBy`: (Optional) If the status is `'pending-parent-artifact-review'`, this MUST include the ID and status of the first upstream parent in the DAG that is causing the recursive block.

If no workflow step exists for the effective target (the schema does not declare one), or the schema cannot be resolved, the requires check is skipped.

The use case MUST emit a `requires-check` progress event per artifact checked, reporting whether the requirement was satisfied.

### Requirement: Task completion check during requires enforcement

For every artifact listed in the effective workflow step's `requiresTaskCompletion`, the `workflow.taskCompletion` predicate MUST first verify that the schema artifact type declares `hasTasks: true` and `taskCompletionCheck`. If either is absent, `TransitionChange` MUST throw `InvalidStateTransitionError` with reason `missing-task-capability`.

Task counts MUST come from `workflow.taskCompletion.execute` (`CountTasks` composed into that check). An absent entry after capability validation MUST be treated as no qualifying task content and MUST NOT block the transition.

When a required artifact's count has `incomplete > 0`, `TransitionChange` MUST emit the `task-completion-failed` progress event and throw `InvalidStateTransitionError` with reason `incomplete-tasks`, including that artifact's complete, incomplete, and total counts.

`TransitionChange` MUST NOT invoke `CountTasks` again after a green predicate evaluation of that attempt.

Only artifacts listed in `requiresTaskCompletion` are content-checked. When `requiresTaskCompletion` is absent or empty, no task completion gating applies.

### Requirement: Artifact validation clearing on verifying to implementing

When the current state is `verifying` and the effective target is `implementing`, the use case MUST treat that path as an implementation-only retry.

The transition is valid only when the current artifacts still correctly describe the intended behavior and the required fix fits within the already-defined tasks. In that case:

- the use case transitions back to `implementing`
- it MUST NOT clear unchanged validated artifacts
- it MUST NOT downgrade artifact or file states merely because verification failed

If verification concludes that the artifacts must change, or that new tasks are required before implementation can resume, callers must route to `designing` instead of `implementing`.

### Requirement: Skill-aligned backward hop invalidation

When the source state is `done`, `signed-off`, or `archivable` and the effective target is `implementing` or `verifying`, `TransitionChange` MUST:

- invalidate an active signoff if one exists
- MUST NOT mass-invalidate or downgrade unchanged artifacts
- MUST NOT invalidate spec approval unless artifact files actually change
- MUST NOT run `source.post` effects (`along` is `backward`)

Persistence MUST still go through `ChangeRepository.mutate`.

### Requirement: Transition to designing from any state

Every state except `drafting` SHALL include `designing` as a valid transition target. This includes `archiving`. This allows the user to return to the design phase at any point in the lifecycle when issues are discovered, including after a failed archive commit or incomplete batch restore.

When the effective target is `designing` and the change is **not already in** `designing` or `drafting`, the use case MUST call `change.invalidate(...)` with cause `artifact-review-required`. That entity method:

1. Invalidates the active spec approval if one exists.
2. Invalidates the active signoff if one exists — the first invalidation already clears both.
3. Downgrades every artifact file to `pending-review`, except files already marked `drifted-pending-review`, which keep that more specific state.
4. Recomputes every artifact's aggregate persisted `state`.
5. Appends the `transitioned` event to `designing`.

The use case MUST NOT call `change.transition('designing', actor)` after that invalidate. `invalidate()` **is** the hop.

When the change is **already in** `designing` (a `designing → designing` transition) or in `drafting` (the natural first entry), the use case MUST NOT invalidate approvals, downgrade artifacts, or call `invalidate()`. It MUST proceed directly with the transition via `change.transition('designing', actor)`.

Drift detection (artifact content changes) is handled independently at the repository layer and is not affected by this rule.

### Requirement: Transition from archiving to archivable

`TransitionChange` MUST permit `archiving → archivable` when the transition is valid in `VALID_TRANSITIONS`. The attempt SHALL be classified as `along = recovery`.

This transition is primarily used for manual recovery after a failed archive attempt once canonical storage has been restored to a known-good state. It MUST NOT run archive operation effects, `source.post` on `archiving`, or workflow `requires` / `workflow.taskCompletion` associated with the `archivable` step — it is a lifecycle rollback, not re-entry into archive preparation.

Automatic invocation of this transition after failed archive commits is owned by `ArchiveChange`, not by callers of `TransitionChange`.

### Requirement: Pre-hook execution

After matching source.post effects succeed or are skipped (forward only), when `'all'` and `'target.pre'` are both absent from `skipHookPhases`, call `execute` on matching `before-persist` effects for the target workflow step (`hook.pre`: `to = that step`, `along = any`, including redesign). That check’s `execute` SHALL call `RunStepHooks`. The use case MUST NOT invoke `RunStepHooks` by check id. Emit generic check-progress events (`check-start` / `check-done`). `onFailure = abort`: throw `HookFailedError` — no persist.

When `'all'` or `'target.pre'` is in `skipHookPhases`, those effects are skipped.

### Requirement: Transition delegation

After routing, pre-transition checks, and successful pre-hooks, the use case MUST delegate the actual state transition to `change.transition(effectiveTarget, actor)`. The `Change` entity enforces transition validity via its own state machine.

### Requirement: Transition event

After a successful state transition, the use case MUST emit a `transitioned` progress event with `from` and `to` states.

### Requirement: Post-hook execution

Matching **effects** (`run:` hooks) SHALL run only after all predicates pass. Selection MUST use the same `from` / `to` / `along` matcher as predicates, then binding `phase = before-persist` (see [`core:hook-execution-model`](../hook-execution-model/spec.md)). The use case MUST iterate matching bindings; it MUST NOT choose the slot by `check.id`.

**Before** persist, when `'all'` and `'source.post'` are both absent from `skipHookPhases`, call `execute` on matching `before-persist` effects whose schema step is the **source** (default: `hook.post`, `along = forward`). That check’s `execute` SHALL call `RunStepHooks`. The use case MUST NOT invoke `RunStepHooks` by check id. Emit generic check-progress events (`check-start` / `check-done`, with hook detail on `check-progress` when streaming). `onFailure = abort`: throw `HookFailedError` — no persist.

When `along` is `backward`, `redesign`, or `recovery`, `hook.post` MUST NOT match.

Then, when skip flags allow, execute matching `before-persist` effects for the **target** step (default: `hook.pre`). Order on a forward attempt follows the registry: source.post then target.pre, then persist. Both default to `onFailure = abort`.

If no workflow step exists for the source or target, or the schema cannot be resolved, that effect is skipped.

`--skip-hooks` / `skipHookPhases` SHALL skip effects only, never predicates. Skip matching MUST use binding `phase` (and the skip selector), not `check.id === 'hook.pre'|'hook.post'`.

### Requirement: Persistence

After routing, persisted-state checks, and successful pre-transition hooks, the use case MUST apply the final change-state mutation through `ChangeRepository.mutate(name, fn)` rather than persisting a previously loaded snapshot.

Inside the mutation callback, the repository supplies the fresh persisted `Change` for `name`. The use case MUST apply any persisted-state-dependent transition mutations on that instance — including approval invalidation for redesign, artifact validation clearing for `verifying -> implementing`, and the lifecycle transition itself — before returning the updated change.

When the callback resolves, the repository persists the updated change manifest. This ensures the final lifecycle mutation is serialized with other concurrent mutations of the same change.

### Requirement: Result type

`TransitionChange.execute` MUST return a `TransitionChangeResult` containing:

- `change` — the updated `Change` instance after the transition

The previous `postHookFailures` field is removed because both hook phases are now fail-fast — a hook failure throws `HookFailedError` and prevents the transition. There are no post-transition hook failures to collect.

### Requirement: Progress callback

`TransitionChange.execute` SHALL accept an optional second parameter `onProgress?: OnTransitionProgress`. Public progress is the generic check bus (`check-start`, `check-progress`, `check-done`) plus lifecycle extras:

- `{ type: 'requires-check', artifactId: string, satisfied: boolean }` — emitted per artifact during requires enforcement
- `{ type: 'task-completion-failed', artifactId: string, incomplete: number, complete: number, total: number }` — emitted when task completion check fails, before throwing
- `{ type: 'check-start' | 'check-done' | 'check-progress', id: string, label: string, ... }` — matching predicates and effects, including hooks (`hook.pre` / `hook.post`)
- `{ type: 'transitioned', from: ChangeState, to: ChangeState }` — emitted after state change

Hook checks MUST NOT emit first-class `{ type: 'hook-start' }` / `{ type: 'hook-done' }` as the public contract. Those names MAY appear only as `check-progress` `detail` values inside hook `execute`.

### Requirement: Dependencies

`TransitionChange` depends on `ChangeRepository`, `ActorResolver`, `SchemaProvider`, `RefreshImplementationTracking`, baked `approvals`, and `transitionBindings` (application `Check` instances). It MUST NOT depend on `LifecycleEngine` as a constructor port.

`TransitionChange` MUST NOT depend on `ImplementationDetector` or invoke implementation autodetection directly.
`TransitionChange` MUST NOT take `RunStepHooks` or `CountTasks` as use-case constructor ports.

### Requirement: to next is the happy-path next state

`TransitionChange.execute` input `to` MUST accept a lifecycle `ChangeState` or the sentinel `'next'`.

When `to` is `'next'`, Core MUST resolve it to the **happy-path next lifecycle state** from the current state (the forward delivery hop a human would normally take: e.g. `ready` → `implementing`, `implementing` → `verifying`, `signed-off` → `archivable`). This MUST NOT use `GetStatus.nextAction.targetStep` (that field may recommend staying, approving, or archiving).

Core MUST reject `'next'` when there is no such hop, including at least `pending-spec-approval`, `pending-signoff`, `archivable`, and `archiving`, with a typed `SpecdError` (not a CLI-only table). After resolution, evaluation is the same as an explicit `to`.

Predicate `protocol.edge` fail-fast applies to this execute path. GetStatus MUST still collect every matching predicate for the same edge.

### Requirement: Shared runner errors propagate on transition

When a matching predicate or effect check throws during `execute`, `TransitionChange` MUST propagate the typed error from the shared runner (for example `ReadOnlyWorkspaceError`, `ArchiveDependencyMismatchError`, `ArchiveImplementationStateError`) and MUST NOT leave the change in a partially transitioned state.

### Requirement: Config-based factory delegates through resolveTransitionChangeDeps

The config-based `createTransitionChange(config, options?)` form MUST derive `TransitionChangeDeps` through `resolveTransitionChangeDeps(resolver)` and then delegate to canonical `createTransitionChange(deps)`.

`resolveTransitionChangeDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`
- `actor: ActorResolver`
- `schemaProvider: SchemaProvider`
- `refreshImplementationTracking: RefreshImplementationTracking`
- `approvals: ApprovalGates`
- `transitionBindings` from `resolveWorkflowCheckRegistry` (application `create*` checks)

It MUST NOT resolve `lifecycle` or `LifecycleEngine`. `TransitionChange` imports `evaluateLifecycle` as a module function.

It MUST NOT resolve `runStepHooks` onto the use case. `RunStepHooks` is a constructor dep of `createHookPre` / `createHookPost`.

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- The use case MUST NOT bypass the Change entity's transition validation — it only resolves the effective target and delegates
- Task completion checks are controlled by `requiresTaskCompletion` on the workflow step — only listed artifacts are content-checked
- Task completion checks use `safeRegex` to compile patterns; patterns that fail compilation or contain nested quantifiers are treated as non-matching (no error thrown)
- `InvalidStateTransitionError` carries a structured `reason` field: `'incomplete-artifact'`, `'incomplete-tasks'`, `'missing-task-capability'`, `'invalid-transition'`, `'approval-required'`, or `'gate-not-required'`
- Approval-gate routing is configuration-driven at construction time, but its interpretation is centralized through `evaluateLifecycle`
- Failed predicates MUST map to those existing reasons; `TransitionChange` MUST NOT invent a parallel requires/task/deps/readOnly/impl-exit algorithm after a green `execute` of matching predicates for the same attempt
- Enter-ready predicates (`deps.consistent`, `workspace.readOnly`) and **forward** exit-implementing predicates (`impl.filesResolved`, `impl.linksInScope`, `along = forward`) MUST use the same runners as `ArchiveChange`. Redesign MUST NOT run those impl checks.
- Pre-hook failure aborts the transition — no state change occurs
- Post-hook failure aborts the transition — no state change occurs (`onFailure = abort`, `phase = before-persist`). Post effects run only when `along = forward`
- Artifact validation clearing on `verifying → implementing` reads the `implementing` step's `requires` from the schema — the caller does not supply them
- A `designing → designing` transition MUST NOT trigger approval invalidation or artifact downgrade — it is a state-preserving transition that only re-enters the same step
- Input MAY include `allowOutOfScope` for `impl.linksInScope` skippable semantics on transition
- When the schema cannot be resolved, `TransitionChange` MUST throw (schema miss is not a silent skip of all checks)
- When no workflow step exists for the target, `workflow.requires` / `workflow.taskCompletion` skip; matching protocol and other predicates still run
- Constructor / `resolveTransitionChangeDeps` MUST inject application `create*` `transitionBindings`. It MUST NOT default to domain stub `TRANSITION_BINDINGS`
- `RunStepHooks` SHALL be composed into hook checks (`createHookPre` / `createHookPost`), not as a use-case constructor port
- When enter-ready runners fail, `TransitionChange` MUST propagate `ReadOnlyWorkspaceError` (`workspace.readOnly`) and `ArchiveDependencyMismatchError` (`deps.consistent`) — the same typed errors as `ArchiveChange`
- When forward exit-implementing runners fail, `TransitionChange` MUST propagate `ArchiveImplementationStateError` (`impl.filesResolved` / `impl.linksInScope`)
- When `to` is `'next'` and no happy-path hop exists, `TransitionChange` MUST throw `HappyPathNextUnavailableError` (a typed `SpecdError`)

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:run-step-hooks`](../run-step-hooks/spec.md)
- [`core:hook-execution-model`](../hook-execution-model/spec.md)
- [`core:workflow-model`](../workflow-model/spec.md)
- [`default:_global/architecture`](../../_global/architecture/spec.md)
- [`core:lifecycle-engine`](../lifecycle-engine/spec.md)
- [`core:refresh-implementation-tracking`](../refresh-implementation-tracking/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
- [`core:count-tasks`](../count-tasks/spec.md) — supplies shared task-completion counts.
- [`core:transition-checks`](../transition-checks/spec.md) — predicate evaluation then matching effects.
