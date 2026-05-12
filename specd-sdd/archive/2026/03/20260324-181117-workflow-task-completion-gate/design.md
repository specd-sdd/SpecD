# Design: workflow-task-completion-gate

## Non-goals

- Removing `taskCompletionCheck` from artifact types — it stays as the pattern definition.
- Changing the `completePattern` semantics — counting is for error reporting only, not gating logic.
- Modifying any CLI command beyond what error message changes naturally propagate.

## Affected areas

### `packages/core/src/domain/value-objects/workflow-step.ts`

Add `requiresTaskCompletion` to the `WorkflowStep` interface:

```typescript
readonly requiresTaskCompletion: readonly string[]
```

Defaults to empty array. Must be a subset of `requires`.

### `packages/core/src/domain/errors/invalid-state-transition-error.ts`

Add structured `reason` field to the error class. Three reason types:

```typescript
type TransitionFailureReason =
  | { type: 'invalid-transition' }
  | { type: 'incomplete-artifact'; artifactId: string }
  | {
      type: 'incomplete-tasks'
      artifactId: string
      incomplete: number
      complete: number
      total: number
    }
```

The constructor gains an optional `reason` parameter. The error message is enriched when a reason is present:

- `incomplete-artifact`: `"Cannot transition from 'X' to 'Y': artifact 'specs' is not complete"`
- `incomplete-tasks`: `"Cannot transition from 'X' to 'Y': tasks has incomplete items (3/30 tasks complete)"`
- `invalid-transition` / no reason: existing message unchanged

### `packages/core/src/infrastructure/schema-yaml-parser.ts`

Add `requiresTaskCompletion` to `WorkflowStepZodSchema` (line 120-140):

```typescript
requiresTaskCompletion: z.array(z.string()).optional(),
```

Transform passes it through to `WorkflowStepRaw`. Add to `WorkflowStepRaw` interface (line 233).

### `packages/core/src/domain/services/build-schema.ts`

After existing workflow validation (line 471-513), add `requiresTaskCompletion` validation:

1. For each step with `requiresTaskCompletion`:
   - Every ID must be in `step.requires` — otherwise `SchemaValidationError`
   - Every ID must reference an artifact that has `taskCompletionCheck` — otherwise `SchemaValidationError`

The workflow data is cast as `WorkflowStep[]` at line 471. With the new field on both `WorkflowStepRaw` and `WorkflowStep`, the cast flows through.

### `packages/core/src/application/use-cases/transition-change.ts`

**Requires enforcement** (line 148-149): throw with `reason: { type: 'incomplete-artifact', artifactId }` instead of bare `InvalidStateTransitionError`.

**Task completion gating** (line 152-158): replace the current logic that checks every required artifact's `taskCompletionCheck` with a loop over `workflowStep.requiresTaskCompletion`. Only artifacts in that list are content-checked.

**`_checkTaskCompletionForArtifact`** (line 239-259): enhance to count matches and return counts. Count `incompletePattern` matches and optionally `completePattern` matches. Throw with `reason: { type: 'incomplete-tasks', artifactId, incomplete, complete, total }`. Emit `task-completion-failed` progress event before throwing.

**Progress events**: add `task-completion-failed` event type to `TransitionProgressEvent`.

### `packages/schema-std/schema.yaml`

Add `requiresTaskCompletion: [tasks]` to the `verifying` step (line ~571). No other steps need it — `ready` and `implementing` require `tasks` but should not gate on task completion.

## New constructs

### `TransitionFailureReason` type

- **Location**: `packages/core/src/domain/errors/invalid-state-transition-error.ts`
- **Shape**: discriminated union with `type` field: `'invalid-transition'` | `'incomplete-artifact'` | `'incomplete-tasks'`
- **Responsibility**: carries structured context about why a transition failed
- **Relationships**: used by `InvalidStateTransitionError`, consumed by CLI for error display

## Approach

