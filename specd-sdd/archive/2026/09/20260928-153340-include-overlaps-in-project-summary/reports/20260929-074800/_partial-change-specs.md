# Change specs

Read-only audit of the four specs in `include-overlaps-in-project-summary`. Merged spec and scenario text came from `changes context` (verifying, full profile). Implementation was checked against `createKernel`, `GetProjectSummary.execute`, `buildProjectStatusSnapshot`, and `registerProjectStatus`.

Targeted tests after that check:

- `@specd/core`: `get-project-summary` application + composition, plus `barrel-kernel-coverage` — 23 passed
- `@specd/sdk`: `build-project-status-snapshot` — 10 passed
- `@specd/cli`: `project status` — 21 passed

## core:get-project-summary

### Requirements summary

Count fields always come from repository `count*` surfaces. `includeOverlaps === true` calls `DetectOverlap.execute()` with no name and returns that `OverlapReport`, including an empty report. Omitted or `false` does not call `DetectOverlap` and omits `overlaps` (never `null`). `includeSpecsHealth` still calls `GetSpecsHealth.execute({})` with no active-change filter. The config factory wires `detectOverlap` through `resolveGetProjectSummaryDeps`.

### Implementation status

Matches. `packages/core/src/application/use-cases/get-project-summary.ts` gates the call with `includeOverlaps === true` inside the existing `Promise.all` and spreads `{ overlaps }` only when the report is defined. `packages/core/src/composition/use-cases/get-project-summary.ts` sets `detectOverlap: createDetectOverlap(resolveDetectOverlapDeps(resolver))`.

### Discrepancies

None.

### Test coverage

Application tests cover the unfiltered report, the empty report, the omitted and `false` paths, and health left unfiltered. Composition tests cover the config factory and a missing `detectOverlap`.

### Missing tests

None for this spec's overlap requirements.

### Summary counts

- requirements checked: overlap, health, count, and factory requirements in the merged spec
- scenarios checked: the merged `GetProjectSummary` scenario set, including the three overlap scenarios
- discrepancies: 0

## cli:project-status

### Requirements summary

`project status` always asks the snapshot for changes, specs health, and overlaps. JSON and TOON copy `snapshot.summary.overlaps` to the command root. Text prints nothing when `overlaps` is absent, `overlaps: (none)` when `hasOverlap` is false, and `overlaps:` plus `  <specId>: <name> [<state>]` lines otherwise. The command does not call `GetProjectSummary` or `DetectOverlap` beside `buildProjectStatusSnapshot`.

### Implementation status

Matches. `packages/cli/src/commands/project/status.ts` passes `includeOverlaps: true` and maps the report to a plain `{ hasOverlap, entries }` object before JSON, TOON, and text.

### Discrepancies

None.

### Test coverage

`packages/cli/test/commands/project/status.spec.ts` covers text, JSON, TOON, the empty report, and the snapshot option set.

### Missing tests

None for the overlap output contract.

### Summary counts

- scenarios checked: merged `project status` scenarios, including the overlap and `--graph` scenarios
- discrepancies: 0

## sdk:build-project-status-snapshot

### Requirements summary

`includeOverlaps` is forwarded only when strictly true. The report stays on `summary`. Graph health receives `config`, `provider`, `codeGraphVersion`, and `workspaces`, and does not receive `assertUnlocked`.

### Implementation status

Matches. `packages/sdk/src/orchestration/build-project-status-snapshot.ts` builds the summary input with a conditional spread and calls `getGraphHealth.execute` with those four fields.

### Discrepancies

None.

### Test coverage

`packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts` covers flag forwarding, overlaps remaining under `summary`, and the count-only path.

### Missing tests

The graph-health assertion uses `objectContaining` and does not forbid an extra `assertUnlocked` field. The implementation does not pass that field.

### Summary counts

- scenarios checked: merged snapshot scenarios, including `includeOverlaps` forwarding
- discrepancies: 0

## core:kernel

### Requirements summary

The mapping tables name every key `createKernel` returns under `changes`, `specs`, and `project`. The specs resolve path is `specs.resolve`. Root keys are `registry`, `schemas`, `changes`, `specs`, and `project`. This change does not add a kernel member and does not edit `kernel.ts`.

### Implementation status

Matches. Compared `export interface Kernel` in `packages/core/src/composition/kernel.ts` with the merged mapping tables: 33 `changes` keys, 24 `specs` keys, 7 `project` keys. No missing keys, no extra table paths, no `resolveSchema`. `kernel.project.getProjectSummary` is wired. `registry` and `schemas` are the only extra root keys and are not use cases.

### Discrepancies

None. The previous failure of "No undocumented entries in the kernel" is closed by the table update.

### Test coverage

`barrel-kernel-coverage.spec.ts` lists `project.getProjectSummary` and `project.resolveContextSpecs`. There is no automated test that enumerates every kernel key against the markdown table. That check was done by comparing the interface to the merged spec.

### Missing tests

No executable test locks the full mapping table to `Kernel`. The scenario is satisfied by the current source and the merged spec.

### Summary counts

- scenarios checked: domain-group scenarios, mapping scenarios, and "No undocumented entries in the kernel"
- discrepancies: 0

## Aggregate

- specs: 4
- discrepancies in the overlap and kernel-map check: 0

## Addendum

A later pass of the same four specs recorded four further discrepancies. They are in the compiled report:

- Low: `specRepo.count()` waits for the first `Promise.all`.
- Low: `project status --help` schema marks `overlaps` optional and names `approvals.spec` / `approvals.signoff`.
- Low: `docs/cli/cli-reference.md` omits `isExternal` and `codeRoot` on workspaces.
- Medium: base `core:kernel` still documents `createKernelInternals` and `createVcsActorResolver(config.projectRoot)`. The code uses `CompositionResolver.getVcsAdapter` and `createLazyVcsActorResolver`.
