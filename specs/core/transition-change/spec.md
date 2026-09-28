# TransitionChange

## Purpose

Changes must advance through a strict lifecycle, and the rules for doing so — approval gates, task completion checks, validation clearing, requires enforcement, and hook execution — are too complex for callers to enforce ad-hoc. The `TransitionChange` use case centralises lifecycle state transitions, importing `evaluateLifecycle` for schema-aware interpretation (approval-gate checks, workflow requires, recursive blocking, and task gating) while still owning hook execution, redesign invalidation, and persistence of the final transitioned state.

## Requirements

### Requirement: Input contract

`TransitionChange.execute` SHALL accept a `TransitionChangeInput` with:

- `name` (required string): the change name
- `to` (required `ChangeState | 'next'`): a legal explicit target or the current happy-path next sentinel
- `skipHookPhases` (optional `ReadonlySet<HookPhaseSelector>`): `source.pre`, `source.post`, `target.pre`, `target.post`, or `all`; empty means no phase is skipped
- `refreshImplementationTrackingBefore` (optional boolean): defaults to true for active changes
- `allowOutOfScope` (optional boolean): permits the registered `impl.linksInScope` skip where supported but never skips `impl.filesResolved`

Approval gates are constructor configuration, not per-call flags. The removed `implementingTaskChecks` and `implementingRequires` inputs MUST NOT be accepted; task checks derive from the active schema. An implementation-only `verifying → implementing` retry MUST preserve unchanged validated artifacts rather than clear them from `implementing.requires`.

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

For a forward attempt from `ready` with the spec gate enabled, `TransitionChange` SHALL require the materialized spec-approval projection to be `valid` for the current canonical spec scope and artifact fingerprint. Absence, `stale`, `revoked`, or legacy-unprovable scope/evidence fails with structured approval guidance. It MUST NOT rewrite the target to a pending approval state.

Reconciliation runs first, so stale required consent has already committed the return to `designing`; the original transition then stops as inapplicable.

### Requirement: Signoff is a check not a pending hop

For `done → archivable` with the sign-off gate enabled, `TransitionChange` SHALL require materialized sign-off status `valid` for current artifact and implementation fingerprints and valid verification evidence. Absence, `stale`, `revoked`, or legacy-unprovable evidence fails with structured recovery guidance. It MUST NOT rewrite the target to a pending sign-off state.

Reconciliation runs first, so stale required sign-off beyond `done` has already committed its return; stale verification remains a blocker that routes through verification before sign-off renewal.

### Requirement: Human-approval pending states produce explicit transition failures

For in-flight changes already in `pending-spec-approval` or `pending-signoff`, `TransitionChange` MUST still fail automatic progression except `designing` (and the historic approve-forward targets used by drain). New work MUST NOT enter those states.

When the change is in `ready` waiting on spec approval, callers MUST use `ApproveSpec`, not `change transition` to a pending state.

### Requirement: Direct transition when gates are inactive

`TransitionChange` MUST persist the requested target when all predicates pass. There is no effective-target rewrite for approval gates.

### Requirement: Canonical pre-transition validity reconciliation

After pre-hooks that may modify files and before authorizing the requested hop, `TransitionChange` SHALL invoke the single application reconciler on fresh artifact, implementation, approval, and verification facts. It MUST consume the canonical verdict and MUST NOT independently infer invalidation or recovery.

If reconciliation commits an automatic return that makes the requested transition inapplicable, the use case SHALL stop, preserve the committed recovery, and return a typed failure containing the reconciled state, blockers, reasons, and next action. A failed transition MUST NOT undo the recovery.

Forward transitions SHALL fail while any non-task artifact has drift or pending review. Backward and recovery transitions remain available subject to their existing topology.

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

### Requirement: Implementation-only retry from verifying

`verifying → implementing` is an implementation-only retry. It is valid only when the current artifacts still express the intended behavior and the fix fits existing tasks. The transition MUST preserve unchanged validated artifacts and MUST NOT downgrade artifact or file states merely because a verification check failed.

If the desired behavior or task plan must change, callers MUST route to `designing` and review the affected artifacts instead. Any independently detected file drift or mandatory gate recovery is handled by canonical reconciliation, not by an unconditional retry-side clearing rule.

### Requirement: Verification attempt lifecycle

Every forward transition whose source is `implementing`, and every real transition whose target is `verifying`, SHALL refresh implementation tracking and link resolution and execute blocking `impl.filesResolved` and `impl.linksInScope` predicates before changing state. If both bindings match, each stable check ID executes once. If pre-persist hooks may change inputs, fresh tracking, reconciliation, and predicate evaluation SHALL run again before persistence. Failed readiness checks prevent the transition; transitions never capture an attempt baseline.

