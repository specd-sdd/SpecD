# Proposal: fix-project-dashboard-snapshot

## Motivation

`specd project dashboard` provides inconsistent status metrics compared to `specd project status`. It computes counts manually via `kernel.specs.list` and individual change listing use cases instead of using `buildProjectStatusSnapshot` / `getProjectSummary`. Furthermore, long workspace lists cause ANSI line overflow in text mode instead of wrapping cleanly within box borders.

## Current behaviour

Currently, `specd project dashboard`:

- Reads spec and change counts manually using `kernel.specs.list`, `kernel.changes.list`, `kernel.changes.listDrafts`, and `kernel.changes.listDiscarded`.
- Omits empty workspaces from spec count summaries and misses archived change totals.
- Does not include code graph status diagnostics (freshness, file/symbol counts).
- Overflows box borders when rendering long workspace lists (e.g., 15 workspaces) on a single line.

## Proposed solution

- Refactor `specd project dashboard` to use `buildProjectStatusSnapshot(host, { includeGraph: true })` as the single source of truth for project metrics.
- Support full JSON/TOON output schema including `changes.archived` and `graph` health information.
- Enhance TUI formatting in `dashboard.ts` to wrap `workspaces:` across multiple indented lines when it exceeds inner box width, and make the `Project` inner box span full width.

## Specs affected

### New specs

- None

### Modified specs

- `cli:project-dashboard`: Requirements updated to mandate `buildProjectStatusSnapshot` as data source, include graph stats, report archived changes, and wrap long workspace lists cleanly in TUI text mode.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `packages/cli/src/commands/project/dashboard.ts`
- `packages/cli/test/commands/project-dashboard.spec.ts`

## Technical context

- `buildProjectStatusSnapshot` is implemented in `@specd/sdk` and invokes `kernel.project.getProjectSummary.execute()` and `createGetGraphHealth()`.
- TUI box formatting uses `boxen` and custom inner box rendering with `wrapValue` in `dashboard.ts`.

## Open questions

- None
