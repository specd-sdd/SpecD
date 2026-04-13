# TransitionChange

## Purpose

Changes must advance through a strict lifecycle, and the rules for doing so — approval gates, task completion checks, validation clearing, requires enforcement, and hook execution — are too complex for callers to enforce ad-hoc. The `TransitionChange` use case centralises lifecycle state transitions, implementing approval-gate routing, task completion checks for the `implementing` to `verifying` transition, artifact validation clearing for the `verifying` to `implementing` transition, workflow `requires` enforcement, and `run:` hook execution with progress callbacks.

## Requirements

### Requirement: Input contract

`TransitionChange.execute` SHALL accept a `TransitionChangeInput` with the following fields:

- `name` (string, required) — the change to transition
- `to` (ChangeState, required) — the requested target state
- `approvalsSpec` (boolean, required) — whether the spec approval gate is enabled
- `approvalsSignoff` (boolean, required) — whether the signoff gate is enabled
- `skipHookPhases` (ReadonlySet\<HookPhaseSelector>, optional, default empty set) — which hook phases to skip. Valid values: `'source.pre'`, `'source.post'`, `'target.pre'`, `'target.post'`, `'all'`. When `'all'` is in the set, all hook phases are skipped. When the set is empty (default), all applicable hooks execute.

The `implementingTaskChecks` and `implementingRequires` fields are removed. Task completion checks are now derived automatically from the schema during requires enforcement (see Requirement: Task completion check during requires enforcement). Artifact validation clearing on `verifying → implementing` reads the `implementing` step's `requires` from the schema directly.

### Requirement: Change must exist

The use case MUST load the change from the `ChangeRepository` by name. If no change exists with the given name, it MUST throw `ChangeNotFoundError`.

### Requirement: Approval-gate routing for spec approval

When the change is in `ready` state, the requested target is `implementing`, and `approvalsSpec` is `true`, the use case MUST route the transition to `pending-spec-approval` instead of `implementing`.

### Requirement: Approval-gate routing for signoff

When the change is in `done` state, the requested target is `archivable`, and `approvalsSignoff` is `true`, the use case MUST route the transition to `pending-signoff` instead of `archivable`.

### Requirement: Human-approval pending states produce explicit transition failures

When the current change state represents a human approval boundary, `TransitionChange` MUST fail with an `InvalidStateTransitionError` that carries a structured reason explaining why normal lifecycle progression cannot continue through `change transition`.

Specifically:

- When the change is in `pending-spec-approval` and the requested target is anything other than `designing`, the use case MUST throw `InvalidStateTransitionError` with reason `{ type: 'approval-required', gate: 'spec' }`
- When the change is in `pending-signoff` and the requested target is anything other than `designing`, the use case MUST throw `InvalidStateTransitionError` with reason `{ type: 'approval-required', gate: 'signoff' }`

This explicit failure happens before delegating to `change.transition(...)`. The goal is to preserve the existing lifecycle rules while giving callers enough information to explain why the transition cannot proceed automatically.

### Requirement: Direct transition when gates are inactive

When neither approval-gate routing condition is met, the use case MUST transition to the exact target state requested in the input.

### Requirement: Workflow requires enforcement

After resolving the effective target, the use case MUST obtain the active schema via `SchemaProvider` and look up the workflow step for the effective target via `schema.workflowStep(effectiveTarget)`. If the step declares a non-empty `requires` array, the use case MUST check `change.effectiveStatus(artifactId)` for each required artifact ID. If any required artifact has an effective status other than `complete` or `skipped`, the use case MUST throw `InvalidStateTransitionError` with reason `incomplete-artifact` and the blocking artifact ID.

If no workflow step exists for the effective target (the schema does not declare one), or the schema cannot be resolved, the requires check is skipped.

The use case MUST emit a `requires-check` progress event per artifact checked, reporting whether the requirement was satisfied.

### Requirement: Task completion check during requires enforcement

After workflow requires enforcement passes, if the target workflow step declares a non-empty `requiresTaskCompletion` array, the use case MUST check each listed artifact for incomplete task items:

