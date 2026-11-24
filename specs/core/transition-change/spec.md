# TransitionChange

## Purpose

Changes must advance through a strict lifecycle, and the rules for doing so — approval gates, task completion checks, requires enforcement, and hook execution — are too complex for callers to enforce ad-hoc. The `TransitionChange` use case centralises lifecycle state transitions, importing `evaluateLifecycle` for schema-aware interpretation (approval-gate checks, workflow requires, recursive blocking, and task gating) while still owning hook execution and persistence of the final transitioned state. Fingerprint- and consent-driven validity changes belong to the reconciler.

## Requirements

### Requirement: Input contract

The Use Case MUST accept `TransitionChangeInput` containing:

- `name`: Change identifier (`string`).
- `to`: Target lifecycle state enum or `'next'`.
- `skipChecks`: Optional array of check IDs to bypass (`readonly string[]`).
- `skipHookPhases`: Optional set of hook phase selectors to skip (`ReadonlySet<HookPhaseSelector>`; selectors are `'source.pre'`, `'source.post'`, `'target.pre'`, `'target.post'`, `'all'`). It skips effects only, never predicates.
- `refreshImplementationTrackingBefore`: Optional boolean (default `true`) controlling only the pre-evaluation implementation tracking refresh (see "Optional pre-transition implementation tracking refresh").

Progress telemetry is NOT an input field: `onProgress` is the optional second parameter of `execute` (see "Progress callback").

The Use Case MUST NOT accept ad-hoc check bypass booleans (`allowOutOfScope`, `allowOverlap`). Check bypasses SHALL be supplied uniformly through `skipChecks`.

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

When `refreshImplementationTrackingBefore` is not `false` (default `true`) and the change exists in active storage, `TransitionChange` MUST refresh implementation tracking (through the canonical reconciler, which delegates to `RefreshImplementationTracking`) before lifecycle evaluation, hook execution, and mutation.

When `refreshImplementationTrackingBefore` is `false`, `TransitionChange` MUST NOT run that pre-evaluation refresh. The flag exists only so a caller that has just refreshed tracking can avoid repeating it; it is an optimization, not a way to evaluate against stale facts.

The post-hook reconciliation that precedes persistence MUST always refresh implementation tracking, regardless of `refreshImplementationTrackingBefore`, because pre-persist hooks may change implementation files. `TransitionChange` MUST NOT persist a transition whose predicates were evaluated only against tracking captured before those hooks ran.

`TransitionChange` MUST NOT invoke `ImplementationDetector` directly and MUST NOT duplicate refresh merge logic.

Lifecycle rules MUST be evaluated against tracked implementation state after any refresh.

### Requirement: Spec approval is a check not a pending hop

For a forward attempt from `ready` with the spec gate enabled, `TransitionChange` SHALL require the materialized spec-approval projection to be `valid` for the current canonical spec scope and artifact fingerprint. Absence, `stale`, `revoked`, or legacy-unprovable scope/evidence fails with structured approval guidance. It MUST NOT rewrite the target to a pending approval state.

Reconciliation runs first. Stale or revoked required consent in a state after `ready` has already committed the return to `designing`, and the original transition then stops as inapplicable. In `ready` reconciliation commits no recovery (consent is renewed there): the change stays in `ready` and the `approval.spec` check fails the forward attempt with `CheckPredicateFailedError` carrying the `approve-spec` action.

### Requirement: Signoff is a check not a pending hop

For `done → archivable` with the sign-off gate enabled, `TransitionChange` SHALL require materialized sign-off status `valid` for current artifact and implementation fingerprints and valid verification evidence. Absence, `stale`, `revoked`, or legacy-unprovable evidence fails with structured recovery guidance. It MUST NOT rewrite the target to a pending sign-off state.

Reconciliation runs first, so stale required sign-off beyond `done` has already committed its return; stale verification remains a blocker that routes through verification before sign-off renewal.

### Requirement: Human-approval pending states produce explicit transition failures