1. **Add `requiresTaskCompletion` to the type chain**: `WorkflowStep` interface → `WorkflowStepRaw` → `WorkflowStepZodSchema` → `buildSchema` validation
2. **Add `TransitionFailureReason` and update `InvalidStateTransitionError`**: add optional `reason` property, enrich error messages
3. **Update `TransitionChange`**: use `workflowStep.requiresTaskCompletion` instead of iterating all requires, count matches, throw with reason
4. **Update `schema-std`**: add `requiresTaskCompletion: [tasks]` to `verifying` step
5. **Update tests**: adapt existing tests, add new scenarios

## Key decisions

**`requiresTaskCompletion` defaults to empty array** → Consistent with `requires`. Empty means no task completion gating. This is the safe default — existing schemas without the field continue to work without any gating (behaviour change from current code where all required artifacts with `taskCompletionCheck` were gated).

**Count both patterns for error reporting** → Even though gating only uses `incompletePattern`, counting `completePattern` matches provides a useful "3/30 tasks complete" progress indicator in error messages.

**Reason as optional property, not constructor overloads** → Keeps the constructor simple. Existing callers that construct `InvalidStateTransitionError(from, to)` continue to work — they get `reason: undefined` which produces the existing message.

## Trade-offs

[Behaviour change for existing schemas] → Schemas that relied on automatic gating of all required artifacts with `taskCompletionCheck` will stop gating unless `requiresTaskCompletion` is added. This is intentional — the `schema-std` update covers the specd project. Other consumers need to add `requiresTaskCompletion` to their workflow steps.

[Breaking change to `InvalidStateTransitionError`] → The constructor signature stays compatible (new optional param). The `reason` property is new. Only consumers that catch and inspect the error need changes.

## Testing

### Automated tests

**File:** `packages/core/test/application/use-cases/transition-change.spec.ts`

- **Modify** existing task completion tests: configure `workflowStep.requiresTaskCompletion` instead of relying on `artifactType.taskCompletionCheck` presence in `requires`
- **Add** `does not gate when requiresTaskCompletion is absent` — step requires artifact with `taskCompletionCheck` but no `requiresTaskCompletion` → no content check
- **Add** `throws with reason incomplete-tasks including counts`
- **Add** `throws with reason incomplete-artifact for unsatisfied requires`
- **Add** `emits task-completion-failed progress event`

**File:** `packages/core/test/domain/services/build-schema.spec.ts`

- **Add** `rejects requiresTaskCompletion not subset of requires`
- **Add** `rejects requiresTaskCompletion referencing artifact without taskCompletionCheck`
- **Add** `accepts valid requiresTaskCompletion`

**File:** `packages/core/test/domain/errors/invalid-state-transition-error.spec.ts` (new or existing)

- **Add** `message includes artifact ID for incomplete-artifact reason`
- **Add** `message includes counts for incomplete-tasks reason`
- **Add** `message is generic when no reason provided`

### Manual / E2E verification

1. Run `pnpm test` — all tests pass
2. Create a change, add tasks with unchecked items
3. Attempt `specd change transition <name> verifying` — expect enriched error: `"tasks has incomplete items (0/5 tasks complete)"`
4. Check all items, retry — expect success
5. Verify `designing → ready` does NOT gate on task completion (no `requiresTaskCompletion` on `ready`)

## Documentation updates

The following existing docs in `docs/` must be updated to reflect this change:

### `docs/core/use-cases.md` — TransitionChange section (line 127+)

- Remove `implementingTaskChecks` and `implementingRequires` from the input table (already removed in prior change but verify)
- Add `task-completion-failed` event to the `TransitionProgressEvent` type block
- Update the error description for `InvalidStateTransitionError` to mention structured `reason`

### `docs/core/errors.md` — InvalidStateTransitionError section (line 222+)

- Add `reason` property documentation (`TransitionFailureReason` type)
- Update the example message to show enriched messages for each reason type
- Add `TransitionFailureReason` type definition

### `docs/core/overview.md` — WorkflowStep entry (line 82)

- Update description to mention `requiresTaskCompletion` field

### `docs/schemas/` — if schema authoring docs exist

- Document `requiresTaskCompletion` as a workflow step field for schema authors