1. Look up the `ArtifactType` from the schema to obtain `taskCompletionCheck.incompletePattern`.
2. Get the `ChangeArtifact` via `change.getArtifact(artifactId)`. If it does not exist, skip it.
3. Iterate the artifact's `files` map. For each `ArtifactFile`, load the file content via `ChangeRepository.artifact(change, file.filename)`.
4. If the file does not exist (returns `null`), skip it.
5. Compile `incompletePattern` using `safeRegex` with the `'gm'` flags.
6. If the regex is valid and matches any line in the file content, throw `InvalidStateTransitionError` with reason `incomplete-tasks`, including the artifact ID, incomplete count (lines matching `incompletePattern`), and complete count (lines matching `completePattern` if declared).

Only artifacts listed in `requiresTaskCompletion` are content-checked. Other artifacts in `requires` are checked only via `effectiveStatus`. When `requiresTaskCompletion` is absent or empty, no task completion gating applies.

### Requirement: Artifact validation clearing on verifying to implementing

When the current state is `verifying` and the effective target is `implementing`, the use case MUST treat that path as an implementation-only retry.

The transition is valid only when the current artifacts still correctly describe the intended behavior and the required fix fits within the already-defined tasks. In that case:

- the use case transitions back to `implementing`
- it MUST NOT clear unchanged validated artifacts
- it MUST NOT downgrade artifact or file states merely because verification failed

If verification concludes that the artifacts must change, or that new tasks are required before implementation can resume, callers must route to `designing` instead of `implementing`.

### Requirement: Transition to designing from any state

Every state except `drafting` SHALL include `designing` as a valid transition target. This allows the user to return to the design phase at any point in the lifecycle when issues are discovered.

When the effective target is `designing` and the change is **not already in** `designing` or `drafting`, the use case MUST:

1. Invalidate the active spec approval if one exists.
2. Invalidate the active signoff if one exists — the first invalidation already clears both.
3. Downgrade every artifact file to `pending-review`, except files already marked `drifted-pending-review`, which keep that more specific state.
4. Recompute every artifact's aggregate persisted `state`.
5. Proceed with the transition via `change.transition('designing', actor)`.

When the change is **already in** `designing` (a `designing → designing` transition) or in `drafting` (the natural first entry), the use case MUST NOT invalidate approvals, downgrade artifacts, or call `invalidate()`. It MUST proceed directly with the transition via `change.transition('designing', actor)`.

Drift detection (artifact content changes) is handled independently at the repository layer and is not affected by this rule.

### Requirement: Pre-hook execution

After source.post hooks succeed (or are skipped), when `'all'` and `'target.pre'` are both absent from `skipHookPhases`, and the target workflow step has `run:` pre-hooks, the use case MUST execute them via `RunStepHooks.execute({ name, step: effectiveTarget, phase: 'pre' })`. It MUST emit `hook-start` and `hook-done` progress events (with `phase: 'pre'`) for each hook. If any pre-hook fails, the use case MUST throw `HookFailedError` — no state transition occurs.

When `'all'` or `'target.pre'` is in `skipHookPhases`, pre-hook execution is skipped entirely.

### Requirement: Transition delegation

After routing, pre-transition checks, and successful pre-hooks, the use case MUST delegate the actual state transition to `change.transition(effectiveTarget, actor)`. The `Change` entity enforces transition validity via its own state machine.

### Requirement: Transition event

After a successful state transition, the use case MUST emit a `transitioned` progress event with `from` and `to` states.

### Requirement: Post-hook execution

**Before** the state transition (and before pre-hooks), when `'all'` and `'source.post'` are both absent from `skipHookPhases`, the use case MUST look up the workflow step for the **source state** (`fromState`) via `schema.workflowStep(fromState)`. If the step has `run:` post-hooks, the use case MUST execute them via `RunStepHooks.execute({ name, step: fromState, phase: 'post' })`. It MUST emit `hook-start` and `hook-done` progress events (with `phase: 'post'`) for each hook. If any post-hook fails, the use case MUST throw `HookFailedError` — no state transition occurs.