For in-flight changes already in `pending-spec-approval` or `pending-signoff`, `TransitionChange` MUST validate the requested target through the same bound checks as any other source state (see "Historic parked approval repair precedence"). A request that the topology does not admit fails with `CheckPredicateFailedError` for `protocol.edge`, and a delivery-edge request without a valid approval fails with `CheckPredicateFailedError` for `approval.spec` / `approval.signoff`. New work MUST NOT enter those states.

When the change is in `ready` waiting on spec approval, callers MUST use `ApproveSpec`, not `change transition` to a pending state.

### Requirement: Direct transition when gates are inactive

`TransitionChange` MUST persist the requested target when all predicates pass. There is no effective-target rewrite for approval gates.

### Requirement: Canonical pre-transition validity reconciliation

Before attempting state mutation, the Use Case MUST reconcile and evaluate all checks applicable to the target state:

1. **Active Check Resolution**: Resolve the effective bindings for `attempt.to`, classified `attempt.along`, and every bypassed step through `resolveEffectiveBindings` (see [`core:transition-checks`](../transition-checks/spec.md)). Checks declared with `disabled: true` on the step declaration (permitted only when `allowDisable !== false`) MUST be cleanly omitted from predicate execution for that coordinate.
2. **Bypass Verification**: Every `skipChecks` identifier MUST be validated against the bindings resolved for the attempt BEFORE any early return, including the neutral `designing → designing` redesign no-op path, so an unknown, effect or non-skippable id is rejected there too and never silently ignored. For each check identifier present in `skipChecks`:
   - If the check is unregistered, the orchestrator MUST throw an `UnknownCheckError`.
   - If the check is an effect (`kind: 'effect'`), the orchestrator MUST reject the bypass with a `CheckNotSkippableError`, because effect checks (hooks) are governed exclusively by `skipHookPhases`.
   - If the resolved binding of that check for this attempt declares `skippable !== true`, the orchestrator MUST throw a `CheckNotSkippableError`. Skippability is read from the resolved bindings for the attempt, never from the first base binding that shares the check id.
   - If the check is skippable, the orchestrator MUST bypass calling `check.execute()` and inject a synthetic `{ outcome: 'skip', details: { bypassedByUser: true } }`.
3. **Check Execution**: For all non-bypassed checks, invoke `check.execute(ctx)` passing the active change aggregate, resolved schema, attempt coordinates, and the binding's single-pass resolved `ctx.config`.
4. **Failure Abort**: A failing `protocol.edge` stops evaluation before any other predicate runs. Otherwise every matching predicate of the candidate is evaluated (so collected failures can be reported together), and if any returned `outcome: 'fail'` the transition MUST be aborted before any effect, hook, or persistence, and the failure MUST be thrown as defined in "Shared runner errors propagate on transition". The thrown `CheckPredicateFailedError.skippable` SHALL come from the resolved bindings of the attempt (the first resolved binding that shares the failing check id).
5. **Committed recovery reporting**: When reconciliation commits an automatic recovery that moves the change away from the source state, the thrown error SHALL report the committed state and carry the host-neutral `nextAction` (`intent` and optional `action`) produced by `evaluateLifecycle` for that committed state and the change's schema. To obtain check-declared actions, the use case MUST evaluate the forward checks of the committed state through the `CheckRegistry` (it MUST NOT pass an empty `checksByTarget`). The error and its message MUST NOT embed CLI commands, flags, or slash commands; delivery hosts render the intent and action. It MUST NOT hardcode a skill such as `/specd-verify`; when the change schema disables `verifying`, the guidance MUST NOT route to verification. When a committed movement away from the source state reports no automatic return, the use case throws a context-free `InvalidStateTransitionError` for the committed state.

### Requirement: Workflow requires enforcement

After resolving the effective target, `TransitionChange` MUST call `execute` on matching **predicates** for the attempt (see [`core:transition-checks`](../transition-checks/spec.md)). `evaluateLifecycle` SHALL project `allowed` from those results. `workflow.requires` SHALL be that evaluation for the effective target's schema step.

