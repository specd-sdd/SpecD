# Tasks: enrich-project-summary

## 1. Core types and use case

- [x] 1.1 Add `GetProjectSummaryInput` and `ProjectChangeSummaryEntry`
      `packages/core/src/application/use-cases/get-project-summary.ts`:
      new exported interfaces — opt-in flags and listing row shape
      Approach: `includeChanges?` / `includeSpecsHealth?`; entry has `name`, `state`,
      `tasks: { incomplete, total }`
      (Req: Optional enrichment input flags; Optional active and draft change listings with tasks)

- [x] 1.2 Extend `GetProjectSummaryResult` with optional enrichment keys
      `packages/core/src/application/use-cases/get-project-summary.ts`:
      `GetProjectSummaryResult` — add optional `active`, `drafts`, `specsHealth`
      Approach: TypeScript optional fields; omit when flags off (not `null`)
      (Req: Returns count-only project summary; Optional specs health enrichment)

- [x] 1.3 Expand constructor dependencies for enrichment collaborators
      `packages/core/src/application/use-cases/get-project-summary.ts`:
      `GetProjectSummary` constructor — accept `ListChanges`, `ListDrafts`, `CountTasks`,
      `GetSpecsHealth` alongside existing deps
      Approach: store as private fields; do not construct repositories inline
      (Req: Constructor accepts orchestration dependencies)

- [x] 1.4 Implement count-only `execute` default path
      `packages/core/src/application/use-cases/get-project-summary.ts`:
      `execute(input?)` — when both flags false/omitted, return only count fields
      Approach: keep existing `Promise.all` count assembly; do not call list/CountTasks/health
      (Req: Returns count-only project summary; Orchestrates existing list use cases;
      Parallelizes independent queries)

- [x] 1.5 Implement `includeChanges` listing + task projection
      `packages/core/src/application/use-cases/get-project-summary.ts`:
      `execute` enrichment branch — build `active` / `drafts` arrays
      Approach: `listChanges`/`listDrafts`, then `get`/`getDraft` + `countTasks.execute({ change })`;
      project incomplete/total; ensure all pages/items covered (no silent truncation);
      empty buckets → `[]`
      (Req: Optional active and draft change listings with tasks)

- [x] 1.6 Implement `includeSpecsHealth` branch
      `packages/core/src/application/use-cases/get-project-summary.ts`:
      `execute` — set `specsHealth` from `getSpecsHealth.execute({})` when flag true
      Approach: skip call entirely when flag false/omitted
      (Req: Optional specs health enrichment)

## 2. Core composition

- [x] 2.1 Extend `GetProjectSummaryDeps` and resolver
      `packages/core/src/composition/use-cases/get-project-summary.ts`:
      `GetProjectSummaryDeps` / `resolveGetProjectSummaryDeps` — resolve listChanges,
      listDrafts, countTasks, getSpecsHealth
      Approach: use composition resolver accessors already used by sibling factories
      (Req: Config-based factory delegates through resolveGetProjectSummaryDeps)

- [x] 2.2 Wire new deps through `createGetProjectSummary` normalized path
      `packages/core/src/composition/use-cases/get-project-summary.ts`:
      `createGetProjectSummary` / `createGetProjectSummaryFromNormalized` — pass all deps
      Approach: preserve complete repository bootstrap semantics; no inline fs wiring
      (Req: Factory wires from SpecdConfig; Config-based summary wiring preserves complete
      repository bootstrap semantics; Kernel exposes use case)

## 3. SDK snapshot

- [x] 3.1 Add enrichment options to snapshot options type
      `packages/sdk/src/orchestration/build-project-status-snapshot.ts`:
      `BuildProjectStatusSnapshotOptions` — `includeChanges?`, `includeSpecsHealth?`
      Approach: default false; document forwarding to GetProjectSummary
      (Req: Result shape stability)

- [x] 3.2 Forward enrichment options into `getProjectSummary.execute`
      `packages/sdk/src/orchestration/build-project-status-snapshot.ts`:
      `buildProjectStatusSnapshot` — build summaryInput from true flags only
      Approach: when both false, call `execute()`/`execute({})`; do not duplicate
      enrichment fields outside `summary`
      (Req: buildProjectStatusSnapshot orchestration; Result shape stability;
      No direct repository bootstrap in snapshot orchestration)

## 4. CLI project status

