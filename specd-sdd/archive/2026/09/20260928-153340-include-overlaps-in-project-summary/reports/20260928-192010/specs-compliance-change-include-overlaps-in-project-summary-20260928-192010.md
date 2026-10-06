# Spec compliance — include-overlaps-in-project-summary

Mode: change
Timestamp: 20260928-192010
Change: include-overlaps-in-project-summary
State at audit: verifying

## Scope

Change specs:

- core:get-project-summary
- cli:project-status
- sdk:build-project-status-snapshot

Depth-1 dependencies:

- core:list-workspaces, core:list-changes, core:list-drafts, core:list-discarded, core:list-archived
- core:kernel, core:composition-resolver, core:get-specs-health, core:count-tasks, core:spec-overlap
- core:get-project-context, sdk:host-context, code-graph:get-graph-health

Relevant project-wide specs:

- default:\_global/architecture
- default:\_global/conventions
- default:\_global/testing
- default:\_global/eslint
- default:\_global/docs

## Aggregate

| Batch        | Specs               | Discrepancies / findings                                 |
| ------------ | ------------------- | -------------------------------------------------------- |
| Change specs | 3 (33 requirements) | 3 discrepancies (2 medium, 1 low), 11 missing-test notes |
| Dependencies | 13                  | 0 contradictions                                         |
| Globals      | 5                   | 3 findings (2 major docs, 1 minor testing)               |

Highest-severity items:

1. Major — `docs/core/use-cases.md` still documents the pre-overlap `GetProjectSummary` contract.
2. Major — `docs/cli/cli-reference.md` and `docs/cli/project.md` do not describe `project status` overlaps. Command help was updated.
3. Medium — `cli:project-status` still says spec counts come from a direct `getProjectSummary.execute()` call, and also says the command must not call `GetProjectSummary` beside the snapshot. The handler only calls `buildProjectStatusSnapshot`.
4. Medium — the spec says output includes `summary.overlaps`. json/toon put `overlaps` on the command root, matching `specsHealth`.
5. Low — snapshot spec still names `assertUnlocked: false`, which `GetGraphHealth` does not accept. Pre-existing relative to this overlap change.
6. Minor — new overlap test titles are not `given …, when …, then …`.

## Detailed Findings

# Partial: change specs

# Partial audit: change specs

Change: `include-overlaps-in-project-summary`
Scope: merged spec-preview only (`core:get-project-summary`, `cli:project-status`, `sdk:build-project-status-snapshot`).
Graph: `stale: false` at audit time (`lastIndexedAt` 2026-09-28T17:20:49.977Z).

Checked design constraints (not assumed to excuse a spec miss):

- `includeOverlaps` default / `false` omits the `overlaps` key. Implemented in `GetProjectSummary.execute` (`includeOverlaps === true` only) and covered by `packages/core/test/application/use-cases/get-project-summary.spec.ts` (`execute()` and `execute({ includeOverlaps: false })` both `not.toHaveProperty('overlaps')` and do not call `DetectOverlap`).
- `includeOverlaps: true` with an empty report still returns `overlaps`. Implemented (`overlaps` is spread whenever the flag is true and `DetectOverlap.execute()` resolves). Not asserted by a test (see Missing Tests).
- `specsHealth` is not filtered by active changes. Implemented: health is `GetSpecsHealth.execute({})` assigned through unchanged. The dedicated test does not build the active-change fixture the scenario requires.
- Snapshot does not call `DetectOverlap`. `packages/sdk/src/orchestration/build-project-status-snapshot.ts` has no `DetectOverlap` import or call. Overlap runs only inside `GetProjectSummary` when the flag is forwarded.
- `project status` always passes `includeOverlaps: true` with `includeChanges` and `includeSpecsHealth`, and does not call `GetProjectSummary` or `DetectOverlap` beside the snapshot. `packages/cli/src/commands/project/status.ts` lines 68–74. No imports of those use cases.
- Dashboard is unchanged with respect to overlaps. `packages/cli/src/commands/project/dashboard.ts` calls `buildProjectStatusSnapshot` with `includeGraph`, `includeChanges`, and `includeSpecsHealth` only. It does not pass `includeOverlaps`, render overlaps, or call `GetProjectSummary` / `DetectOverlap`.

---

## core:get-project-summary

### Requirements Summary