`verifying → done` SHALL execute registered predicate `verification.current`, requiring an already-completed successful verification and comparing its fingerprint with fresh inputs. It shares the fingerprint-validity evaluator used by `CompleteVerification` but MUST NOT call that mutating use case, complete an active attempt, or replace a baseline. An unfinished attempt alone is insufficient evidence. The predicate skips only for an explicit canonical `not-required` verdict; an absent verdict blocks with typed unavailable-validity guidance. Recheck after mutation-capable hooks before persistence.

Missing, stale, legacy-unknown, changed, or unresolvable evidence blocks exit. Fingerprint mismatch alone leaves the change in `verifying` and recommends running the verification skill in place. Independent mandatory approval recovery or artifact workflow policy may still change the state through canonical reconciliation; the failure reports that committed state accurately.

Verification can be started and completed explicitly from any active lifecycle state. Lifecycle movement alone preserves unchanged completed verification. `TransitionChange` MUST NOT expose a restart flag or accept `verifying → verifying`; a new `verification start` replaces the active attempt without requiring any transition.

### Requirement: Skill-aligned backward hop invalidation

A backward hop alone SHALL preserve unchanged completed verification. Returning from a post-signoff phase to `done`, `verifying`, or `implementing` marks sign-off stale or revoked as appropriate. It MUST NOT globally invalidate spec approval unless its artifact fingerprint or explicit consent is affected.

All projection updates and any required recovery are applied by the central reconciler and persisted with the transition. History remains append-only.

### Requirement: Transition to designing from any state

Every state except `drafting` SHALL retain `designing` as an explicit valid target, including `archiving`. Requesting it is an intentional redesign operation, not ordinary drift preservation.

`TransitionChange` SHALL delegate review reopening and validity changes to the central reconciler inside the serialized transition. Explicit redesign revokes required spec consent, applies independent sign-off recovery and the configured artifact reopening breadth, appends focused audit evidence, and commits the transition to `designing`. Verification becomes stale only through affected inputs or explicit withdrawal, not phase movement alone. It MUST NOT unconditionally mark every artifact file pending review outside the effective artifact policy.

Re-entering `designing` from `designing` remains a no-op for approval invalidation and artifact reopening.

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

### Requirement: Automatic implementation tracking activation on transition to implementing

When transitioning to `implementing` (`effectiveTarget === 'implementing'`), `TransitionChange` MUST verify whether implementation tracking is active on the change.

If `!change.isImplementationTrackingActive`, the use case MUST call `change.startImplementationTracking()` within the same mutation boundary to activate implementation tracking and record the transition timestamp as the baseline.

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

### Requirement: Historic parked approval repair precedence

For an in-flight change already in `pending-spec-approval` or `pending-signoff`, `TransitionChange` MUST allow only its documented drain target. Before evaluating `protocol.edge` or any other transition predicate, a request for any non-drain target MUST fail with `InvalidStateTransitionError` whose reason has `type: 'approval-required'` and the matching `gate` (`'spec'` or `'signoff'`). It MUST NOT report `invalid-transition` for that request.

## Constraints

- `TransitionChange` MUST enforce the legal entity/protocol edge; it only resolves the effective target and delegates the state mutation.
- Task completion checks are controlled by schema-declared `requiresTaskCompletion`; only listed artifacts are content-checked. `safeRegex` compilation failures or nested quantifiers are treated as non-matching without throwing.
- `InvalidStateTransitionError` retains structured reasons for incomplete artifacts/tasks, missing task capability, invalid edges, approval required, and gate not required. Registered predicate failures MUST map to canonical reasons rather than a parallel requires/task/dependency/readOnly/implementation algorithm.
- Enter-ready predicates and forward exit-implementing predicates MUST use the same runners as `ArchiveChange`. Redesign MUST NOT run implementation-readiness checks merely because it moves backward.
- Pre-hook and before-persist post-hook aborts prevent the requested transition. Post effects run only on forward movement; source-post effects do not run for backward, redesign, or recovery.
- `verifying → implementing` MUST NOT clear unchanged artifact validation. Schema `implementing.requires` still governs later forward readiness, not retry-side clearing.
- A `designing → designing` request is a neutral application no-op: it MUST NOT append a transition event or invalidate approval/artifacts. The entity continues to reject real self-transitions. `verifying → verifying` remains invalid, not a renewal protocol.
- `allowOutOfScope` MAY skip `impl.linksInScope` where the registered check permits it, but cannot skip `impl.filesResolved`.
- Schema resolution failure MUST throw; absence of a target workflow row only skips workflow-specific requires/task checks, not protocol or other predicates.
- Composition MUST inject application `create*` transition bindings, not domain stubs; `RunStepHooks` belongs in hook checks rather than the use-case constructor.
- Enter-ready and forward exit-implementing failures MUST preserve their existing typed errors. A missing happy-path next hop MUST throw `HappyPathNextUnavailableError`.

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
