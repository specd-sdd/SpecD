<!-- AI guidance: explain WHY this change is needed. Cover motivation, current pain,
     proposed solution, and scope. Do not write requirements here. -->

# Proposal: workflow-task-completion-gate

## Motivation

Task completion gating is currently coupled to the artifact definition (`taskCompletionCheck` on `ArtifactType`). This means the check runs on **every** workflow step that lists the artifact in its `requires` — including steps where incomplete tasks are expected (e.g. `ready` requires `tasks`, but tasks are completed during `implementing`). Additionally, when the transition fails due to task completion, the error message is a generic `Cannot transition from 'X' to 'Y'` with no indication of _why_ it failed.

## Current behaviour

1. The `tasks` artifact declares `taskCompletionCheck` with `incompletePattern` in the schema.
2. `TransitionChange` iterates the target step's `requires`. For each required artifact, it checks whether the `ArtifactType` has a `taskCompletionCheck`. If it does, it loads the artifact files and runs the incomplete pattern — if any match, it throws `InvalidStateTransitionError`.
3. This means `designing → ready` is blocked by unchecked task items in `tasks.md`, even though tasks are only meant to be completed during implementation.
4. When the transition fails (whether due to missing artifacts, task completion, or invalid state), the error is always `Cannot transition from '<from>' to '<to>'` — no reason is given.

## Proposed solution

Two changes:

### 1. Move task completion gating to the workflow step

Add a `requiresTaskCompletion` field to workflow step definitions. This is an array of artifact IDs (a subset of `requires`) for which task completion is enforced on that specific step. The `taskCompletionCheck` declaration stays on the artifact (it defines _what_ pattern to check), but the _when_ is controlled by the workflow step.

```yaml
# schema.yaml
workflow:
  - step: ready
    requires: [proposal, specs, verify, design, tasks]
    # no requiresTaskCompletion → tasks.md checkboxes are not gated here

  - step: verifying
    requires: [proposal, specs, verify, design, tasks]
    requiresTaskCompletion: [tasks] # only here are incomplete tasks blocked
```

`TransitionChange` changes its logic: instead of checking `artifactType.taskCompletionCheck` for every artifact in `requires`, it only checks artifacts listed in `workflowStep.requiresTaskCompletion`.

### 2. Add reason to transition failure errors

Extend `InvalidStateTransitionError` to carry a structured `reason` explaining what caused the failure:

- `incomplete-artifact` — a required artifact is not `complete` or `skipped`
- `incomplete-tasks` — task completion check found incomplete items
- `invalid-transition` — the state machine does not allow this transition

The error carries both `complete` and `incomplete` counts (derived from `completePattern` and `incompletePattern` respectively). The total is their sum. The CLI can then display a helpful message like:

```
error: Cannot transition from 'implementing' to 'verifying': tasks has incomplete items (3/30 tasks complete)
```

## Specs affected

### New specs

None.

### Modified specs

- `core:core/schema-format`: Add `requiresTaskCompletion` field to workflow step definition. Update `taskCompletionCheck` description to clarify it defines the pattern, not where it applies.
- `core:core/workflow-model`: Update task completion gating requirement — gating is now controlled by `requiresTaskCompletion` on the step, not by artifact `requires` + `taskCompletionCheck`.
- `core:core/build-schema`: Parse and validate `requiresTaskCompletion` on workflow steps (must be subset of `requires`, must reference artifacts that have `taskCompletionCheck`).
- `core:core/transition-change`: Change requires enforcement to use `workflowStep.requiresTaskCompletion` instead of checking every required artifact. Add structured reason to `InvalidStateTransitionError`.

## Impact

- **`@specd/core`**:
  - `domain/errors/invalid-state-transition-error.ts` — add `reason` field
  - `domain/value-objects/workflow-step.ts` (or equivalent) — add `requiresTaskCompletion` property
  - `domain/services/build-schema.ts` — parse and validate `requiresTaskCompletion`
  - `application/use-cases/transition-change.ts` — change task completion check logic
  - `application/use-cases/get-status.ts` — may need to report task completion blockers separately
- **`@specd/schema-std`**: Update `schema.yaml` to add `requiresTaskCompletion` to the appropriate workflow steps
- **`@specd/cli`**: Error display may improve automatically if the error message changes, but no CLI code changes expected

## Open questions

None — the approach is clear from our discussion.