| #   | Requirement                                                                   | Verdict                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Returns count-only project summary                                            | Met. Counts always returned. Enrichment keys, including `overlaps`, omitted unless the matching flag is true.                                                                                                                                                            |
| 2   | Optional enrichment input flags                                               | Met. `includeChanges`, `includeSpecsHealth`, `includeOverlaps` default false via `=== true`. All false/omitted skips list materialization, `GetSpecsHealth`, and `DetectOverlap`.                                                                                        |
| 3   | Optional active and draft change listings with tasks                          | Met. `ListChanges` / `ListDrafts`, then `ChangeRepository.get` / `getDraft` and `CountTasks`. Empty buckets stay `[]`. Discarded/archived are not listed.                                                                                                                |
| 4   | Optional specs health enrichment                                              | Met. `GetSpecsHealth.execute({})` passthrough. No rewrite, no `activeSpecIds` filter, no `failedClosedSpecs`.                                                                                                                                                            |
| 5   | Optional active-change overlap enrichment                                     | Met in code. `DetectOverlap.execute()` with no argument (no `name`). Empty report still attached. Flag false/omitted omits the key and skips the call. Overlaps stay separate from `specsHealth`.                                                                        |
| 6   | Orchestrates existing list use cases                                          | Met. Counts use `count` / `countDrafts` / `countDiscarded` / `ArchiveRepository.count()`.                                                                                                                                                                                |
| 7   | Orchestrates workspace spec counting                                          | Met. `ListWorkspaces` then `specRepo.count()` in workspace order. `workspaceCount` is that list length.                                                                                                                                                                  |
| 8   | Parallelizes independent queries                                              | Met. Bucket counts, archive count, workspace list, and optional enrichments share one `Promise.all`. Per-workspace `specRepo.count()` is a second `Promise.all` after that. Spec allows spec counts to run in parallel; it does not require them inside the first batch. |
| 9   | Constructor accepts orchestration dependencies                                | Met. Eight constructor args include `DetectOverlap`. No repository construction and no `specd.yaml` read.                                                                                                                                                                |
| 10  | Factory wires from SpecdConfig                                                | Met. Config overload builds a resolver and delegates.                                                                                                                                                                                                                    |
| 11  | Config-based summary wiring preserves complete repository bootstrap semantics | Met by construction: list/count deps come from `resolve*Deps(resolver)` and `resolver.getChangeRepository()` / `getArchiveRepository()` / `getListWorkspaces()`. No alternate bootstrap in this factory.                                                                 |
| 12  | Kernel exposes use case                                                       | Met. `createKernel` assigns `project.getProjectSummary` from `createGetProjectSummary(resolveGetProjectSummaryDeps(resolver))`.                                                                                                                                          |
| 13  | Config-based factory delegates through resolveGetProjectSummaryDeps           | Met. Resolved keys match the spec, including `detectOverlap: createDetectOverlap(resolveDetectOverlapDeps(resolver))`. Count path still uses repository `count*` methods.                                                                                                |

### Implementation Status

`packages/core/src/application/use-cases/get-project-summary.ts`

- Input flags and result fields match the spec, including optional `overlaps?: OverlapReport`.
- `includeOverlaps` calls `this._detectOverlap.execute()` with zero arguments. `DetectOverlap.execute` treats a missing `name` as “every active change” (`packages/core/src/application/use-cases/detect-overlap.ts`).
- The `overlaps` key is added only when `includeOverlaps && overlaps !== undefined`. An empty `OverlapReport` is an object, so the key remains. `hasOverlap` is derived from `entries.length` (`OverlapReport`).
- Health and overlap are independent branches. Nothing reads active `specIds` while building `specsHealth`.

`packages/core/src/composition/use-cases/get-project-summary.ts`

- `GetProjectSummaryDeps.detectOverlap` is required. The type guard rejects a deps object that omits it.
- Config form: `createCompositionResolver` → `resolveGetProjectSummaryDeps` → `createGetProjectSummary(deps)`.
- `detectOverlap` is `createDetectOverlap(resolveDetectOverlapDeps(resolver))`, not a second implementation.

`packages/core/src/composition/kernel.ts` exposes `kernel.project.getProjectSummary`.

### Discrepancies

None. Overlap flag, empty-report retention, health passthrough, and composition wiring match the merged spec.

### Test Coverage

Application tests (`packages/core/test/application/use-cases/get-project-summary.spec.ts`):

- Count-only result equality omits `active`, `drafts`, `specsHealth`, and `overlaps`.
- `includeOverlaps: true` expects `detectOverlap.execute` called with no args and `result.overlaps` to be the same non-empty report (`hasOverlap === true`).
- Omitted flag and `includeOverlaps: false` omit the key and do not call `DetectOverlap`.
- `includeSpecsHealth: true` expects `specsHealth` to equal the mocked `GetSpecsHealth` result and does not call list/count-tasks.
- Combined `includeSpecsHealth` + `includeOverlaps` expects `getSpecsHealth.execute({})` and `specsHealth` equality. That would fail if the use case rewrote the health object.
- Listing, count, and concurrency scenarios for the pre-overlap requirements are present.