If any required artifact has an effective status other than `complete` or `skipped`, the use case MUST throw `CheckPredicateFailedError` for `workflow.requires`, as defined in "Shared runner errors propagate on transition". It MUST map the failed predicate; it MUST NOT re-walk `requires` with a different status algorithm after a green `execute` of the same attempt.

The error `details` come from the check result and MUST include:

- `artifactId`: The ID of the blocking artifact.
- `status`: (Optional) The artifact's current effective status (e.g. `'drifted-pending-review'`, `'pending-parent-artifact-review'`).
- `blockedBy`: (Optional) If the status is `'pending-parent-artifact-review'`, the ID and status of the first upstream parent in the DAG causing the recursive block, computed by the check.

If no workflow step exists for the effective target (the schema does not declare one), or the schema cannot be resolved, the requires check is skipped.

The use case MUST emit a `requires-check` progress event per artifact checked, reporting whether the requirement was satisfied.

### Requirement: Task completion check during requires enforcement

For every artifact listed in the effective workflow step's `requiresTaskCompletion`, the `workflow.taskCompletion` predicate MUST first verify that the schema artifact type declares `hasTasks: true` and `taskCompletionCheck`. If either is absent, the predicate fails and `TransitionChange` MUST throw `CheckPredicateFailedError` for `workflow.taskCompletion` whose `details` carry the missing-capability reason.

Task counts MUST come from `workflow.taskCompletion.execute` (`CountTasks` composed into that check). An absent entry after capability validation MUST be treated as no qualifying task content and MUST NOT block the transition.

When a required artifact's count has `incomplete > 0`, `TransitionChange` MUST emit the `task-completion-failed` progress event and throw `CheckPredicateFailedError` for `workflow.taskCompletion` whose `details` include that artifact's complete, incomplete, and total counts.

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

A backward hop alone SHALL preserve unchanged completed verification and unchanged spec approval. Spec approval is never invalidated by lifecycle movement alone; it is invalidated only when its artifact fingerprint changed or explicit consent revocation is requested.

For a backward skill hop from `done`, `signed-off`, or `archivable` to `implementing` or `verifying`, `TransitionChange` applies the sign-off invalidation (`Change.invalidateSignoff`) inside the serialized transition mutation, atomically with the state change, because it depends on the fresh persisted state. This is the only validity mutation `TransitionChange` applies directly.

Every fingerprint-driven or consent-driven validity change (stale verification, stale spec approval or sign-off, artifact review reopening, and any required recovery) is owned by the central reconciler and persisted with the transition. History remains append-only.

### Requirement: Transition to designing from any state

Every state except `drafting` SHALL retain `designing` as an explicit valid target, including `archiving`. Requesting it is an intentional redesign operation, not ordinary drift preservation.

`TransitionChange` SHALL delegate review reopening and validity changes to the central reconciler inside the serialized transition. Redesign does NOT revoke required spec consent by itself: lifecycle movement alone preserves approvals. Spec consent is revoked only when its artifact fingerprint changed or an explicit consent revocation is requested. Independent sign-off recovery and the configured artifact reopening breadth still apply through the reconciler, focused audit evidence is appended, and the transition to `designing` is committed. Verification becomes stale only through affected inputs or explicit withdrawal, not phase movement alone. It MUST NOT unconditionally mark every artifact file pending review outside the effective artifact policy.

Re-entering `designing` from `designing` remains a no-op for approval invalidation and artifact reopening.

### Requirement: Transition from archiving to archivable

`TransitionChange` MUST permit `archiving → archivable` when the transition is valid in `VALID_TRANSITIONS`. The attempt SHALL be classified as `along = recovery`.

This transition is primarily used for manual recovery after a failed archive attempt once canonical storage has been restored to a known-good state. It MUST NOT run archive operation effects, `source.post` on `archiving`, or workflow `requires` / `workflow.taskCompletion` associated with the `archivable` step — it is a lifecycle rollback, not re-entry into archive preparation.

