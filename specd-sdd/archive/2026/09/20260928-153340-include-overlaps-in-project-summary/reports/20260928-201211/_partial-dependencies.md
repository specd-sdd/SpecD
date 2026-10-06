# Dependencies

Depth-1 check for `include-overlaps-in-project-summary`. Compared published specs (`specs show --artifact specs`) with:

- `packages/core/src/application/use-cases/get-project-summary.ts`
- `packages/core/src/application/use-cases/detect-overlap.ts` (`execute`)
- `packages/core/src/composition/use-cases/get-project-summary.ts` (`resolveGetProjectSummaryDeps`)
- `packages/core/src/composition/kernel.ts` (`Kernel.project`)
- `packages/code-graph/src/application/use-cases/get-graph-health.ts` (`GetGraphHealthInput`)
- `packages/sdk/src/orchestration/build-project-status-snapshot.ts`
- `packages/cli/src/commands/project/status.ts`

`core:count-tasks`, `core:list-workspaces`, `core:list-changes`, and `core:list-drafts` were opened only to see whether the overlap enrichment path breaks them.

## core:spec-overlap

### Contradictions

none

`includeOverlaps` calls `DetectOverlap.execute()` with no argument. `execute(input?)` treats `input?.name === undefined` as the unfiltered report and throws `ChangeNotFoundError` only when a name is set and that change is absent from `ChangeRepository.list()`. `OverlapReport` exposes `entries` and `hasOverlap` (`hasOverlap` is true iff `entries` is non-empty). The summary returns that report unchanged. Composition builds it with `createDetectOverlap(resolveDetectOverlapDeps(resolver))`, which resolves `changes: ChangeRepository` only. Overlap still loads active changes via `list()`; drafts and discarded changes stay out. Repository `list()` has no default limit, so the unfiltered report is the full active bucket, not the `ListChanges` page of 100.

### Summary counts

- specs checked: 1
- contradictions: 0

## core:get-specs-health

### Contradictions

none

`includeSpecsHealth` still calls `GetSpecsHealth.execute({})`. `GetSpecsHealthInput.workspace` is optional. `execute` forwards `{ workspace }` only when `input.workspace !== undefined`, so `{}` stays project-wide and is delegated to `ValidateSpecs`. The overlap flag does not filter health by active spec ids, and it does not rewrite `issues`, `passed`, `failed`, or `warned`.

### Summary counts

- specs checked: 1
- contradictions: 0

## code-graph:get-graph-health

### Contradictions

none

`GetGraphHealthInput` is `config`, `provider`, `codeGraphVersion`, optional `workspaces`, optional `adapters`, optional `manifestSource`. It has no `assertUnlocked` or other caller-controlled lock escape hatch. `buildProjectStatusSnapshot` calls `execute` only when `includeGraph` is true, with `{ config, provider, codeGraphVersion, workspaces }` on an already-open provider. Overlap loading stays in `GetProjectSummary` and does not pass lock-assertion fields into graph health.

### Summary counts

- specs checked: 1
- contradictions: 0

## core:kernel

### Contradictions

**Low — spec drift. The change depends on a kernel member the exhaustive table does not list. The overlap flag does not add that member.**

- Spec (`Requirement: Kernel entry mapping`): the `kernel.project` table is the exhaustive binding contract. Listed paths are `project.listWorkspaces`, `project.getProjectContext`, `project.getConfig`, `project.getMetadata`, `project.updateMetadata`. `project.getProjectSummary` / `GetProjectSummary` is absent. `Requirement: Every exported use case must have a kernel entry` requires every exported application use case to appear in that interface table.
- Change code: `GetProjectSummary` is exported and mounted as `Kernel.project.getProjectSummary` (`packages/core/src/composition/kernel.ts`). `buildProjectStatusSnapshot` and `project status` load overlaps only through `ctx.kernel.project.getProjectSummary.execute(...)`. The change delta depends on `core:kernel` for kernel exposure and does not add a kernel-table delta.

The mount predates this change (`resolveContextSpecs` is another table omission in the same interface). `includeOverlaps` is a per-call flag. It is not a value fixed on `SpecdConfig` or `KernelOptions`, so it does not re-pass construction-time config (`Requirement: Kernel use case execute inputs must not re-pass construction-time config`). `changes.detectOverlap` remains the `DetectOverlap` row already in the `kernel.changes` table.

### Summary counts

- specs checked: 1
- contradictions: 1

## core:composition-resolver

### Contradictions

none

`resolveGetProjectSummaryDeps(resolver)` is the per-use-case helper. It does not live on `CompositionResolver`. The config form of `createGetProjectSummary` creates one resolver, derives deps through that helper, and delegates to `createGetProjectSummary(deps)`. `detectOverlap` is `createDetectOverlap(resolveDetectOverlapDeps(resolver))` on that same session. The snapshot does not build repositories; it calls the kernel use case.

### Summary counts

- specs checked: 1
- contradictions: 0

## sdk:host-context

### Contradictions

none

`project status` bootstraps with `openSpecdHost({ configPath?, options: { kernel } })`, which matches `OpenSpecdHostInput` (`configPath` and `options?: SdkContextOptions`). The snapshot takes `SdkHostContext` and reads config with `ctx.kernel.project.getConfig.execute()`. It does not store a second `SpecdConfig` on the context, and `includeOverlaps` does not add a second kernel or graph-provider factory. Graph open stays behind `includeGraph` via `withOpenGraphProvider(ctx)`.

### Summary counts

- specs checked: 1
- contradictions: 0

## core:count-tasks

### Contradictions

none

`CountTasks` runs only inside `_buildChangeListings`, which runs only when `includeChanges` is true. `includeOverlaps` does not call it and does not change `kernel.changes.countTasks`.

### Summary counts

- specs checked: 1
- contradictions: 0

## core:list-workspaces

### Contradictions

none

Spec totals still come from `ListWorkspaces.execute()` plus `specRepo.count()`. Overlap detection does not iterate workspaces and does not preload spec content through this use case.

### Summary counts

- specs checked: 1
- contradictions: 0

## core:list-changes

### Contradictions

none

Active listings still go through `ListChanges.execute()` only when `includeChanges` is true. Overlaps use `DetectOverlap` → `ChangeRepository.list()`, so the use case default limit of 100 is not the overlap source. `activeCount` stays on `ChangeRepository.count()`.

### Summary counts

- specs checked: 1
- contradictions: 0

## core:list-drafts

### Contradictions

none

Draft listings stay behind `includeChanges`. Overlap does not call `ListDrafts` and does not treat drafts as active. `draftCount` stays on `countDrafts()`.

### Summary counts

- specs checked: 1
- contradictions: 0

## Aggregate

- specs checked: 10
- contradictions: 1
