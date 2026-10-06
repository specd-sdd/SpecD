# Proposal: include-overlaps-in-project-summary

## Motivation

Hosts that bootstrap from project status need spec-validation health and active-change overlaps together. `GetProjectSummary` already aggregates counts, optional change listings, and optional specs health, but overlaps still require a separate `DetectOverlap` call.

## Current behaviour

`GetProjectSummary.execute` always returns count fields (`activeCount`, `draftCount`, `discardedCount`, `archivedCount`, `specsByWorkspace`, `workspaceCount`). Optional flags `includeChanges` and `includeSpecsHealth` default to false. When they are omitted or false, the keys `active`, `drafts`, and `specsHealth` are absent, and the use case does not list changes or call `GetSpecsHealth`.

`includeSpecsHealth: true` sets `specsHealth` to `GetSpecsHealth.execute({})` for the whole project. That health result is the project spec-validation signal. The per-spec validation cache lives in `ValidateSpecs`.

`DetectOverlap.execute()` with no `name` loads active changes and returns an `OverlapReport` (`entries`, derived `hasOverlap`). The kernel mounts it at `kernel.changes.detectOverlap`. `GetProjectSummary` calls it when `includeOverlaps` is true. `resolveGetProjectSummaryDeps` wires `DetectOverlap`.

`specd project status` (`packages/cli/src/commands/project/status.ts`) reads `summary` only from `buildProjectStatusSnapshot` in `@specd/sdk`. It always requests changes, specs health, and overlaps. JSON and TOON copy `overlaps` to the command root. The `--help` schema shows `overlaps` as present and `approvals` as `specEnabled` / `signoffEnabled`.

`GetProjectSummary` starts `specRepo.count()` when `ListWorkspaces` resolves. Those counts do not wait for change-bucket counts or `DetectOverlap`.

The kernel VCS requirement already names `CompositionResolver.getVcsAdapter` and `createLazyVcsActorResolver`. The Constraints list item still starts with `` `createKernelInternals` is not exported from `@specd/core` — it is internal to the composition layer ``, and the replacement sentence sits under that label. A list-item `modified` keeps the matched label and writes `content` as the item body. `kernel.ts` has no `createKernelInternals` helper.

`docs/core/ports.md`, `docs/core/overview.md`, `docs/guide/cli.md`, and `docs/cli/cli-reference.md` match the factory and the command output.

## Proposed solution

Extend `GetProjectSummary`. Do not add a second project-status use case.

Add `includeOverlaps?: boolean`, default false.

- When true, call `DetectOverlap.execute()` with no name filter and set `overlaps` to that `OverlapReport`.
- When false or omitted, do not call `DetectOverlap` and omit the `overlaps` key.
- Count fields stay on the existing repository `count*` path.
- Do not add a cache. Spec validation cache stays in `ValidateSpecs`.

Wire `DetectOverlap` on `GetProjectSummaryDeps` the same way `getSpecsHealth` is wired: `resolveGetProjectSummaryDeps` calls `createDetectOverlap(resolveDetectOverlapDeps(resolver))`. `createKernel` can keep `createGetProjectSummary(resolveGetProjectSummaryDeps(resolver))`.

`buildProjectStatusSnapshot` forwards `includeOverlaps` to `GetProjectSummary.execute` the same way it forwards `includeChanges` and `includeSpecsHealth`. Hosts keep reading `overlaps` from `summary`. `project status` always passes `includeOverlaps: true` with those other summary flags. There is no CLI flag to turn overlaps off.

API, client, and UI stay out of this change.

Audit follow-up already in the deltas and code:

- `specRepo.count()` starts from the `ListWorkspaces` result and does not wait for change-bucket counts or `DetectOverlap`.
- The kernel VCS requirement names `CompositionResolver.getVcsAdapter` and `getActorResolver` / `createLazyVcsActorResolver`. `kernel.ts` stays unchanged.
- The `project status` help schema shows `overlaps` as present and `approvals` as `specEnabled` / `signoffEnabled`.
- `docs/core/ports.md`, `docs/core/overview.md`, `docs/guide/cli.md`, and the workspace bullet in `docs/cli/cli-reference.md` match the factory and the command output.