Composition tests (`packages/core/test/composition/use-cases/get-project-summary.spec.ts`):

- Config factory returns `GetProjectSummary` and a count-only summary.
- Explicit deps including `detectOverlap` are accepted. Omitting `detectOverlap` throws `InvalidCompositionFactoryArgumentsError`.
- `resolveGetProjectSummaryDeps` key set includes `detectOverlap` plus the other required deps.

Kernel exposure is asserted in `packages/core/test/composition/kernel-get-config.spec.ts` (`kernel.project.getProjectSummary` instanceof `GetProjectSummary`), outside the four files named in the audit request.

### Missing Tests

1. **Empty overlap report still returned** (verify: “includeOverlaps with no overlap returns an empty report”). No test calls `execute({ includeOverlaps: true })` against `new OverlapReport([])` and asserts the key is present, `entries` is empty, and `hasOverlap` is `false`. The non-empty test replaces the default empty mock. The health test calls `includeOverlaps: true` with the default empty mock but never reads `result.overlaps`.
2. **specsHealth kept when the spec is in an active change** is only a passthrough assertion. The scenario GIVEN (an active change whose `specIds` include `core:get-project-summary`) is never built. A filter that dropped health rows present in active changes would not be exercised, because `listChanges` stays on its empty default and the use case is not given those ids.
3. **`detectOverlap` comes from `createDetectOverlap(resolveDetectOverlapDeps(resolver))`.** The composition test checks that the key exists. It does not check the instance type or that the helper used `createDetectOverlap` rather than another constructor.

No test asserts the absence of a `failedClosedSpecs` sibling on the result. `specsHealth` equality covers mutation of the health object only.

### Spec Dependency Chain

Direct dependencies declared on the merged spec:

- `core:list-workspaces` — per-workspace `SpecRepository.count()`
- `core:list-changes` — active listing when `includeChanges`
- `core:list-drafts` — draft listing when `includeChanges`
- `core:list-discarded` — discarded count semantics
- `core:list-archived` — archived count semantics (`ArchiveRepository.count()` used)
- `core:count-tasks` — task totals when `includeChanges`
- `core:get-specs-health` — `GetSpecsHealth.execute({})` passthrough
- `core:spec-overlap` — `DetectOverlap` / `OverlapReport`; no-name `execute()` matches optional `DetectOverlapInput.name`
- `core:kernel` — `kernel.project.getProjectSummary`
- `core:composition-resolver` — resolver-backed factory deps

No contradiction found between this spec’s overlap rules and `DetectOverlap`’s optional `name` filter. Depth-1 dependency specs were not fully re-audited.

### Summary counts (requirements checked, discrepancies, missing tests)

- Requirements checked: 13
- Discrepancies: 0
- Missing tests: 3

---

## cli:project-status

### Requirements Summary

| #   | Requirement                                       | Verdict                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | project status command exists                     | Met. `registerProjectStatus` registers `status`.                                                                                                                                                                                                                                                                                                                       |
| 2   | includes workspace information                    | Met. `kernel.project.listWorkspaces.execute()`; text and json/toon include name, prefix, ownership, `isExternal`, `codeRoot`.                                                                                                                                                                                                                                          |
| 3   | includes spec counts                              | Partially aligned. Totals come from `snapshot.summary.specsByWorkspace`. The handler does not call `SpecRepository.count()` or `ListWorkspaces` for counting. It also does not call `getProjectSummary.execute()` itself. See discrepancy D1.                                                                                                                          |
| 4   | includes change counts                            | Met. Counts and `active` / `drafts` listings come from the snapshot summary. Snapshot is always requested with `includeChanges: true`. No direct list-use-case calls.                                                                                                                                                                                                  |
| 5   | includes specs health (always)                    | Met. `includeSpecsHealth: true`. Text uses `ok` / `failed` / `warning`. json/toon emit the health object at the command root (`specsHealth`), which is the same presenter pattern as overlaps.                                                                                                                                                                         |
| 6   | includes active-change overlaps (always)          | Behavior met; document path does not match the literal spec string. Always `includeOverlaps: true`. No `GetProjectSummary` or `DetectOverlap` beside the snapshot. Text lists `specId` and change names (and also state). json/toon emit a plain `{ hasOverlap, entries: [{ specId, changes: [{ name, state }] }] }` at the command root, not under `summary`. See D2. |
| 7   | includes approval gates                           | Met via `snapshot.approvals`.                                                                                                                                                                                                                                                                                                                                          |
| 8   | includes graph freshness (always)                 | Met. Snapshot options always include `includeGraph: true`, `includeChanges: true`, `includeSpecsHealth: true`, `includeOverlaps: true`. Null `graphHealth` becomes null freshness fields (`never indexed` / `unknown` in text).                                                                                                                                        |
| 9   | supports --graph flag                             | Met. Same snapshot call with `includeHotspots: opts.graph`. Extended file/symbol/hotspot fields render in the handler.                                                                                                                                                                                                                                                 |
| 10  | includes config flags (always)                    | Met. `llmOptimizedContext` plus both approval flags.                                                                                                                                                                                                                                                                                                                   |
| 11  | supports --context flag                           | Met. `GetProjectContext.execute({})`, then `execute({ llmOptimizedContext: false })` when optimized context is fresh. No inline `CompileContextConfig`.                                                                                                                                                                                                                |
| 12  | Optimization warning signal                       | Met. Context warnings, including `stale-optimization`, are written to stderr.                                                                                                                                                                                                                                                                                          |
| 13  | defaults to text output                           | Met. `parseFormat` default `text`.                                                                                                                                                                                                                                                                                                                                     |
| 14  | supports json and toon formats                    | Met. Non-text uses `output(..., fmt)` with one object.                                                                                                                                                                                                                                                                                                                 |
| 15  | SDK host bootstrap                                | Met. `openSpecdHost` from `@specd/sdk`.                                                                                                                                                                                                                                                                                                                                |
| 16  | No direct repository bootstrap in command handler | Met. No `ChangeRepository` or `SpecRepository` construction.                                                                                                                                                                                                                                                                                                           |

