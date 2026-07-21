# Tasks: fix-project-dashboard-snapshot

## 1. Refactor Data Fetching & Redirection

- [x] 1.1 Delegate non-text formats to `project status` in `dashboard.ts`
      `packages/cli/src/commands/project/dashboard.ts`: `registerProjectDashboard` — if `opts.format !== 'text'`, delegate execution to `status` command handler
      Approach: Parse or invoke status command with `--format <fmt>` (and `--config`), avoiding separate JSON/TOON output formatting logic in `dashboard.ts`.
      (Req: JSON and toon output)

- [x] 1.2 Use `openSpecdHost` and `buildProjectStatusSnapshot` in text mode
      `packages/cli/src/commands/project/dashboard.ts`: `registerProjectDashboard` — replace `resolveCliContext` and separate kernel calls with `openSpecdHost` and `buildProjectStatusSnapshot(host, { includeGraph: true })`
      Approach: Open host using `openSpecdHost({ options: { kernel: buildCliKernelOptions() }, ...(opts.config ? { configPath: opts.config } : {}) })` and get `snapshot` containing `summary` and `graphHealth`.
      (Req: Data sources)

## 2. Improve TUI Rendering & Wrapping

- [x] 2.1 Add multi-line wrapping for `workspaces:` in `Project` box
      `packages/cli/src/commands/project/dashboard.ts`: `registerProjectDashboard` — wrap comma-separated workspaces across multiple indented lines when length exceeds inner box width
      Approach: Use `wrapValue` with `ROOT_LABEL` style indentation so continuation lines align cleanly with the value column position.
      (Req: Text dashboard, scenario: Long workspaces list wraps to value column)

- [x] 2.2 Add `Graph` inner box in TUI text mode
      `packages/cli/src/commands/project/dashboard.ts`: `registerProjectDashboard` — render an inner box labelled `Graph` showing graph freshness, staleness status, and file/symbol counts
      Approach: Use `innerBox('Graph', ...)` with `graphHealth.lastIndexedAt`, `graphHealth.stale`, `graphHealth.fileCount`, `graphHealth.symbolCount` when graph is available.
      (Req: Text dashboard, scenario: Graph box displays health diagnostics)

- [x] 2.3 Render `Changes` box as an aligned 2-column table
      `packages/cli/src/commands/project/dashboard.ts`: `registerProjectDashboard` — format `Changes` inner box as an aligned 2-column table with each change state on its own line (`active`, `drafts`, `discarded`, `archived`)
      Approach: Format change state labels left-aligned and counts right-aligned matching the `Specs` table style.
      (Req: Text dashboard, scenario: Changes box shows active, drafts, discarded, and archived)

## 3. Tests & Documentation

- [x] 3.1 Update CLI dashboard unit/integration tests
      `packages/cli/test/commands/project-dashboard.spec.ts` — update tests to assert non-text redirection to `status`, `buildProjectStatusSnapshot` text rendering, archived changes, workspaces wrapping, and graph health
      Approach: Verify `specd project dashboard --format json` delegates to `status`, and assert text mode renders multi-line workspaces and graph stats.
      (Req: Text dashboard, Requirement: JSON and toon output)

- [x] 3.2 Update CLI Reference documentation
      `docs/cli/cli-reference.md` — update `specd project dashboard` documentation to describe delegation to `project status` in non-text mode
      Approach: Document `--format json|toon` behavior as delegating directly to `specd project status`.
      (Req: Text dashboard, Requirement: JSON and toon output)