Automatic invocation of this transition after failed archive commits is owned by `ArchiveChange`, not by callers of `TransitionChange`.

### Requirement: Pre-hook execution

After matching source.post effects succeed or are skipped (forward only), when `'all'` and `'target.pre'` are both absent from `skipHookPhases`, call `execute` on matching `before-persist` effects for the target workflow step (`hook.pre`: `to = that step`, `along = any`, including redesign). That check’s `execute` SHALL call `RunStepHooks`. The use case MUST NOT invoke `RunStepHooks` by check id. Emit generic check-progress events (`check-start` / `check-done`). `onFailure = abort`: throw `HookFailedError` — no persist.

When `'all'` or `'target.pre'` is in `skipHookPhases`, those effects are skipped.

### Requirement: Transition delegation

After routing, pre-transition checks, and successful pre-hooks, the use case MUST delegate the actual state transition to `change.transition(effectiveTarget, actor, schema, approvals)`. The `Change` entity enforces transition validity via its own state machine.

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

`skipHookPhases` SHALL skip effects only, never predicates. Skip matching MUST use binding `phase` (and the skip selector), not `check.id === 'hook.pre'|'hook.post'`.

### Requirement: Persistence

After routing, persisted-state checks, and successful pre-transition hooks, the use case MUST apply the final change-state mutation through `ChangeRepository.mutate(name, fn)` rather than persisting a previously loaded snapshot.

Inside the mutation callback, the repository supplies the fresh persisted `Change` for `name`. The use case MUST apply the persisted-state-dependent mutations on that instance — sign-off invalidation for backward skill hops from `done`, `signed-off`, or `archivable` to `implementing` or `verifying`, and the lifecycle transition itself — before returning the updated change. A `verifying -> implementing` retry does not clear unchanged artifact validation. Fingerprint- and consent-driven validity changes are not applied here; they belong to the reconciler.

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

`TransitionChange` depends on `ChangeRepository`, `ActorResolver`, `SchemaProvider`, `RefreshImplementationTracking`, baked `approvals`, `transitionBindings` (application `Check` instances), the `ReconcileChangeValidity` reconciler, the `CheckRegistry`, and `ResolveChangeSchema`. The reconciler is mandatory: constructing the use case without it MUST throw `InvalidCompositionFactoryArgumentsError`. It MUST NOT depend on `LifecycleEngine` as a constructor port.

`TransitionChange` MUST NOT depend on `ImplementationDetector` or invoke implementation autodetection directly.
`TransitionChange` MUST NOT take `RunStepHooks` or `CountTasks` as use-case constructor ports.
The check-specific error classes and reasons previously produced by the mapper (`InvalidStateTransitionError` reasons `invalid-transition`, `incomplete-artifact`, `incomplete-tasks`, `missing-task-capability`, `approval-required`, `gate-not-required`, and `ArchiveImplementationStateError` / `ArchiveDependencyMismatchError` for checks) SHALL NOT be produced from predicate failures.

### Requirement: to next is the happy-path next state

`TransitionChange.execute` input `to` MUST accept a lifecycle `ChangeState` or the sentinel `'next'`.

When `to` is `'next'`, Core MUST resolve the change's sovereign schema through `ResolveChangeSchema` and resolve the destination via `nextWorkflowStep(current, schema, approvals)` to determine the next active lifecycle state along the ordered pipeline. Disabled steps are skipped automatically.

Core MUST reject `'next'` when there is no subsequent active hop (such as from `archivable` or `archiving`) with a typed `HappyPathNextUnavailableError`. After resolution, evaluation is identical to an explicit destination `to`.

Predicate `protocol.edge` fail-fast applies to this execute path. GetStatus MUST still collect every matching predicate for the same edge.

### Requirement: Host-neutral HappyPathNextUnavailableError