### Implementation Status

`packages/cli/src/commands/project/status.ts`

- One snapshot call for every invocation, including `--graph` (only `includeHotspots` changes):

```68:74:packages/cli/src/commands/project/status.ts
        const snapshot = await buildProjectStatusSnapshot(host, {
          includeGraph: true,
          includeHotspots: opts.graph ?? false,
          includeChanges: true,
          includeSpecsHealth: true,
          includeOverlaps: true,
        })
```

- Overlaps are read from `snapshot.summary.overlaps` and copied to a plain object. json/toon place that object on the command root as `overlaps`, next to root `specsHealth`, `active`, and `drafts`. There is no `summary` key in the command payload. Help text documents the same root shape (`overlaps?: { entries, hasOverlap }`).
- The projection keeps the public `OverlapReport` / `OverlapEntry` / `OverlapChange` fields (`hasOverlap`, `entries[].specId`, `entries[].changes[].name`, `entries[].changes[].state`). It does not drop a field those types expose. Projecting to a plain object is required for JSON: class getters are not own enumerable properties.
- Text: `overlaps: (none)` when `hasOverlap` is false; otherwise one line per entry `specId: name [state], ...`.
- Empty report is still rendered when the summary object is present. The key is omitted only when `summary.overlaps` is `undefined`.
- Handler does not reference `GetProjectSummary` or `DetectOverlap`.

Dashboard (`packages/cli/src/commands/project/dashboard.ts`) does not request or print overlaps. Its snapshot options remain `includeGraph`, `includeChanges`, `includeSpecsHealth`.

### Discrepancies

#### D1 — Medium — command must call `getProjectSummary.execute()` and must not call it

**Spec.** “includes spec counts” says counts are obtained via `kernel.project.getProjectSummary.execute()`, and the verify scenario repeats “THEN it calls `kernel.project.getProjectSummary.execute()`”. “includes active-change overlaps” says the command MUST NOT call `GetProjectSummary` or `DetectOverlap` beside the snapshot, and overlaps come from `snapshot.summary`. “includes change counts” already allows `buildProjectStatusSnapshot` / `GetProjectSummary`.

**Code.** The handler only calls `buildProjectStatusSnapshot`. The snapshot is what calls `getProjectSummary.execute`. Tests assert the snapshot options, not a direct `getProjectSummary` call (`status.spec.ts` “obtains change and spec counts via getProjectSummary” still expects `buildProjectStatusSnapshot`).

**Both sides.** The overlap requirement and the change-count requirement describe the implementation that exists. The spec-count requirement and its verify scenario still describe an older direct call. Updating the spec-count wording to “via `buildProjectStatusSnapshot`” would remove the contradiction. Changing the handler to also call `GetProjectSummary` would violate the overlap requirement.

#### D2 — Medium — `summary.overlaps` versus command-root `overlaps`

**Spec.** “Output MUST include `summary.overlaps` (`entries` and `hasOverlap`).” json/toon “MUST keep the structured `OverlapReport` fields from `summary.overlaps`.” Verify: output includes `summary.overlaps` with `hasOverlap` true and the shared `specId`. The same spec says include `summary.specsHealth` in the output.

