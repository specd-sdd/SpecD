# Tasks: 08-core-project-summary

## 1. Core domain types and use case

- [x] 1.1 Add `GetProjectSummaryResult` interface
      `packages/core/src/application/use-cases/get-project-summary.ts`: new file — define readonly count fields per design
      Approach: export interface with `activeCount`, `draftCount`, `discardedCount`, `archivedCount`, `specsByWorkspace`, `workspaceCount`
      (Req: Returns count-only project summary)

- [x] 1.2 Implement `GetProjectSummary` class constructor
      `packages/core/src/application/use-cases/get-project-summary.ts`: `GetProjectSummary` — accept five list use cases as private readonly deps
      Approach: mirror `ListChanges` constructor style; no config or repository construction
      (Req: Constructor accepts orchestration dependencies)

- [x] 1.3 Implement `GetProjectSummary.execute()`
      `packages/core/src/application/use-cases/get-project-summary.ts`: `execute()` — parallel orchestration and count assembly
      Approach: `Promise.all` for list calls + workspaces; `.length` for change arrays; `archived.meta.total` for archived; second `Promise.all` for `specRepo.count()`; build ordered `specsByWorkspace` map
      (Req: Orchestrates existing list use cases, Orchestrates workspace spec counting, Parallelizes independent queries)

## 2. Composition and kernel wiring

- [x] 2.1 Add `createGetProjectSummary` factory
      `packages/core/src/composition/use-cases/get-project-summary.ts`: new file — wire via `createListChanges`, `createListDrafts`, `createListDiscarded`, `createListArchived`, `createListWorkspaces`
      Approach: follow `createListChanges(config)` single-arg pattern
      (Req: Factory wires from SpecdConfig)

- [x] 2.2 Extend `Kernel` interface
      `packages/core/src/composition/kernel.ts`: `Kernel.project` — add `getProjectSummary: GetProjectSummary`
      Approach: import types; add property to interface only
      (Req: Kernel exposes use case)

- [x] 2.3 Wire `getProjectSummary` in `createKernel`
      `packages/core/src/composition/kernel.ts`: `createKernel` body — `getProjectSummary: createGetProjectSummary(config)`
      Approach: place alongside existing `project` namespace entries
      (Req: Kernel exposes use case)

- [x] 2.4 Export new symbols
      `packages/core/src/application/index.ts`: export `GetProjectSummary`, `GetProjectSummaryResult`
      Approach: named exports matching existing use case export pattern
      (Req: Returns count-only project summary)

## 3. CLI integration

- [x] 3.1 Replace count orchestration with `getProjectSummary`
      `packages/cli/src/commands/project/status.ts`: action handler — call `kernel.project.getProjectSummary.execute()` in parallel with `listWorkspaces` and `loadGraphData`
      Approach: remove direct `kernel.changes.list/listDrafts/listDiscarded` and manual `specRepo.count()` loop
      (Req: includes change counts, includes spec counts)

- [x] 3.2 Map summary fields to output builders
      `packages/cli/src/commands/project/status.ts`: text/json/toon render paths — use `summary.*` for counts including `archivedCount`
      Approach: add archived to changes section; derive `totalSpecs` from `Object.values(summary.specsByWorkspace)`
      (Req: includes change counts)

## 4. Tests

- [x] 4.1 Add unit tests for `GetProjectSummary`
      `packages/core/test/application/use-cases/get-project-summary.spec.ts`: new file — mock list use cases; cover all verify scenarios
      Approach: vi.fn mocks returning controlled arrays and `ArchiveListResult` with `meta.total !== items.length`
      (Req: all core:get-project-summary verify scenarios)

- [x] 4.2 Assert kernel exposes `getProjectSummary`
      `packages/core/test/composition/kernel-get-config.spec.ts` or dedicated test: `createKernel` — expect `kernel.project.getProjectSummary` defined
      Approach: minimal smoke test alongside existing kernel composition tests
      (Req: Kernel exposes use case)

- [x] 4.3 Update CLI project-status tests
      `packages/cli/test/commands/project-status.spec.ts`: stub `getProjectSummary`; assert archived count; ensure list use cases not called for counting
      Approach: extend existing setup mock kernel with `project.getProjectSummary.execute` returning fixture summary
      (Req: cli:project-status verify deltas)

## 5. Documentation

- [x] 5.1 Document `GetProjectSummary` in core use-cases docs
      `docs/core/use-cases.md`: add `GetProjectSummary` under project query use cases with result shape and purpose
      Approach: match existing list use case entry format
      (Req: documentation per design)

- [x] 5.2 Update core overview if kernel project API listed
      `docs/core/overview.md`: add `getProjectSummary` to kernel `project` namespace enumeration if present
      Approach: single-line addition consistent with neighbouring entries
      (Req: documentation per design)