Remaining spec edit: replace the Constraints list item. Remove the old label and insert one bullet: `` `createKernel` does not export `createKernelInternals`. Project VCS and actor resolution stay on `CompositionResolver`. ``

## Specs affected

### New specs

None.

### Modified specs

- `core:get-project-summary`: add the `includeOverlaps` enrichment, the absent-key rule when the flag is off, and factory wiring for `DetectOverlap`. `specsHealth` stays project-wide `GetSpecsHealth.execute({})`. Per-workspace `specRepo.count()` starts once `ListWorkspaces` resolves and does not wait on change-bucket counts or `DetectOverlap`.
  - Depends on (added): `core:spec-overlap`
  - Depends on (removed): none
- `cli:project-status`: `project status` keeps reading the summary from `buildProjectStatusSnapshot` and always requests `includeOverlaps: true`. JSON and TOON copy `overlaps` to the command root. The help schema shows that field as present and names `approvals.specEnabled` and `approvals.signoffEnabled`.
  - Depends on (added): `core:get-project-summary`
  - Depends on (removed): none
- `sdk:build-project-status-snapshot`: `BuildProjectStatusSnapshotOptions` gains `includeOverlaps?: boolean` (default false) and forwards it on the `getProjectSummary.execute` input. The report stays on `summary`; the snapshot does not copy it to a sibling field.
  - Depends on (added): none
  - Depends on (removed): none
- `core:kernel`: record every key `createKernel` already returns. Do not add a kernel member and do not edit `kernel.ts`. The mapping tables are missing these mounted keys:
  - `changes.archiveRepo` — `ArchiveRepository` — `core:archive-repository-port`
  - `changes.getDraft` — `GetDraft` — `core:get-draft`
  - `changes.getDiscarded` — `GetDiscarded` — `core:get-discarded`
  - `changes.invalidate` — `InvalidateChange` — `core:invalidate-change`
  - `changes.updateImplementationTracking` — `UpdateImplementationTracking` — `core:update-implementation-tracking`
  - `changes.refreshImplementationTracking` — `RefreshImplementationTracking` — `core:refresh-implementation-tracking`
  - `changes.getImplementationReview` — `GetImplementationReview` — `core:get-implementation-review`
  - `changes.preview` — `PreviewSpec` — `core:preview-spec`
  - `specs.getOutline` — `GetSpecOutline` — `core:get-spec-outline`
  - `specs.validateSchema` — `ValidateSchema` — `core:validate-schema`
  - `specs.resolve` — `ResolveSchema` — `core:resolve-schema`. The table currently names this path `specs.resolveSchema`. The interface key is `resolve`.
  - `project.getProjectSummary` — `GetProjectSummary` — `core:get-project-summary` (already added in this change)
  - `project.resolveContextSpecs` — `ResolveContextSpecs` — `core:resolve-context-specs`
  - Root fields that are not use cases: `registry` (`CompositionRegistryView`) and `schemas` (`SchemaRegistry`). The "exactly three top-level keys" scenario must name these two as well as `changes`, `specs`, and `project`.
  - The VCS requirement names `CompositionResolver.getVcsAdapter` and `createLazyVcsActorResolver`. The Constraints item is replaced, not appended: `` `createKernel` does not export `createKernelInternals`. Project VCS and actor resolution stay on `CompositionResolver`. ``
  - Depends on (added): `core:get-project-summary`, `core:archive-repository-port`, `core:get-draft`, `core:get-discarded`, `core:invalidate-change`, `core:update-implementation-tracking`, `core:refresh-implementation-tracking`, `core:get-implementation-review`, `core:preview-spec`, `core:get-spec-outline`, `core:validate-schema`, `core:resolve-context-specs`, `core:actor-resolver`
  - Depends on (removed): none

## Impact

Minimum code touch:

- `packages/core/src/application/use-cases/get-project-summary.ts` — `GetProjectSummaryInput`, `GetProjectSummaryResult`, constructor, and `execute`.
- `packages/core/src/composition/use-cases/get-project-summary.ts` — `GetProjectSummaryDeps`, `resolveGetProjectSummaryDeps`, the normalized constructor call, and `isGetProjectSummaryDeps`.
- `packages/sdk/src/orchestration/build-project-status-snapshot.ts` — `BuildProjectStatusSnapshotOptions.includeOverlaps` and the `summaryInput` passed to `getProjectSummary.execute`.
- `packages/cli/src/commands/project/status.ts` — pass `includeOverlaps: true` into `buildProjectStatusSnapshot` and render `summary.overlaps` in text and json/toon.
- Matching tests under `packages/core/test/`, `packages/sdk/test/orchestration/`, and `packages/cli/test/commands/project/`.

