# Proposal: status-task-completion

## Motivation

Artifacts with `hasTasks: true` (like `tasks`) show `[hasTasks]` in the CLI DAG view but don't indicate how many tasks are completed vs total. Users and agents can't tell at a glance whether task work is progressing, stalled, or nearly done.

## Current behaviour

The DAG render in `specd change status` appends a static `[hasTasks]` tag to any artifact whose schema type declares `hasTasks: true`. No task counting is performed — the tag is purely a marker that the artifact supports tasks. The `taskCompletionCheck` patterns (`incompletePattern`, `completePattern`) already exist on `ArtifactType` and are used by `TransitionChange` to gate state transitions (e.g. `implementing → verifying`), but the counts are not exposed through `GetStatus` or the CLI.

## Proposed solution

- Add an optional `taskCompletion` field to `ArtifactStatusEntry` in `GetStatus` containing `{ complete, incomplete, total }`
- In `GetStatus.execute()`, for each schema artifact with `hasTasks: true` and `taskCompletionCheck`, read artifact files and count matches against the patterns
- In the CLI `status` command, replace `[hasTasks]` with `[hasTasks - N/M done]` in the DAG tree and show task counts in the details section

## Specs affected

### Modified specs

- `core:get-status`: Add `taskCompletion` field to `ArtifactStatusEntry` and compute it in `execute()` using `ChangeRepository.artifact()` and the schema's `taskCompletionCheck` patterns
  - Depends on (added): none
- `cli:change-status`: Display task completion counts in the DAG tree (`[hasTasks - N/M done]`) and details section
  - Depends on (added): none

## Impact

Two files change:

- `packages/core/src/application/use-cases/get-status.ts` — new field on `ArtifactStatusEntry`, counting logic in `execute()`
- `packages/cli/src/commands/change/status.ts` — DAG render and details output updated to show counts

No schema changes. No new dependencies.

## Technical context

- `TransitionChange._checkTaskCompletionForArtifact` at `transition-change.ts:348` has the reference implementation for task counting using `safeRegex` and `ChangeRepository.artifact()`
- `ArtifactType.hasTasks()` and `ArtifactType.taskCompletionCheck()` provide the schema-level config
- `TaskCompletionCheck` has `incompletePattern?: string` and `completePattern?: string`
- Counting: `incompleteCount = content.match(incompleteRe)?.length ?? 0`, total = incomplete + complete (when `completePattern` is provided; otherwise total = incomplete)
- The `taskCompletion` field is optional in `ArtifactStatusEntry` — present only when the schema artifact has `hasTasks` and `taskCompletionCheck`

## Open questions

None.
