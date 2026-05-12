# Proposal: auto-task-completion-check

## Motivation

Task completion checks should be an inherent property of the transition system, not something callers must assemble and pass in. Currently the check is hardcoded to one transition (`implementing → verifying`) and relies on the caller to build `implementingTaskChecks` — which the CLI doesn't even do, making the gate silently ineffective.

## Current behaviour

- `TransitionChange` accepts an optional `implementingTaskChecks` array in its input. If provided, it checks artifact file content for incomplete tasks **only** on the `implementing → verifying` transition (lines 194-196).
- The CLI `change transition` command never constructs or passes this array, so the check never runs in practice.
- The schema already declares `taskCompletionCheck` on artifact types (e.g. `tasks` has `incompletePattern: '^\s*-\s+\[ \]'`), but this information is not consumed automatically — it requires the caller to read the schema and build the checks manually.
- The `implementingRequires` input for clearing artifact validations on `verifying → implementing` has the same caller-assembly problem.

## Proposed solution

Make `TransitionChange` derive task completion checks automatically from the schema:

1. During workflow `requires` enforcement, for each required artifact that has a `taskCompletionCheck` on its `ArtifactType`, load the artifact file content and verify no lines match `incompletePattern`.
2. Remove `implementingTaskChecks` from `TransitionChangeInput` — the use case handles it internally.
3. Remove `implementingRequires` from `TransitionChangeInput` — the use case can read the `implementing` step's `requires` from the schema directly.
4. The check becomes generic: any step that requires an artifact with `taskCompletionCheck` gets the gate, not just `implementing → verifying`.

## Specs affected

### New specs

_None._

### Modified specs

- `core:core/workflow-model`: Define the generic semantic rule — when a workflow step requires an artifact whose type declares `taskCompletionCheck`, the transition system must verify all tasks are complete before allowing the transition. This moves the rule from being an implementation detail of one transition to a first-class property of the workflow model.
- `core:core/change`: Remove the hardcoded `implementing → verifying` task completion gate. Replace with a reference to the generic workflow-model rule that applies to any step requiring an artifact with `taskCompletionCheck`.
- `core:core/transition-change`: Remove `implementingTaskChecks` and `implementingRequires` from the input contract. Implement the generic check during `requires` enforcement by reading `taskCompletionCheck` from the schema's artifact types.

## Impact

- **`packages/core/src/application/use-cases/transition-change.ts`** — main logic change: remove caller-provided checks, derive from schema during requires enforcement.
- **`packages/cli/src/commands/change/transition.ts`** — simplifies: no longer needs to build or pass `implementingTaskChecks` or `implementingRequires`.
- **`packages/core/test/application/use-cases/transition-change.spec.ts`** — update tests to reflect new behaviour.
- **Public API** — `TransitionChangeInput` loses two optional fields. This is a breaking change for direct callers of the use case, but since only the CLI calls it and the CLI never passed these fields, practical impact is zero.

## Open questions

_None._
