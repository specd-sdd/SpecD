# Design: auto-task-completion-check

## Non-goals

- Adding `completePattern` usage or progress reporting (e.g. "3/5 tasks complete") — that's a separate enhancement.
- Changing the `TaskCompletionCheck` domain value object in `validation-rule.ts` — it stays as-is.
- Modifying the schema format or `buildSchema` — `taskCompletionCheck` on `ArtifactType` already works correctly.

## Affected areas

### `packages/core/src/application/use-cases/transition-change.ts`

**Main change.** The `TaskCompletionCheck` interface (lines 15-30) and the `implementingTaskChecks`/`implementingRequires` fields on `TransitionChangeInput` (lines 69-84) are removed. The `_checkTaskCompletion` private method (lines 273-286) is replaced with a new `_checkTaskCompletionForRequires` that takes the schema and workflow step, iterates `requires`, looks up each artifact type via `schema.artifact(id)`, and checks content if `taskCompletionCheck` is defined.

The hardcoded `implementing → verifying` guard (lines 194-197) is removed. Instead, task completion checks run inside the requires enforcement loop (lines 182-192) — after confirming `effectiveStatus` is satisfied, check content if the artifact type has `taskCompletionCheck`.

The `verifying → implementing` clearing (lines 200-202) reads `requires` from `schema.workflowStep('implementing')` instead of `input.implementingRequires`.

### `packages/core/test/application/use-cases/transition-change.spec.ts`

Update the `implementing → verifying transition with task checks` describe block (line 261+) to remove caller-provided `implementingTaskChecks` from test inputs. Instead, tests configure the mock schema to return artifact types with `taskCompletionCheck`. Add tests for:

- Generic gating on any step (not just `implementing → verifying`)
- Required artifact without `taskCompletionCheck` is not content-checked
- Schema-derived clearing on `verifying → implementing`

Remove tests that validate caller-provided `implementingRequires` behaviour.

### `packages/cli/src/commands/change/transition.ts`

No functional change needed — the CLI already doesn't pass `implementingTaskChecks` or `implementingRequires`. The simplified `TransitionChangeInput` just means fewer optional fields available, which the CLI was already ignoring.

### `packages/core/src/application/use-cases/index.ts`

Remove the `TaskCompletionCheck` re-export from transition-change if it exists (it doesn't currently — the type was only exported from the use case file itself).

## Approach

The change integrates task completion checking into the existing requires enforcement loop. The key insight is that `TransitionChange` already has the schema (`this._schemaProvider.get()`) and already iterates `workflowStep.requires` — we just need to enhance each iteration to also check content when the artifact type has `taskCompletionCheck`.

**Order of operations in `execute()`:**

1. Load change, resolve actor, compute effective target (unchanged)
2. Resolve schema and workflow step (unchanged)
3. **Enhanced requires enforcement**: for each required artifact ID:
   a. Check `effectiveStatus` — if not `complete`/`skipped`, throw (unchanged)
   b. Look up `schema.artifact(artifactId)` to get the `ArtifactType`
   c. If the artifact type has `taskCompletionCheck` and `taskCompletionCheck.incompletePattern`:
   - Get the `ChangeArtifact` via `change.getArtifact(artifactId)`
   - Iterate its `files` map — for each `ArtifactFile`, load content via `this._changes.artifact(change, file.filename)`
   - If content exists, compile pattern with `safeRegex('m')` and test
   - If matches, throw `InvalidStateTransitionError`
     d. Emit `requires-check` progress event (unchanged)
4. **Schema-derived clearing**: on `verifying → implementing`, look up `schema.workflowStep('implementing')` and use its `requires` for `clearArtifactValidations`
5. Rest of the flow (approval invalidation, hooks, transition, save) unchanged

**Default pattern handling:** When `taskCompletionCheck` is defined but `incompletePattern` is `undefined`, the schema YAML already provides a default (`^\s*-\s+\[ \]`). The `buildSchema` service only sets `incompletePattern` on the domain object when it's explicitly declared. However, the schema-std YAML declares it explicitly on the `tasks` artifact. If a custom schema omits the pattern, the check is simply skipped (no pattern = no match = no block). This matches the spec: "compile using `safeRegex` — if null, skip".

## Key decisions

**Inline into requires loop vs. separate pass** → Inline. The requires loop already iterates the same artifact IDs. Running the content check immediately after the `effectiveStatus` check keeps the logic together and avoids a second pass. The trade-off is slightly more complex loop body, but it's more efficient and easier to reason about.

**Remove `TaskCompletionCheck` interface from use case** → Yes. The caller-facing interface is no longer needed — all information comes from the schema. The domain `TaskCompletionCheck` in `validation-rule.ts` remains unchanged.

**Schema-derived clearing for `verifying → implementing`** → Read `schema.workflowStep('implementing')?.requires` directly. If no implementing step exists in the schema, skip clearing. This removes the last caller-assembly responsibility.

## Trade-offs

[Schema lookup per transition] → Every transition now calls `schema.artifact(id)` for each required artifact. The schema is already loaded in memory, and `artifact(id)` is an O(1) Map lookup, so the overhead is negligible.

[Breaking change to `TransitionChangeInput`] → Two optional fields removed. The only caller (CLI) never used them, so practical impact is zero. Any external consumer would get a compile-time error — clean and discoverable.

## Testing

### Automated tests

**File:** `packages/core/test/application/use-cases/transition-change.spec.ts`

Update existing `implementing → verifying transition with task checks` describe block:

- **Modify** `blocks transition when an artifact has incomplete task items` — configure mock schema with artifact type that has `taskCompletionCheck.incompletePattern`, remove `implementingTaskChecks` from input
- **Modify** `allows transition when all tasks are complete` — same schema-based setup
- **Modify** `allows transition when no task checks provided` → rename to `allows transition when required artifact has no taskCompletionCheck`
- **Add** `blocks transition on any step with taskCompletionCheck requires` — use a step other than `verifying` (e.g. `archiving`) that requires an artifact with `taskCompletionCheck`
- **Add** `skips content check for required artifact without taskCompletionCheck` — verify `ChangeRepository.artifact` is not called for artifacts without `taskCompletionCheck`
- **Add** `handles missing artifact file gracefully` — artifact returns null, transition proceeds

Update `verifying → implementing transition` describe block:

- **Modify** clearing tests — remove `implementingRequires` from input, verify the use case reads from schema's `implementing` step `requires`
- **Add** `skips clearing when no implementing step in schema` — schema returns null for `workflowStep('implementing')`

### Manual / E2E verification

1. Create a change with a `tasks` artifact containing unchecked checkboxes
2. Attempt `specd change transition <name> verifying` — expect error about incomplete tasks
3. Check all task items, retry — expect success
4. Confirm `specd change transition <name> implementing` from verifying clears validations
5. Run `pnpm test` — all tests pass
6. Run `pnpm lint` — no lint errors
