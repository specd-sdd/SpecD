# Design: status-task-completion

## Affected areas

- `packages/core/src/application/use-cases/get-status.ts` (`GetStatus.execute()`)
  - Add task completion counting logic after building `artifactStatuses`
  - Import `safeRegex` from `../../domain/services/safe-regex.js`
  - Use `ChangeRepository.artifact()` to read file content for task-capable artifacts
  - Populate `taskCompletion` field on matching `ArtifactStatusEntry` entries
  - Callers: 12+ dependent files across core + cli (risk: MEDIUM — this is additive, no existing API changes)
- `packages/cli/src/commands/change/status.ts` (`renderDag()`)
  - Update task tag from `[hasTasks]` to `[hasTasks - N/M done]` when `taskCompletion` data is present
  - Add task count display in details section
  - Callers: 5 direct dependents, ~97 transitive (risk: CRITICAL — but change is display-only, no signature changes)

## New constructs

- `taskCompletion` field on `ArtifactStatusEntry` interface in `get-status.ts:70`
  - Shape: `{ readonly complete: number; readonly incomplete: number; readonly total: number }`
  - Optional — present only when schema artifact has `hasTasks: true` and `taskCompletionCheck`
  - No new classes or files required

## Approach

1. **Import `safeRegex`** in `get-status.ts` (same import used by `TransitionChange._checkTaskCompletionForArtifact`)
2. **In `execute()`**, after the main artifact status loop (after line 301, before the `try/catch` finally block), iterate through `schemaInfo.artifacts`. For each artifact type with `hasTasks() === true` and `taskCompletionCheck()` returning a config:
   - Get the `ArtifactStatusEntry` from `artifactStatuses` array by type
   - For each file in the change artifact, load content via `this._changes.artifact(change, file.filename)`
   - Count matches using `safeRegex(taskCheck.incompletePattern, 'gm')` and optionally `safeRegex(taskCheck.completePattern, 'gm')`
   - Set `taskCompletion` on the status entry
3. **In the catch branch** (schema resolution failure), task completion is skipped (no schema info available)
4. **In CLI `renderDag()`**, look up the artifact status entry for each DAG node. If `taskCompletion` exists, render `[hasTasks - N/M done]`. Otherwise keep `[hasTasks]`.
5. **In CLI details section**, append `  tasks: N/M` to the artifact status line when `taskCompletion` exists

## Key decisions

**Decision** → Task counting is done in `GetStatus.execute()` rather than as a separate use case or in the CLI. This keeps the data accessible in both text and JSON outputs without each consumer reimplementing the counting logic.

**Alternatives rejected**:

- Counting in the CLI: would require passing `ChangeRepository` and `safeRegex` to the CLI layer, breaking layering
- Counting in a separate use case: adds unnecessary indirection for a ~20-line addition

## Trade-offs

- [Performance] Task counting adds I/O (file reads) to `GetStatus`. Mitigation: only for artifacts with `hasTasks: true` and `taskCompletionCheck`, which is typically just the `tasks` artifact
- [Edge case] If `completePattern` is not set, `total` equals `incomplete`. This matches the existing behavior in `TransitionChange._checkTaskCompletionForArtifact`

## Testing

**Automated tests:**

- `packages/core/test/application/use-cases/get-status.spec.ts`: add test cases for:
  - Task completion returned for task-capable artifact
  - Task completion omitted when file does not exist
  - Task completion with only `incompletePattern` (no `completePattern`)

**Manual / E2E:**

- Create a change, write a `tasks.md` with `[ ] task 1` and `[x] task 2`, validate, then run `specd changes status <name>` — DAG should show `[hasTasks - 1/2 done]`
