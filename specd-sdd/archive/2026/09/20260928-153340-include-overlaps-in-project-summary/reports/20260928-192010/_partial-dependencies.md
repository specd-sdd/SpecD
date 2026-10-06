# Dependency audit: include-overlaps-in-project-summary

Scope: depth-1 dependency specs only. Question: does the change contradict a published dependency requirement? Change contract checked: opt-in `includeOverlaps` on `GetProjectSummary`, forwarded by `buildProjectStatusSnapshot`, always `true` from `project status`; `DetectOverlap`, `GetSpecsHealth`, kernel members, and dashboard stay as they are.

## core:spec-overlap

**conformant**

`GetProjectSummary.execute` calls `DetectOverlap.execute()` with no argument when the flag is true (`packages/core/src/application/use-cases/get-project-summary.ts` `execute`). `DetectOverlap.execute` returns the unfiltered `OverlapReport` when `input?.name` is undefined and throws `ChangeNotFoundError` only when a name is set and missing (`packages/core/src/application/use-cases/detect-overlap.ts` `execute`). That matches **Requirement: DetectOverlap accepts an optional change name filter** and the verify scenario “without a name filter”.

Wiring is `createDetectOverlap(resolveDetectOverlapDeps(resolver))` (`packages/core/src/composition/use-cases/get-project-summary.ts` `resolveGetProjectSummaryDeps`), which resolves `changes: ChangeRepository` only. That matches **Requirement: Config-based factory delegates through resolveDetectOverlapDeps**. The use case constructor and domain service are not modified. Drafts, discarded, and archived changes stay out because overlap still uses `ChangeRepository.list()` plus `detectSpecOverlap`.

## core:get-specs-health

**conformant**

`includeSpecsHealth` still calls `GetSpecsHealth.execute({})` (`get-project-summary.ts` `execute`). `GetSpecsHealth.execute` forwards a workspace only when `input.workspace !== undefined` (`packages/core/src/application/use-cases/get-specs-health.ts` `execute`). `{}` stays project-wide, matching **Requirement: Workspace filtering** (optional filter, delegated to `ValidateSpecs`). The change does not add `activeSpecIds` filtering, `failedClosedSpecs`, or a health rewrite. `GetSpecsHealth` itself is untouched.

## core:composition-resolver

**conformant**

Overlap deps are assembled in the per-use-case helper, not on the resolver: `resolveGetProjectSummaryDeps` calls `resolveDetectOverlapDeps(resolver)` (`get-project-summary.ts` composition). That matches **Requirement: Resolver does not own per-use-case dependency objects** and **Requirement: Public config-based factories delegate through the resolver**. `resolver.getChangeRepository()` caches one repository per session (`packages/core/src/composition/composition-resolver.ts`). The snapshot does not construct repositories; it calls `ctx.kernel.project.getProjectSummary.execute` (`packages/sdk/src/orchestration/build-project-status-snapshot.ts` `buildProjectStatusSnapshot`).

## core:kernel

**conformant**

`createKernel` already mounts `changes.detectOverlap` (`DetectOverlap`) and `project.getProjectSummary` (`GetProjectSummary`) (`packages/core/src/composition/kernel.ts`). The change adds no kernel member. `GetProjectSummary` receives a second `DetectOverlap` instance from the same resolver session, so it shares the cached `ChangeRepository` (**Requirement: createKernel constructs shared adapters once**). `includeOverlaps` is a per-call flag, not a construction-time config re-pass (**Requirement: Kernel use case execute inputs must not re-pass construction-time config**).

Published **Requirement: Kernel entry mapping** still omits `project.getProjectSummary`. That gap predates this change. This change does not add an undocumented path.

## core:count-tasks

**conformant**

`CountTasks` stays on the `includeChanges` listing path (`get-project-summary.ts` `_buildChangeListings`). Overlap detection does not call it and does not change `kernel.changes.countTasks` (**Requirement: Supports composition and kernel wiring**).

## core:list-changes

**conformant**

Active listings still go through `ListChanges` only when `includeChanges` is true. Overlaps go through `DetectOverlap` → `ChangeRepository.list()`, not `ListChanges.execute()`, so the list use case’s default `limit` of 100 (**Requirement: Returns all active changes**) is not reused as the overlap source. Count fields stay on `ChangeRepository.count()`, not list length.

## core:list-drafts

**conformant**

Draft listings stay behind `includeChanges`. Overlap does not call `ListDrafts` and does not treat drafts as active. `draftCount` stays on `countDrafts()`.

## core:list-workspaces

**conformant**

Workspace iteration for `specsByWorkspace` still uses `ListWorkspaces.execute()` and `specRepo.count()` only. Overlap does not preload spec content (**Constraints**: no spec content preload) and does not replace the workspace repository bootstrap.

## core:list-discarded

**conformant**

`discardedCount` stays on `ChangeRepository.countDiscarded()`. The change does not call `ListDiscarded` and does not include discarded changes in the overlap report.

## core:list-archived

**conformant**

`archivedCount` stays on `ArchiveRepository.count()`. The change does not call `ListArchived` and does not include archived changes in the overlap report.

## core:get-project-context

**conformant**

Project context stays a separate kernel call. The summary does not compile context, pass `config` into `GetProjectContext`, or fold overlaps into context entries (**Requirement: Accepts GetProjectContextInput as input**; **Constraints**: change-independent).

## sdk:host-context

**conformant**

`project status` still bootstraps with `openSpecdHost` and reads graph data only through `buildProjectStatusSnapshot` (`packages/cli/src/commands/project/status.ts`). The snapshot uses `ctx.kernel` and `withOpenGraphProvider(ctx)`; it does not call `createKernel`, `createCodeGraphProvider`, or repository factories itself. That matches **Requirement: openSpecdHost** / **Requirement: createSdkContext** (one host, kernel and graph provider bound to the same config). `includeOverlaps` is not a second core+code-graph wiring path.

`project dashboard` still calls `buildProjectStatusSnapshot` without `includeOverlaps` (`packages/cli/src/commands/project/dashboard.ts`). Default false leaves that summary without `overlaps`.

## code-graph:get-graph-health

**conformant**

Graph health is still `createGetGraphHealth().execute` on an already-open provider, and only when `includeGraph` is true (`build-project-status-snapshot.ts`). Overlap loading stays inside `GetProjectSummary`. `GetGraphHealth` still does not open or close the provider, load change entities, or compile project context (**Requirement: Accepts open provider and project inputs**; **Constraints**).

## Counts

- Specs checked: 13
- Contradictions: 0