The source state is the state the change was in **before** the transition — post hooks represent "after finishing this step". This means hooks configured as `implementing.post` run when transitioning **out of** implementing (e.g. `implementing → verifying`), not when transitioning **into** implementing.

The execution order is: source.post hooks → target.pre hooks → state transition. Both phases are fail-fast — a failure in either aborts the transition.

If no workflow step exists for the source state, or the schema cannot be resolved, post-hook execution is skipped.

### Requirement: Persistence

After routing, persisted-state checks, and successful pre-transition hooks, the use case MUST apply the final change-state mutation through `ChangeRepository.mutate(name, fn)` rather than persisting a previously loaded snapshot.

Inside the mutation callback, the repository supplies the fresh persisted `Change` for `name`. The use case MUST apply any persisted-state-dependent transition mutations on that instance — including approval invalidation for redesign, artifact validation clearing for `verifying -> implementing`, and the lifecycle transition itself — before returning the updated change.

When the callback resolves, the repository persists the updated change manifest. This ensures the final lifecycle mutation is serialized with other concurrent mutations of the same change.

### Requirement: Result type

`TransitionChange.execute` MUST return a `TransitionChangeResult` containing:

- `change` — the updated `Change` instance after the transition

The previous `postHookFailures` field is removed because both hook phases are now fail-fast — a hook failure throws `HookFailedError` and prevents the transition. There are no post-transition hook failures to collect.

### Requirement: Progress callback

`TransitionChange.execute` SHALL accept an optional second parameter `onProgress?: OnTransitionProgress`. Progress events are:

- `{ type: 'requires-check', artifactId: string, satisfied: boolean }` — emitted per artifact during requires enforcement
- `{ type: 'task-completion-failed', artifactId: string, incomplete: number, complete: number, total: number }` — emitted when task completion check fails, before throwing
- `{ type: 'hook-start', phase: 'pre' | 'post', hookId: string, command: string }` — emitted before each hook
- `{ type: 'hook-done', phase: 'pre' | 'post', hookId: string, success: boolean, exitCode: number }` — emitted after each hook
- `{ type: 'transitioned', from: ChangeState, to: ChangeState }` — emitted after state change

### Requirement: Dependencies

`TransitionChange` depends on the following ports injected via constructor:

- `ChangeRepository` — for loading, artifact content access, and persistence
- `ActorResolver` — for resolving the current actor identity
- `SchemaProvider` — for obtaining the fully-resolved active schema to look up workflow steps and requires
- `RunStepHooks` — for executing `run:` hooks at step boundaries

## Constraints

- The use case MUST NOT bypass the Change entity's transition validation — it only resolves the effective target and delegates
- Task completion checks are controlled by `requiresTaskCompletion` on the workflow step — only listed artifacts are content-checked
- Task completion checks use `safeRegex` to compile patterns; patterns that fail compilation or contain nested quantifiers are treated as non-matching (no error thrown)
- `InvalidStateTransitionError` carries a structured `reason` field: `'incomplete-artifact'`, `'incomplete-tasks'`, `'invalid-transition'`, or `'approval-required'`
- Approval-gate routing is purely input-driven — the use case does not read configuration directly
- Pre-hook failure aborts the transition — no state change occurs
- Post-hook failure aborts the transition — no state change occurs (both phases are fail-fast)
- When schema resolution fails or no workflow step exists for the target, requires and hooks are skipped gracefully
- Artifact validation clearing on `verifying → implementing` reads the `implementing` step's `requires` from the schema — the caller does not supply them
- A `designing → designing` transition MUST NOT trigger approval invalidation or artifact downgrade — it is a state-preserving transition that only re-enters the same step

## Spec Dependencies

- [`core:core/change`](../change/spec.md) — lifecycle state machine and artifact review downgrade semantics
- [`core:core/run-step-hooks`](../run-step-hooks/spec.md) — hook execution entry point
- [`core:core/hook-execution-model`](../hook-execution-model/spec.md) — hook ordering and failure semantics
- [`core:core/workflow-model`](../workflow-model/spec.md) — workflow `requires` and verification routing
- [`default:_global/architecture`](../../../_global/architecture/spec.md) — application ownership and port boundaries