**Code and tests.** json/toon do not have a `summary` object. They set root `overlaps` (and root `specsHealth`). `status.spec.ts` “copies overlaps onto the JSON root and omits them when absent” expects `parsed.overlaps`. The JSON health test expects `parsed.specsHealth`. Help text matches the root shape.

**Judgment.** This is a real path discrepancy if `summary.overlaps` means a nested command field. It is not a behavioral miss of the overlap payload: `entries` and `hasOverlap` are present, the empty report is kept when the summary has one, text lists spec id and change names, and the handler reads `snapshot.summary.overlaps` exactly as `buildProjectStatusSnapshot` is specified to expose it (`sdk` result-shape rule: hosts read enrichment from `summary`, and the snapshot must not duplicate those fields on its own root).

The known design intent matches the code and the existing `specsHealth` presenter: copy `snapshot.summary.overlaps` onto the command root as `overlaps`. That intent does not make the verify sentence true as written. A consumer that parses `output.summary.overlaps` will not find it. The spec text should say the command root field `overlaps` is copied from `snapshot.summary.overlaps`, the same way `specsHealth` is copied from `snapshot.summary.specsHealth`. Leaving the verify scenario unchanged would keep a false failing condition against the intended presenter.

### Test Coverage

`packages/cli/test/commands/project/status.spec.ts`

- Default run expects snapshot options `{ includeGraph: true, includeHotspots: false, includeChanges: true, includeSpecsHealth: true, includeOverlaps: true }` and prints change/spec counts.
- Text and JSON cover listings and specs health, including `ok` / `failed` / `warning` versus structured `passed`.
- Text empty report expects `overlaps: (none)`.
- Text populated report expects `core:get-project-summary: alpha [designing], beta [implementing]`.
- JSON populated report expects root `overlaps` with `hasOverlap`, `specId`, and change `name` / `state`.
- Graph-null text, `--graph` file/symbol lines, context execute args, archived json/toon, and host bootstrap are covered for the older requirements.
- No test imports or spies `GetProjectSummary` or `DetectOverlap`. Absence is by source inspection.

### Missing Tests

1. **JSON (and TOON) empty overlap report.** No test feeds `new OverlapReport([])` through `--format json` or `--format toon` and asserts `overlaps: { hasOverlap: false, entries: [] }`. Text `(none)` does not show those fields.
2. **Omit when absent.** The test titled “copies overlaps onto the JSON root and omits them when absent” only asserts the populated object. It never runs a summary without `overlaps` or expects the key to be missing.
3. **TOON structured overlaps.** `--format toon` is tested for `archived: 9` only. The spec requires json and toon to keep `OverlapReport` fields.
4. **`--graph` snapshot options.** “Extended graph stats with --graph flag” checks rendered file/symbol lines and does not assert `includeOverlaps: true` (or the rest of the required option object) on that invocation. The default-status test covers the shared call site only for the no-flag path.
5. **Negative call check.** No test fails if the handler also invoked `GetProjectSummary` or `DetectOverlap`. The verify scenario states that constraint explicitly.

### Spec Dependency Chain

- `core:list-workspaces` — workspace rows on the command
- `core:get-project-summary` — summary counts, health, and overlaps consumed via the snapshot, not by a direct handler call (D1)
- `core:get-project-context` — `--context` runtime overrides
- `sdk:build-project-status-snapshot` — enrichment flags and `summary.overlaps` as the source field (consistent with D2’s read path; the command then re-homes the field)
- `sdk:host-context` — `openSpecdHost`

D1 is an internal contradiction in this spec, not a break with the SDK snapshot contract. D2 conflicts with a literal reading of this spec’s output path and agrees with the SDK rule that the snapshot keeps overlaps under `summary` for hosts to read.

### Summary counts (requirements checked, discrepancies, missing tests)

- Requirements checked: 16
- Discrepancies: 2 (D1 medium, D2 medium)
- Missing tests: 5

---

## sdk:build-project-status-snapshot

### Requirements Summary

| #   | Requirement                              | Verdict                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | buildProjectStatusSnapshot orchestration | Mostly met. Forwards `includeChanges`, `includeSpecsHealth`, and `includeOverlaps` only when true. All three omitted/false calls `execute(undefined)`. Graph path uses `withOpenGraphProvider`, `createGetGraphHealth()`, config from `getConfig`, workspaces from `listWorkspaces`. Failures return null graph data without throwing. Does not call `DetectOverlap`. Does not pass `assertUnlocked: false`. See D3. |
| 2   | Result shape stability                   | Met. Options include `includeOverlaps`. Result is `summary`, `graphHealth`, `approvals`, `llmOptimizedContext`, and optional `hotspots`. Enriched fields stay on `summary`.                                                                                                                                                                                                                                          |
| 3   | No presenter formatting                  | Met. Returns a plain object.                                                                                                                                                                                                                                                                                                                                                                                         |
| 4   | No direct repository bootstrap           | Met. Summary and workspaces come from `ctx.kernel.project` queries only.                                                                                                                                                                                                                                                                                                                                             |

