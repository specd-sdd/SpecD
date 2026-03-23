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
- `implementingRequires` (readonly string\[], optional) — artifact IDs whose validation is cleared on `verifying` to `implementing`
- `implementingTaskChecks` (ReadonlyArray\<TaskCompletionCheck>, optional) — task completion checks for `implementing` to `verifying`
- `skipHookPhases` (ReadonlySet\<HookPhaseSelector>, optional, default empty set) — which hook phases to skip. Valid values: `'source.pre'`, `'source.post'`, `'target.pre'`, `'target.post'`, `'all'`. When `'all'` is in the set, all hook phases are skipped. When the set is empty (default), all applicable hooks execute.

The previous `skipHooks: boolean` field is removed. Callers that passed `skipHooks: true` should pass `skipHookPhases: new Set(['all'])` instead.

### Requirement: Change must exist

The use case MUST load the change from the `ChangeRepository` by name. If no change exists with the given name, it MUST throw `ChangeNotFoundError`.

### Requirement: Approval-gate routing for spec approval

When the change is in `ready` state, the requested target is `implementing`, and `approvalsSpec` is `true`, the use case MUST route the transition to `pending-spec-approval` instead of `implementing`.

### Requirement: Approval-gate routing for signoff

When the change is in `done` state, the requested target is `archivable`, and `approvalsSignoff` is `true`, the use case MUST route the transition to `pending-signoff` instead of `archivable`.

### Requirement: Direct transition when gates are inactive

When neither approval-gate routing condition is met, the use case MUST transition to the exact target state requested in the input.

### Requirement: Workflow requires enforcement

After resolving the effective target, the use case MUST obtain the active schema via `SchemaProvider` and look up the workflow step for the effective target via `schema.workflowStep(effectiveTarget)`. If the step declares a non-empty `requires` array, the use case MUST check `change.effectiveStatus(artifactId)` for each required artifact ID. If any required artifact has an effective status other than `complete` or `skipped`, the use case MUST throw `InvalidStateTransitionError`.

If no workflow step exists for the effective target (the schema does not declare one), or the schema cannot be resolved, the requires check is skipped.

The use case MUST emit a `requires-check` progress event per artifact checked, reporting whether the requirement was satisfied.

### Requirement: Task completion check on implementing to verifying

When the current state is `implementing` and the effective target is `verifying`, the use case MUST check each entry in `implementingTaskChecks` before allowing the transition:

1. Load the artifact file content via `ChangeRepository.artifact(change, check.filename)`
2. If the artifact does not exist (returns `null`), skip it
3. Compile the `incompletePattern` using `safeRegex` with the `'m'` flag
4. If the regex is valid and matches any line in the artifact content, throw `InvalidStateTransitionError`

### Requirement: Artifact validation clearing on verifying to implementing

When the current state is `verifying` and the effective target is `implementing`, the use case MUST call `change.clearArtifactValidations` with the `implementingRequires` list (defaulting to an empty array) before performing the transition. This resets validation state for the specified artifacts.

### Requirement: Transition to designing from any state

Every state except `drafting` SHALL include `designing` as a valid transition target. This allows the user to return to the design phase at any point in the lifecycle when issues are discovered.

When the effective target is `designing`, the use case MUST:

1. Invalidate the active spec approval if one exists — call `change.invalidate('redesign', actor)`.
2. Invalidate the active signoff if one exists — the invalidation in step 1 already clears both.
3. Proceed with the transition via `change.transition('designing', actor)`.

If no active approvals exist, the transition proceeds directly without invalidation.

The `archivable` state is no longer terminal — it can transition to `designing` like any other state.

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

After a successful transition, the use case MUST persist the updated change via `ChangeRepository.save`.

### Requirement: Result type

`TransitionChange.execute` MUST return a `TransitionChangeResult` containing:

- `change` — the updated `Change` instance after the transition

The previous `postHookFailures` field is removed because both hook phases are now fail-fast — a hook failure throws `HookFailedError` and prevents the transition. There are no post-transition hook failures to collect.

### Requirement: Progress callback

`TransitionChange.execute` SHALL accept an optional second parameter `onProgress?: OnTransitionProgress`. Progress events are:

- `{ type: 'requires-check', artifactId: string, satisfied: boolean }` — emitted per artifact during requires enforcement
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
- Task completion checks use safeRegex to compile patterns; patterns that fail compilation or contain nested quantifiers are treated as non-matching (no error thrown)
- The implementingTaskChecks and implementingRequires inputs default to empty arrays when not provided
- Approval-gate routing is purely input-driven — the use case does not read configuration directly
- Pre-hook failure aborts the transition — no state change occurs
- Post-hook failures are collected in the result — no rollback
- When schema resolution fails or no workflow step exists for the target, requires and hooks are skipped gracefully

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md)
- [`specs/core/run-step-hooks/spec.md`](../run-step-hooks/spec.md)
- [`specs/core/hook-execution-model/spec.md`](../hook-execution-model/spec.md)
- [`specs/core/workflow-model/spec.md`](../workflow-model/spec.md)
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md)