When `TransitionChange` rejects `to: 'next'` with `HappyPathNextUnavailableError` (`HAPPY_PATH_NEXT_UNAVAILABLE`), the error `message` MUST describe why the `next` transition is unavailable from the current state in host-neutral terms without embedding CLI flags such as `--next`. The error MUST expose `state` as a structured metadata property.

### Requirement: Bypassed step evaluation and hook suppression

When a transition `from → to` bypasses one or more intermediate steps as identified by `listBypassedWorkflowSteps(from, to, schema, approvals)`, where `schema` is resolved through `ResolveChangeSchema`:

1. **Sovereign Schema Authority**: The change's recorded `change.schemaName` is the immutable sovereign authority for lifecycle topology, bypass legality, and step configuration.
2. **Precondition Validation**: Every active step strictly between `from` and `to` MUST be declared `optional: true` in the sovereign schema. Disabled steps are absent from the pipeline and never count as bypassed. If any intermediate active step is not optional, the transition SHALL be rejected by `protocol.edge`.
3. **Shared Candidate Evaluation**: `TransitionChange` SHALL invoke the shared transition candidate evaluator used by `GetStatus`, which dynamically composes and evaluates all normal target predicates and all checks matching `{ scope: 'step-skip', step }` for every optional bypassed step. If any predicate fails, the transition is aborted with the error mapped by "Shared runner errors propagate on transition".
   - Registry-provided bindings and schema-declared `skipChecks` form the effective check set.
   - When the effective set is empty, the optional-step bypass is permitted unconditionally.
   - This empty-set rule is deliberate and MUST NOT be replaced by skill-level judgment.
4. **Freshness and Ownership**: The shared candidate MUST be recalculated from fresh persisted state. `TransitionChange` alone owns matching effects, hook execution, aggregate mutation, and persistence after the predicate verdict passes.
5. **Hook Non-Execution**: For any bypassed step, neither `pre` nor `post` hooks configured on that step SHALL be executed. Hooks execute only when a step is explicitly entered and exited.

### Requirement: Shared runner errors propagate on transition

Every failed predicate SHALL be reported through exactly one typed error, `CheckPredicateFailedError`, including `protocol.edge`, `workflow.requires`, `workflow.taskCompletion`, the approval checks, Category C checks, plugin checks, and `scope: 'step-skip'` checks. `TransitionChange` MUST NOT switch on a check id to choose another error class or reason. It MAY key on a check id only to emit the progress events required by this spec (`requires-check`, `task-completion-failed`), never to select the thrown error. The error MUST encapsulate:

- `checkId`: the canonical identifier of the failed check
- `label`: the human-readable gerund phrase describing the check
- `code`: diagnostic error code (default `CHECK_FAILED`)
- `message`: host-neutral diagnostic message from the check
- `action`: optional host-neutral `CheckAction` declared by the failing check result (see [`core:transition-checks`](../transition-checks/spec.md)); there is no `command` property
- `details`: structured details from the check result, following the per-code contract in `core:transition-checks`; with several failures under `onFailure: 'collect'`, `details.failures` lists every failed check
- `skippable`: whether the failed binding permits bypass, so hosts can offer it. It is read from the resolved bindings of the attempt (the first resolved binding that shares the failing check id), never from base bindings
- `from` and `to` (optional): the lifecycle states of the attempted hop, so hosts can render context such as the attempted transition

The check-specific error classes and reasons previously produced by the mapper (`InvalidStateTransitionError` reasons `invalid-transition`, `incomplete-artifact`, `incomplete-tasks`, `missing-task-capability`, `approval-required`, `gate-not-required`, and `ArchiveImplementationStateError` / `ArchiveDependencyMismatchError` for checks) SHALL NOT be produced from predicate failures.

### Requirement: Config-based factory delegates through resolveTransitionChangeDeps

The config-based `createTransitionChange(config, options?)` form MUST derive `TransitionChangeDeps` through `resolveTransitionChangeDeps(resolver)` and then delegate to canonical `createTransitionChange(deps)`.

`resolveTransitionChangeDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`
- `actor: ActorResolver`
- `schemaProvider: SchemaProvider`
- `refreshImplementationTracking: RefreshImplementationTracking`
- `approvals: ApprovalGates`
- `transitionBindings` from `resolveWorkflowCheckRegistry` (application `create*` checks)
- `reconcile: ReconcileChangeValidity` (mandatory)
- `checkRegistry: CheckRegistry`
- `resolveChangeSchema: ResolveChangeSchema`

It MUST NOT resolve `lifecycle` or `LifecycleEngine`. `TransitionChange` imports `evaluateLifecycle` as a module function.

It MUST NOT resolve `runStepHooks` onto the use case. `RunStepHooks` is a constructor dep of `createHookPre` / `createHookPost`.

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

### Requirement: Historic parked approval repair precedence

For an in-flight change in `pending-spec-approval` or `pending-signoff`, `TransitionChange` MUST NOT apply drain-specific target rules, and MUST NOT keep a hardcoded list of legal drain targets. It validates the requested target with the same bound checks as any other source state. Because the approval predicates are bound on those source states (see [`core:transition-checks`](../transition-checks/spec.md)), leaving a parked state without a valid approval fails with `CheckPredicateFailedError` for `approval.spec` / `approval.signoff` (code `APPROVAL_REQUIRED`, carrying the approval action). A target that the topology does not admit (including any other legacy state) fails with `CheckPredicateFailedError` for `protocol.edge`. No transition leads into a legacy parking state.

## Constraints

- `TransitionChange` MUST enforce the legal entity/protocol edge; it only resolves the effective target and delegates the state mutation.
- Task completion checks are controlled by schema-declared `requiresTaskCompletion`; only listed artifacts are content-checked. `safeRegex` compilation failures or nested quantifiers are treated as non-matching without throwing.
- `InvalidStateTransitionError` is reserved for the rejection raised by the `Change` entity when `Change.transition()` is called with a pair that `VALID_TRANSITIONS` does not admit, and for the `incomplete-artifact` eligibility failure of `ApproveSpec` / `ApproveSignoff` (not a check). Registered predicate failures MUST map to `CheckPredicateFailedError` rather than to check-specific reasons, and `TransitionChange` MUST NOT keep a parallel requires/task/dependency/readOnly/implementation algorithm.
- Enter-ready predicates and forward exit-implementing predicates MUST use the same runners as `ArchiveChange`. Redesign MUST NOT run implementation-readiness checks merely because it moves backward.
- Pre-hook and before-persist post-hook aborts prevent the requested transition. Post effects run only on forward movement; source-post effects do not run for backward, redesign, or recovery.
- `verifying → implementing` MUST NOT clear unchanged artifact validation. Schema `implementing.requires` still governs later forward readiness, not retry-side clearing.
- A `designing → designing` request is a neutral application no-op: it MUST NOT append a transition event or invalidate approval/artifacts, and it MUST still validate `skipChecks` against the resolved bindings before returning the unchanged change. The entity continues to reject real self-transitions. `verifying → verifying` remains invalid, not a renewal protocol.
- Schema resolution failure MUST throw; absence of a target workflow row only skips workflow-specific requires/task checks, not protocol or other predicates.
- Composition MUST inject application `create*` transition bindings, not domain stubs; `RunStepHooks` belongs in hook checks rather than the use-case constructor.
- Enter-ready and forward exit-implementing predicate failures are reported as `CheckPredicateFailedError` like every other predicate failure; no check-specific error class is preserved for them. A missing happy-path next hop MUST throw `HappyPathNextUnavailableError`.

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
- [`core:check-registry`](../check-registry/spec.md) — registers step-skip checks for bypassed states.
- [`core:workflow-topology`](../workflow-topology/spec.md) — authoritative domain service for legal transitions and bypassed steps.
- [`core:resolve-change-schema`](../resolve-change-schema/spec.md) — sovereign schema lookup, identity integrity, and version advisory.
