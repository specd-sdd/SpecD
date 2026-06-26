# Proposal: 08-core-project-summary

## Motivation

`project status` and future SDK snapshot builders need consolidated project counts (changes by state, specs per workspace) without each caller manually parallelizing four `list*` use cases plus per-workspace `SpecRepository.count()`. A single core use case removes duplication and prepares `buildProjectStatusSnapshot` in change `11-sdk-host-facade`.

## Current behaviour

`packages/cli/src/commands/project/status.ts` calls `kernel.project.listWorkspaces`, `kernel.changes.list`, `kernel.changes.listDrafts`, `kernel.changes.listDiscarded`, and per-workspace `specRepo.count()` in parallel. Archived change count is not reported. No reusable core abstraction exists for summary counts.

## Proposed solution

Add `GetProjectSummary` in `@specd/core`: orchestrates existing list use cases and workspace spec counting, returns counts only (no change entities, no spec metadata). Wire as `kernel.project.getProjectSummary`. Update `cli:project-status` to consume the use case for counts while keeping graph and context assembly in the CLI (deferred to SDK migration changes).

## Specs affected

### New specs

- `core:get-project-summary`: application use case for project-level counts without graph or context concerns
  - Depends on: `core:list-workspaces`, `core:list-changes`, `core:list-drafts`, `core:list-discarded`, `core:list-archived`, `core:kernel`

### Modified specs

- `cli:project-status`: obtain change and spec counts via `GetProjectSummary` instead of direct list orchestration; include archived count in output
  - Depends on (added): `core:get-project-summary`
  - Depends on (removed): none

## Impact

| Area                                                             | Change                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| `packages/core/src/application/use-cases/get-project-summary.ts` | New use case + result type                           |
| `packages/core/src/composition/use-cases/get-project-summary.ts` | Factory `createGetProjectSummary`                    |
| `packages/core/src/composition/kernel.ts`                        | `kernel.project.getProjectSummary`                   |
| `packages/core/src/application/index.ts`                         | Export new symbols                                   |
| `packages/cli/src/commands/project/status.ts`                    | Replace manual count orchestration                   |
| Tests                                                            | New core unit tests; update CLI project-status tests |

Blast radius: **MEDIUM** — `kernel.ts` affects composition tests; `status.ts` affects CLI tests. No breaking public API outside kernel wiring.

**Overlap:** `cli:project-status` also targeted by `12-cli-mcp-sdk-migration`. Archive this change first.

## Technical context

Agreed result shape from exploration:

```ts
interface GetProjectSummaryResult {
  activeCount: number
  draftCount: number
  discardedCount: number
  archivedCount: number
  specsByWorkspace: Record<string, number>
  workspaceCount: number
}
```

- `GetProjectSummary` MUST NOT touch code-graph or context compilation.
- Counts derived from `.length` of list use case results; spec counts from `SpecRepository.count()` via `ListWorkspaces` orchestration.
- `createGetProjectSummary(config)` factory follows existing composition patterns (`createListWorkspaces`, etc.).
- Graph freshness, `--graph`, `--context` remain CLI responsibilities in this change.

## Open questions

_none — scope confirmed: add `core:get-project-summary`, fast-forward all design artifacts._
