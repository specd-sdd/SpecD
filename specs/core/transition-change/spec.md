# TransitionChange

## Overview

The `TransitionChange` use case performs a lifecycle state transition on an existing change. It implements approval-gate routing (spec approval and signoff gates), task completion checks for the `implementing` to `verifying` transition, and artifact validation clearing for the `verifying` to `implementing` transition.

## Requirements

### Requirement: Input contract

`TransitionChange.execute` SHALL accept a `TransitionChangeInput` with the following fields:

- `name` (string, required) — the change to transition
- `to` (ChangeState, required) — the requested target state
- `approvalsSpec` (boolean, required) — whether the spec approval gate is enabled
- `approvalsSignoff` (boolean, required) — whether the signoff gate is enabled
- `implementingRequires` (readonly string[], optional) — artifact IDs whose validation is cleared on `verifying` to `implementing`
- `implementingTaskChecks` (ReadonlyArray\<TaskCompletionCheck\>, optional) — task completion checks for `implementing` to `verifying`

### Requirement: Change must exist

The use case MUST load the change from the `ChangeRepository` by name. If no change exists with the given name, it MUST throw `ChangeNotFoundError`.

### Requirement: Approval-gate routing for spec approval

When the change is in `ready` state, the requested target is `implementing`, and `approvalsSpec` is `true`, the use case MUST route the transition to `pending-spec-approval` instead of `implementing`.

### Requirement: Approval-gate routing for signoff

When the change is in `done` state, the requested target is `archivable`, and `approvalsSignoff` is `true`, the use case MUST route the transition to `pending-signoff` instead of `archivable`.

### Requirement: Direct transition when gates are inactive

When neither approval-gate routing condition is met, the use case MUST transition to the exact target state requested in the input.

### Requirement: Task completion check on implementing to verifying

When the current state is `implementing` and the effective target is `verifying`, the use case MUST check each entry in `implementingTaskChecks` before allowing the transition:

1. Load the artifact file content via `ChangeRepository.artifact(change, check.filename)`
2. If the artifact does not exist (returns `null`), skip it
3. Compile the `incompletePattern` using `safeRegex` with the `'m'` flag
4. If the regex is valid and matches any line in the artifact content, throw `InvalidStateTransitionError`

### Requirement: Artifact validation clearing on verifying to implementing

When the current state is `verifying` and the effective target is `implementing`, the use case MUST call `change.clearArtifactValidations` with the `implementingRequires` list (defaulting to an empty array) before performing the transition. This resets validation state for the specified artifacts.

### Requirement: Transition delegation

After routing and pre-transition checks, the use case MUST delegate the actual state transition to `change.transition(effectiveTarget, actor)`. The `Change` entity enforces transition validity via its own state machine.

### Requirement: Persistence

After a successful transition, the use case MUST persist the updated change via `ChangeRepository.save` and return the updated `Change` instance.

### Requirement: Dependencies

`TransitionChange` depends on two ports injected via constructor:

- `ChangeRepository` — for loading, artifact content access, and persistence
- `ActorResolver` — for resolving the current actor identity

## Constraints

- The use case MUST NOT bypass the `Change` entity's transition validation — it only resolves the effective target and delegates
- Task completion checks use `safeRegex` to compile patterns; patterns that fail compilation or contain nested quantifiers are treated as non-matching (no error thrown)
- The `implementingTaskChecks` and `implementingRequires` inputs default to empty arrays when not provided
- Approval-gate routing is purely input-driven — the use case does not read configuration directly

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md)
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md)