### Implementation Status

`packages/sdk/src/orchestration/build-project-status-snapshot.ts`

- Flag forwarding:

```56:65:packages/sdk/src/orchestration/build-project-status-snapshot.ts
  const summaryInput =
    includeChanges || includeSpecsHealth || includeOverlaps
      ? {
          ...(includeChanges ? { includeChanges: true as const } : {}),
          ...(includeSpecsHealth ? { includeSpecsHealth: true as const } : {}),
          ...(includeOverlaps ? { includeOverlaps: true as const } : {}),
        }
      : undefined

  const summary = await ctx.kernel.project.getProjectSummary.execute(summaryInput)
```

- `execute(undefined)` matches “`execute()` / `execute({})`” for the count-only path. `GetProjectSummary` treats a missing input like `{}`.
- `includeOverlaps: true` alone forwards `{ includeOverlaps: true }` and returns whatever `summary` the use case produced, including an empty report, without copying `overlaps` onto the snapshot root.
- Graph execute argument is `{ config, provider, codeGraphVersion, workspaces: [...workspaces] }`. `GetGraphHealthInput` (`packages/code-graph/src/application/use-cases/get-graph-health.ts`) has `config`, `provider`, `codeGraphVersion`, optional `workspaces`, `adapters`, and `manifestSource`. It has no `assertUnlocked` field.
- Hotspot failure nulls both `graphHealth` and `hotspots`. Provider-open failure does the same and does not throw.
- No `ChangeRepository`, `SpecRepository`, or `DetectOverlap` construction.

### Discrepancies

#### D3 — Low — `assertUnlocked: false` is specified and not callable

**Spec.** Graph health must be invoked as `getGraphHealth.execute({ config, provider, codeGraphVersion, workspaces, assertUnlocked: false })`.

**Code.** The call omits `assertUnlocked`. `GetGraphHealthInput` does not declare that property, and a repo search under `packages/code-graph` finds no `assertUnlocked` symbol.

**Both sides.** The snapshot matches the current `GetGraphHealth` API (config, provider, version, workspaces from `listWorkspaces`). The merged snapshot spec still names a parameter the callee cannot accept. Passing `assertUnlocked: false` would be excess-property drift against code-graph, not a behavior switch that exists today. This is spec drift relative to `code-graph:get-graph-health`, not an overlap-flag bug. The overlap forwarding requirement is implemented separately and is not affected.

### Test Coverage

`packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts`

- `includeGraph: false` and `{}` both expect `getProjectSummary.execute(undefined)` and no graph provider.
- `{ includeChanges: true, includeSpecsHealth: true }` is forwarded as that object.
- `{ includeOverlaps: true }` is forwarded, `result.summary.overlaps` is the same object, and the snapshot root has no `overlaps` property.
- Approvals, `llmOptimizedContext`, graph failure, and hotspot failure are covered.
- Graph-health success asserts `codeGraphVersion` via `objectContaining` only.

### Missing Tests

1. **Snapshot does not call `DetectOverlap`.** The includeOverlaps test checks the forwarded flag and the summary field. It never fails if the orchestrator also called `DetectOverlap`. Source inspection shows it cannot, because the symbol is not imported.
2. **Workspaces come from `listWorkspaces`.** The graph-health test does not assert the `workspaces` argument. `assertUnlocked` is also untested, which follows from D3 (the argument is not passed and the type has no such field).
3. **All three summary flags together.** The verify scenario builds the snapshot with `includeChanges`, `includeSpecsHealth`, and `includeOverlaps` and expects `summary.active`, `summary.drafts`, `summary.specsHealth`, and `summary.overlaps` with no root duplicates. Coverage is split: one test covers changes + health, another covers overlaps alone. No test passes all three flags in one call.

No repository-construction spy exists. The module only uses `ctx.kernel.project`.

### Spec Dependency Chain

- `sdk:host-context` — `SdkHostContext` kernel and graph provider opener
- `core:get-project-summary` — forwarded flags and `GetProjectSummaryResult` stored as `summary` (including optional `overlaps`)
- `code-graph:get-graph-health` — health execution; its input type contradicts this spec’s `assertUnlocked: false` (D3)