- [x] 4.1 Always request enrichment from snapshot
      `packages/cli/src/commands/project/status.ts`:
      snapshot call sites — pass `includeChanges: true` and `includeSpecsHealth: true`
      (and keep graph/hotspots behaviour)
      Approach: both default and `--graph` paths include enrichment flags
      (Req: includes change counts; includes specs health (always);
      includes graph freshness (always); supports --graph flag)

- [x] 4.2 Present active/drafts listings and specsHealth in all formats
      `packages/cli/src/commands/project/status.ts`:
      text/json/toon presenters — emit listings and health from `summary`
      Approach: each listing entry shows name, state, tasks incomplete/total;
      text health line uses word labels `ok` / `failed` / `warning`
      (e.g. `265 total · 265 ok · 0 failed · 0 warning`); issue rows use
      `failed`/`warning`; json/toon keep `passed`/`failed`/`warned`; no CLI flags
      (Req: includes change counts; includes specs health (always);
      supports json and toon formats; defaults to text output)

## 5. CLI project dashboard

- [x] 5.1 Always request enrichment for dashboard data
      `packages/cli/src/commands/project/dashboard.ts`:
      `buildProjectStatusSnapshot` call — `{ includeGraph: true, includeChanges: true,
    includeSpecsHealth: true }`
      Approach: derive UI only from summary; no direct GetSpecsHealth/ListChanges/CountTasks
      (Req: Data sources)

- [x] 5.2 Specs box header shows total with health aggregates
      `packages/cli/src/commands/project/dashboard.ts`:
      Specs box first line — `N total · P✓ F✗ W⚠` from `summary.specsHealth`
      Approach: keep per-workspace count table below; no per-workspace health badges
      (Req: Text dashboard)

- [x] 5.3 Changes box adds active tasks done/total line
      `packages/cli/src/commands/project/dashboard.ts`:
      Changes box — after count rows, `tasks X/Y done` summing over `summary.active`
      Approach: `done = sum(total - incomplete)`, `Y = sum(total)`; do not list change names
      (Req: Text dashboard)

## 6. Tests

- [x] 6.1 Unit tests for GetProjectSummary enrichment paths
      `packages/core/test/application/use-cases/get-project-summary.spec.ts`:
      cover default omit keys, includeChanges listings/empty arrays, includeSpecsHealth,
      no CountTasks/health when flags off, counts still from count\*
      Approach: mock ListChanges/ListDrafts/CountTasks/GetSpecsHealth + repositories
      (Req: all GetProjectSummary verify scenarios for new/updated requirements)

- [x] 6.2 Composition/resolver tests for new deps
      `packages/core/test/composition/use-cases/get-project-summary.spec.ts`:
      assert resolver resolves enrichment collaborators
      Approach: extend makeDeps/makeConfig fixtures
      (Req: Config-based factory delegates through resolveGetProjectSummaryDeps)

- [x] 6.3 SDK snapshot forwarding tests
      `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts`:
      assert execute receives enrichment flags; fields only under summary
      Approach: stub kernel.project.getProjectSummary.execute
      (Req: buildProjectStatusSnapshot orchestration; Result shape stability)

- [x] 6.4 CLI status presenter/options tests
      `packages/cli/test/commands/project/status.spec.ts`:
      assert snapshot options and output include listings + health
      Approach: stub buildProjectStatusSnapshot return shape
      (Req: includes change counts; includes specs health (always); graph/--graph options)

- [x] 6.5 CLI dashboard header and tasks line tests
      `packages/cli/test/commands/project-dashboard.spec.ts`:
      assert Specs health header and Changes tasks line; enrichment options
      Approach: stub snapshot with specsHealth + active task entries
      (Req: Text dashboard; Data sources)

## 7. Docs and manual verification

- [x] 7.1 Update existing docs mentions if present
      `docs/guide/**` (and any existing CLI prose found): mention always-on status
      enrichments and dashboard Specs/Changes lines when those docs already describe the commands
      Approach: search before writing; skip inventing new CLI doc pages if none exist
      (Req: docs guidance from design)

- [x] 7.2 Manual E2E check of status and dashboard
      Run `node packages/cli/dist/index.js project status --format toon|text` and
      `project dashboard --format text` after build
      Approach: confirm listings/health/tasks line; compare counts to changes/drafts list
      (Req: manual verification from design Testing)
