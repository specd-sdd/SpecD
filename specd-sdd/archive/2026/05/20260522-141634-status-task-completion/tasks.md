# Tasks: status-task-completion

## 1. Core: taskCompletion interface and imports

- [x] 1.1 Add optional `taskCompletion` to `ArtifactStatusEntry`
      `packages/core/src/application/use-cases/get-status.ts`: `ArtifactStatusEntry` — add `taskCompletion?: { readonly complete: number; readonly incomplete: number; readonly total: number }`
      Approach: add as optional field on the existing interface; no other types need modification
      (Req: Reports task completion counts for task-capable artifacts)

- [x] 1.2 Import `safeRegex` utility
      `packages/core/src/application/use-cases/get-status.ts`: add import `safeRegex` from `../../domain/services/safe-regex.js`
      Approach: same import already used by `TransitionChange._checkTaskCompletionForArtifact` in the same package
      (Req: Reports task completion counts for task-capable artifacts)

## 2. Core: task counting logic in execute()

- [x] 2.1 Iterate schema artifacts to find task-capable types
      `packages/core/src/application/use-cases/get-status.ts`: `execute()` — after the artifact status loop (after line 301, before try/catch finally), iterate `schemaInfo.artifacts`, find those with `hasTasks() === true` and `taskCompletionCheck()` returning a config
      Approach: use the try branch where `schemaInfo` is populated; skip counting when schema resolution fails (catch branch)
      (Req: Reports task completion counts for task-capable artifacts)

- [x] 2.2 Load artifact files and count task matches
      `packages/core/src/application/use-cases/get-status.ts`: `execute()` — for each task-capable artifact, find its `ArtifactStatusEntry` in `artifactStatuses`, load each file via `this._changes.artifact(change, file.filename)`, count `safeRegex(incompletePattern, 'gm')` and optionally `safeRegex(completePattern, 'gm')` matches, set `taskCompletion` on the entry
      Approach: mirror `TransitionChange._checkTaskCompletionForArtifact` counting logic; total = complete + incomplete; skip silently if file doesn't exist or pattern is null
      (Req: Reports task completion counts for task-capable artifacts)

## 3. CLI: DAG task tag display

- [x] 3.1 Update `renderDag` to show task completion counts
      `packages/cli/src/commands/change/status.ts`: `renderDag()` at `drawNode` — look up artifact status entry for each DAG node; if `taskCompletion` exists on the entry, render `[hasTasks - N/M done]` instead of `[hasTasks]`
      Approach: find the artifact status entry by `id` matching `artifact.type`; default to `[hasTasks]` when no taskCompletion data
      (Req: Task completion display in DAG)

## 4. CLI: details section and JSON output

- [x] 4.1 Add task count to details section
      `packages/cli/src/commands/change/status.ts`: details section (around line 183) — append `  tasks: N/M` to the artifact status line when `taskCompletion` exists on the entry
      Approach: add a conditional string interpolation in the artifact detail loop, same pattern as the existing drift/hash display
      (Req: Task completion in details section)

- [x] 4.2 Expose `taskCompletion` in JSON/TOON output
      `packages/cli/src/commands/change/status.ts`: JSON/TOON artifacts mapping (around line 227) — add `taskCompletion` field to each artifact entry when present
      Approach: spread `...(a.taskCompletion !== undefined ? { taskCompletion: a.taskCompletion } : {})` in the artifacts map
      (Req: Task completion display in DAG, Task completion in details section)

## 5. Tests

- [x] 5.1 Add core get-status test cases for task completion
      `packages/core/test/application/use-cases/get-status.spec.ts`: add test cases — task completion returned for task-capable artifact, omitted when file does not exist, edge case with only incompletePattern
      Approach: wire a schema provider that returns an artifact type with `hasTasks: true` and `taskCompletionCheck` config; mock `ChangeRepository.artifact()` to return content with known checkbox counts
      (Req: Reports task completion counts for task-capable artifacts)

- [x] 5.2 Update CLI status tests for DAG tag and details
      `packages/cli/test/commands/change-status.spec.ts`: update DAG tag assertions to expect `[hasTasks - N/M done]` instead of `[hasTasks]`; add assertion for details section task count display
      Approach: update existing `hasTasks` test to provide `taskCompletion` in the mock status entries and assert the new format string
      (Req: Task completion display in DAG, Task completion in details section)