Overlap forwarding is consistent with `core:get-project-summary`: the snapshot does not detect overlap itself.

### Summary counts (requirements checked, discrepancies, missing tests)

- Requirements checked: 4
- Discrepancies: 1 (D3 low)
- Missing tests: 3

---

## Cross-spec totals

- Requirements checked: 33
- Discrepancies: 3 (2 medium on `cli:project-status`, 1 low on `sdk:build-project-status-snapshot`)
- Missing tests: 11

# Partial: dependencies

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

# Partial: globals

# Global conformance — include-overlaps-in-project-summary

Read-only audit of the touched implementation against the five global specs. Specs were read with `node packages/cli/dist/index.js specs show <specId> --format text`. No source or spec files were modified.

Touched files:

- `packages/core/src/application/use-cases/get-project-summary.ts`
- `packages/core/src/composition/use-cases/get-project-summary.ts`
- `packages/sdk/src/orchestration/build-project-status-snapshot.ts`
- `packages/cli/src/commands/project/status.ts`
- `packages/core/test/application/use-cases/get-project-summary.spec.ts`
- `packages/core/test/composition/use-cases/get-project-summary.spec.ts`
- `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts`
- `packages/cli/test/commands/project/status.spec.ts`

## Spec: default:\_global/architecture

### Status

conformant

### Evidence

`GetProjectSummary` stays in `application/use-cases/` and imports only domain types (`OverlapReport`, change views) and application ports or use cases (`ChangeRepository`, `ArchiveRepository`, `DetectOverlap`, `GetSpecsHealth`, `ListChanges`, `ListDrafts`, `ListWorkspaces`, `CountTasks`). It does not import `infrastructure/` or `composition/`. Overlap detection is delegated to the injected `DetectOverlap` use case (`includeOverlaps ? this._detectOverlap.execute() : Promise.resolve(undefined)`). The use case receives every dependency, including `detectOverlap`, through its constructor.

`packages/core/src/composition/use-cases/get-project-summary.ts` is the wiring site. `resolveGetProjectSummaryDeps` sets `detectOverlap: createDetectOverlap(resolveDetectOverlapDeps(resolver))`. The config overload goes through `normalizeCompositionFactoryArgs` and `createCompositionResolver`, then calls canonical `createGetProjectSummary(deps)`. No second fs-specific branch was added.

`buildProjectStatusSnapshot` forwards `includeOverlaps` into `kernel.project.getProjectSummary.execute` and keeps the report on `summary`. `registerProjectStatus` imports `buildProjectStatusSnapshot` and `openSpecdHost` from `@specd/sdk` only. It maps `OverlapReport` into text and JSON fields. That mapping is delivery presentation. The overlap decision stays in core. No new package dependency and no new YAML boundary.

## Spec: default:\_global/conventions

### Status

conformant

### Evidence

Touched modules are ESM with named exports. No `export default`, no `: any`, and no `as any`. Exported functions and methods declare return types (`execute` → `Promise<GetProjectSummaryResult>`, `createGetProjectSummary` → `GetProjectSummary`, `resolveGetProjectSummaryDeps` → `GetProjectSummaryDeps`, `buildProjectStatusSnapshot` → `Promise<BuildProjectStatusSnapshotResult>`, `registerProjectStatus` → `void`).

`exactOptionalPropertyTypes`: `overlaps` is optional on `GetProjectSummaryResult` and is added only by object spread when `includeOverlaps` is true and the report is defined. The same omit-the-key pattern is used in the SDK summary input and in the CLI JSON payload (`...(overlaps !== undefined ? { overlaps } : {})`). The new field is never assigned `null`.

No new `SpecdError` subclass and no new generic `Error` throw on this path. `GetProjectSummary.execute()` calls `DetectOverlap.execute()` with no name filter, so it does not take the `ChangeNotFoundError` branch. Source and test filenames are kebab-case. Tests live under `test/` and mirror `src/`.

## Spec: default:\_global/testing

### Status

findings

### Finding 1 — minor

New overlap behaviour titles do not use `given <state>, when <action>, then <outcome>`.

Evidence:

- `packages/core/test/application/use-cases/get-project-summary.spec.ts`: `includeOverlaps embeds the unfiltered overlap report`; `omits overlaps and skips DetectOverlap when includeOverlaps is false or absent`; `keeps a spec in specsHealth when that spec is also in an active change`
- `packages/core/test/composition/use-cases/get-project-summary.spec.ts`: `rejects a deps object that omits detectOverlap`
- `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts`: `forwards includeOverlaps and keeps the report only under summary`; `stays count-only when overlap enrichment is omitted`
- `packages/cli/test/commands/project/status.spec.ts`: `prints an empty overlap report and a populated one in text output`; `prints overlapping specs with their changes in text output`; `copies overlaps onto the JSON root and omits them when absent`