`createGetProjectSummary` is riskLevel HIGH. Dependents include `Kernel` / `createKernel` in `packages/core/src/composition/kernel.ts` and `packages/core/src/composition/kernel-builder.ts`, plus composition tests. The config-based factory signature stays. Adding a field to `GetProjectSummaryDeps` changes the explicit-deps constructor and the deps type guard, so those callers and tests must pass `detectOverlap`.

`kernel.ts` already mounts every key listed above, including `project.getProjectSummary` and `project.resolveContextSpecs`. This change records those rows in `core:kernel` and does not edit `kernel.ts`. `core:composition` stays out of the change. It is already in the active change `implementation-snapshot`.

`DetectOverlap` and `GetSpecsHealth` semantics stay as they are. `Change` is a CRITICAL hotspot and is not modified. `DetectOverlap` already loads active changes through `ChangeRepository`.

`packages/sdk/src/orchestration/build-project-status-snapshot.ts` is the only producer of `summary` for `project status`. Workspace `sdk` is owned. The change is the option forward only. Graph loading, approvals, and hotspot behaviour stay as they are.

`packages/cli/src/commands/project/dashboard.ts` also calls `buildProjectStatusSnapshot` with `includeSpecsHealth: true`. Dashboard is out of scope.

That audit follow-up is already in those files. This pass does not edit them again, and it does not edit `kernel.ts`. The remaining change is the `core:kernel` Constraints list item.

## Technical context

Agreed constraints:

- One aggregate: extend `GetProjectSummary`. No "shell status" use case.
- `includeOverlaps` is additive and defaults to false.
- True: `DetectOverlap` over active changes, no name filter, return `OverlapReport`.
- False or omitted: do not call `DetectOverlap`, and omit the key (same absent-key style as `active`, `drafts`, and `specsHealth`, not `null`).
- With the flag true and no overlap, the report is present and empty (`entries` empty, `hasOverlap` false). With the flag false, the key is absent.
- Unflagged counts stay on `ChangeRepository.count` / `countDrafts` / `countDiscarded` and `ArchiveRepository.count`.
- The bell is `specsHealth`. A spec inside an active change still counts. Do not add `failedClosedSpecs`, do not filter by `activeSpecIds`, and do not treat health as "specs outside changes". Overlaps are a separate signal.
- Verify scenarios for `core:get-project-summary`: overlap present when there is overlap; empty or absent according to the flag when there is no overlap; `specsHealth` still includes a spec that is in an active change's `specIds`; no flags means no `active`, `drafts`, `specsHealth`, or `overlaps`.
- Workspaces `core`, `cli`, and `sdk` are owned. API, client, and UI stay a follow-up on `feat/user-interface` after merge.
- The CLI keeps using the SDK. `project status` does not call `GetProjectSummary` or `DetectOverlap` beside the snapshot. `buildProjectStatusSnapshot` forwards `includeOverlaps`, default false. `project status` always passes `true`, with no new CLI flag.
- The overlap use case lives in `core:spec-overlap`. There is no `core:detect-overlap` spec.
- Hosts use `@specd/sdk` for bootstrap. `project status` already uses `openSpecdHost` and also calls `kernel.project.listWorkspaces` and `kernel.project.getProjectContext` on that host.

Ruled out:

- A second use case.
- A new cache beside `ValidateSpecs`.
- Folding overlaps into `specsHealth`.
- Putting `core:composition` in this change.
- Adding a new kernel member or editing `kernel.ts`.
- Changing `cli:project-dashboard` in this change.
- A second `GetProjectSummary` or `DetectOverlap` call from `project status` beside the snapshot.
- Editing `kernel.ts` to rename VCS helpers. The code already uses `CompositionResolver`.
- Waiting for change counts before spec counts. Spec counts need the workspace list only.

## Open questions

None. The snapshot forwards `includeOverlaps`, and `project status` always requests it.