The suite is Vitest (`describe` / `it` / `expect` / `vi` from `vitest`). Files are `*.spec.ts` under each package `test/` tree, mirroring `src/`. No `toMatchSnapshot` or `toMatchInlineSnapshot`. The application overlap cases do not read the filesystem. They assert that `includeOverlaps: true` embeds the report, and that a missing or false flag omits the `overlaps` key and does not call `execute`. The SDK case asserts the flag is forwarded only onto `summary`. The CLI cases assert text `overlaps: (none)` and a populated JSON `overlaps` object.

`DetectOverlap` is a use case, not a port. The new doubles use `as unknown as DetectOverlap` and `as never`. The port-mock rule was not applied to that use-case double. Pre-existing partial `ChangeRepository` casts in the same files were not re-scored.

The CLI title `copies overlaps onto the JSON root and omits them when absent` asserts only the present case. Omission is covered by the application test `not.toHaveProperty('overlaps')`.

## Spec: default:\_global/eslint

### Status

conformant

### Evidence

No `: any`, `as any`, or `export default` in the touched source files. Exported functions and class methods have explicit return types. New and existing functions, methods, classes, and interfaces in the touched source files have JSDoc with `@param` and `@returns` where the symbol takes parameters or returns a value (`GetProjectSummary` constructor documents `detectOverlap`; `BuildProjectStatusSnapshotOptions.includeOverlaps` has a property comment). `registerProjectStatus` returns `void` and omits `@returns`. No new thrown error type was added on this path, so no new `@throws` tag is required.

Filenames under `src/` are kebab-case. `application/use-cases/get-project-summary.ts` does not import `infrastructure/` or `composition/`. Test files are JSDoc-exempt.

## Spec: default:\_global/docs

### Status

findings

### Finding 1 — major

The change alters `GetProjectSummary` inputs, the result shape, and the constructor dependency list. `docs/core/use-cases.md` still documents the previous contract. `default:_global/docs` requires that update in the same change (`Documentation stays aligned with removed/renamed template variables and list/summary contracts`, scenario naming `GetProjectSummary`).

Evidence: `docs/core/use-cases.md` (`### GetProjectSummary`) constructor ends at `getSpecsHealth` and does not take `detectOverlap`. Input text lists only `includeChanges?` and `includeSpecsHealth?`. The result interface has no `overlaps?`. The following sentence says only `active`, `drafts`, and `specsHealth` are absent when flags are omitted. Implementation adds `includeOverlaps?`, `overlaps?: OverlapReport`, and a `DetectOverlap` constructor argument, and omits `overlaps` unless the flag is true.

Command help text was updated (`packages/cli/src/commands/project/status.ts` `addHelpText` includes `overlaps?: { entries, hasOverlap }`). A new docs page is not required. The existing use-case reference still has to match the new contract. `docs/core/ports.md` already showed a different `createGetProjectSummary` deps example before this change and was not scored as a new discrepancy.

### Finding 2 — major

`project status` now always requests overlaps and prints them in text and JSON/TOON. The existing CLI references that describe that output were not updated. Help text in the command does not replace `docs/cli/`.

Evidence:

- `registerProjectStatus` calls `buildProjectStatusSnapshot` with `includeOverlaps: true`, prints `overlaps: (none)` or `overlaps:` lines, and copies `overlaps` onto the structured payload when present.
- `docs/cli/cli-reference.md` (`### project status`) lists the default output (counts, listings, specs health, graph freshness, approvals, config flags) and does not mention overlaps.
- `docs/cli/project.md` (`### specd project status`) describes schema, workspaces, spec counts, active changes, and graph freshness, and does not mention overlaps.

No new command was added, so no new `docs/cli/` page is required. `docs/guide/cli.md` only names `specd project status` at a high level and was not scored as a stale field-level contract.

## Summary counts

| Count               | Value                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Specs checked       | 5                                                                                           |
| Conformant specs    | 3 (`default:_global/architecture`, `default:_global/conventions`, `default:_global/eslint`) |
| Specs with findings | 2 (`default:_global/testing`, `default:_global/docs`)                                       |
| Findings            | 3 (1 minor, 2 major)                                                                        |

Finding list:

1. minor — testing: new overlap behaviour titles omit `given …, when …, then …`.
2. major — docs: `docs/core/use-cases.md` still documents the pre-overlap `GetProjectSummary` constructor, input, and result.
3. major — docs: `docs/cli/cli-reference.md` and `docs/cli/project.md` do not describe the overlaps output that `project status` now emits.
