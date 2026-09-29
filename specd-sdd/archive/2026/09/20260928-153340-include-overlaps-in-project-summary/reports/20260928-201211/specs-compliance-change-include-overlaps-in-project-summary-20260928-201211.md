# Specs compliance — include-overlaps-in-project-summary

Timestamp: 20260928-201211
Mode: change
Change: include-overlaps-in-project-summary

## Scope

Change specs:

- core:get-project-summary
- cli:project-status
- sdk:build-project-status-snapshot

Depth-1 dependencies checked: core:spec-overlap, core:get-specs-health, code-graph:get-graph-health, core:kernel, core:composition-resolver, sdk:host-context, core:count-tasks, core:list-workspaces, core:list-changes, core:list-drafts

Globals checked: default:\_global/architecture, default:\_global/conventions, default:\_global/testing, default:\_global/docs, default:\_global/eslint

## Aggregate

- Change-spec requirements: 33 compliant, 0 discrepancies
- Dependency contradictions: 1 (core:kernel, low, pre-existing table omission)
- Global discrepancies: 1 (docs/cli/project.md --graph wording)

## Detailed findings

# Change specs

Audit of merged change specs (via `changes spec-preview`) against the listed implementation and tests. Graph search/impact located `GetProjectSummary`, `createGetProjectSummary`, `resolveGetProjectSummaryDeps`, `buildProjectStatusSnapshot`, and `GetGraphHealthInput` before file reads. Status is implementation vs spec. The Test column says whether a test asserts the requirement.

## core:get-project-summary

### Requirements

| Requirement                                                                   | Status    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Test                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Returns count-only project summary                                            | Compliant | `GetProjectSummary.execute` always returns the six count fields. Enrichment keys are spread only when the matching flag is strictly `true` and the value is not `undefined` (`get-project-summary.ts` return object). Omitted flags therefore omit `active`, `drafts`, `specsHealth`, and `overlaps` rather than setting `null`. Count path calls repository `count*` / `ListWorkspaces` / `SpecRepository.count` only.                                                                    | Yes. `get-project-summary.spec.ts` “returns count-only summary without entities” uses exact `toEqual` on the six fields and asserts list, `CountTasks`, and `GetSpecsHealth` are not called. Overlap omission is in the includeOverlaps false/omitted test.                                                                    |
| Optional enrichment input flags                                               | Compliant | `GetProjectSummaryInput` has optional `includeChanges`, `includeSpecsHealth`, `includeOverlaps`. Each is enabled only with `=== true`, so omitted and `false` stay on the count-only path.                                                                                                                                                                                                                                                                                                 | Yes, split. Omitted `execute()` covers lists, tasks, and health. `execute()` and `execute({ includeOverlaps: false })` cover `DetectOverlap` and the absent `overlaps` key. No separate `includeSpecsHealth: false` case (same `=== true` gate).                                                                               |
| Optional active and draft change listings with tasks                          | Compliant | When `includeChanges` is true, `_buildChangeListings` calls `ListChanges.execute()` and `ListDrafts.execute()`, loads `ChangeRepository.get` / `getDraft`, then `CountTasks.execute({ change })`, and projects `name`, `state`, and `tasks.incomplete` / `tasks.total` only. Empty buckets stay `[]` because `items.map` on an empty list returns `[]` and the key is still spread. Discarded and archived changes are never listed. `includeChanges: false` skips `_buildChangeListings`. | Yes for happy path, empty arrays, and `includeChanges: false` skipping `CountTasks` and omitting keys. No fixture asserts discarded/archived names are absent (they have no list call). `includeChanges: false` does not assert `ListChanges` / `ListDrafts` were skipped; the omitted `execute()` test does.                  |
| Optional specs health enrichment                                              | Compliant | `includeSpecsHealth` calls `this._getSpecsHealth.execute({})` and assigns that result unchanged. `GetSpecsHealthInput` only has optional `workspace`; `{}` does not set it. `GetSpecsHealthResult` has `totalSpecs`, `passed`, `failed`, `warned`, `issues` and no `failedClosedSpecs`. The use case does not read active-change `specIds` or rewrite rows. Flag false/omitted skips the call and omits the key.                                                                           | Yes. “includeSpecsHealth embeds health result” checks equality. “specsHealth still includes that spec” asserts `execute({})` and that `core:get-project-summary` remains on `issues` while `includeOverlaps` is also true. Omitted path asserts `GetSpecsHealth` is not called and the count-only object has no `specsHealth`. |
| Optional active-change overlap enrichment                                     | Compliant | `includeOverlaps === true` calls `this._detectOverlap.execute()` with no argument. `DetectOverlap.execute` treats a missing `name` as the unfiltered report. The report object is spread onto `overlaps` even when `entries` is empty and `hasOverlap` is false (`OverlapReport` is always an object, so the key is not dropped). `false` or omitted does not call `DetectOverlap` and does not set `overlaps`. Overlap is not merged into `specsHealth`.                                  | Yes. Shared-spec case expects `toHaveBeenCalledWith()` (zero args) and `result.overlaps` to be that report. Empty `OverlapReport([])` expects the key present, `entries` empty, `hasOverlap` false. False and omitted expect `not.toHaveProperty('overlaps')` and `detectOverlap.execute` not called.                          |
| Orchestrates existing list use cases                                          | Compliant | `activeCount` / `draftCount` / `discardedCount` come from `ChangeRepository.count`, `countDrafts`, and `countDiscarded`. `archivedCount` comes from `ArchiveRepository.count()`. Those calls are not `.length` of list results. `ListChanges` / `ListDrafts` run only inside `_buildChangeListings`.                                                                                                                                                                                       | Yes. Separate tests for `count`, `countDrafts`, `countDiscarded`, and `archive.count()` returning 42. Count-only test asserts `ListChanges.execute` is not used to measure length.                                                                                                                                             |
| Orchestrates workspace spec counting                                          | Compliant | After `ListWorkspaces.execute()`, each `ws.specRepo.count()` runs in `Promise.all`, and `specsByWorkspace` is filled in that iteration order. `workspaceCount` is `workspaces.length`. `ListSpecs` is not a dependency.                                                                                                                                                                                                                                                                    | Yes. Count-only test expects `{ default: 3, core: 10 }` and `workspaceCount` 2. No separate three-workspace case; the same length assignment covers it.                                                                                                                                                                        |
| Parallelizes independent queries                                              | Compliant | Change-bucket counts, archive count, `ListWorkspaces`, and the optional enrichment promises share one `Promise.all`. Per-workspace spec counts are a second `Promise.all` after workspaces resolve (the spec allows that; it does not require spec counts to overlap the change counts).                                                                                                                                                                                                   | Partial. “runs independent count operations concurrently” only checks that five starts occurred and that each start precedes its own end. A serial `await` chain would still pass.                                                                                                                                             |
| Constructor accepts orchestration dependencies                                | Compliant | Constructor takes `ChangeRepository`, `ArchiveRepository`, `ListWorkspaces`, `ListChanges`, `ListDrafts`, `CountTasks`, `GetSpecsHealth`, and `DetectOverlap`. It does not construct repositories or read config. Count fields still use `count*`.                                                                                                                                                                                                                                         | Yes. Application tests construct the class with those mocks. Composition tests reject a deps object that omits `detectOverlap`.                                                                                                                                                                                                |
| Factory wires from SpecdConfig                                                | Compliant | `createGetProjectSummary(config)` normalizes args and `createGetProjectSummaryFromNormalized` builds a resolver, then `createGetProjectSummary(resolveGetProjectSummaryDeps(resolver))`.                                                                                                                                                                                                                                                                                                   | Yes. Composition test “returns a wired GetProjectSummary instance from SpecdConfig” executes the count-only path on a temp project.                                                                                                                                                                                            |
| Config-based summary wiring preserves complete repository bootstrap semantics | Compliant | Config wiring goes through `resolveGetProjectSummaryDeps`: change and archive repos from the resolver, list/count/health/overlap use cases from their `resolve*Deps` + `create*` factories. No inline fs repository bootstrap in this factory.                                                                                                                                                                                                                                             | Partial. “downstream repositories are bootstrapped using canonical wiring” only asserts `workspaceCount === 1` on an empty temp project. It does not compare artifact-type or metadata-path behavior against the downstream factories.                                                                                         |
| Kernel exposes use case                                                       | Compliant | `createKernel` sets `getProjectSummary = createGetProjectSummary(resolveGetProjectSummaryDeps(resolver))` and returns it on `kernel.project.getProjectSummary` (`kernel.ts` project namespace).                                                                                                                                                                                                                                                                                            | Yes, outside the four listed files: `packages/core/test/composition/kernel-get-config.spec.ts` expects `kernel.project.getProjectSummary` to be a `GetProjectSummary`. Not asserted in `composition/use-cases/get-project-summary.spec.ts`.                                                                                    |
| Config-based factory delegates through resolveGetProjectSummaryDeps           | Compliant | `resolveGetProjectSummaryDeps` returns `changes`, `archive`, `listWorkspaces`, `listChanges`, `listDrafts`, `countTasks`, `getSpecsHealth`, and `detectOverlap`. `detectOverlap` is `createDetectOverlap(resolveDetectOverlapDeps(resolver))`. The config overload delegates to `createGetProjectSummary(deps)`. Explicit deps construct `GetProjectSummary` directly.                                                                                                                     | Yes for the dep key set and `detectOverlap instanceof DetectOverlap`. The test does not spy `createDetectOverlap`; the call is in `resolveGetProjectSummaryDeps`.                                                                                                                                                              |

Constraints checked with the requirements above: no code-graph or context compilation imports; count-only path does not call `DetectOverlap`; enrichment flags are the only reason to list changes, validate specs, or detect overlap; no writes to config, repositories, or changes.

### Discrepancies

None.

### Missing tests

- Concurrency test does not fail if the five count calls are awaited one after another.
- Config-based bootstrap test does not show that summary counts inherit schema-driven artifact types and canonical spec metadata paths.
- No fixture proves discarded and archived names stay out of `active` / `drafts`.
- No `execute({ includeSpecsHealth: false })` case. Omitted `execute()` already covers the skip.
- `includeChanges: false` does not assert `ListChanges` / `ListDrafts` were not called.
- Listed composition spec does not assert `kernel.project.getProjectSummary` (covered by `kernel-get-config.spec.ts`).

### Summary

- requirements: 13
- compliant: 13
- partial: 0
- missing: 0
- discrepancies: 0

## cli:project-status

### Requirements

| Requirement                                       | Status    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| project status command exists                     | Compliant | `registerProjectStatus` registers `project status` and prints project root, schema, workspaces, spec totals, and change counts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Partial. Test asserts the command name is `status`, plus spec and change count lines. It does not assert `projectRoot`, schema, or workspace lines.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| includes workspace information                    | Compliant | Handler calls `kernel.project.listWorkspaces.execute()` for display. JSON rows include `name`, `prefix`, `ownership`, `codeRoot`, `isExternal`. Text includes the same fields. Counting does not use this list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | No. `listWorkspaces` is stubbed to `[]` and no test asserts prefix, ownership, `isExternal`, or `codeRoot`.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| includes spec counts                              | Compliant | Totals and per-workspace counts are reduced from `snapshot.summary.specsByWorkspace`. Handler does not call `SpecRepository.count`, does not count via `ListWorkspaces`, and does not call `getProjectSummary.execute`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Yes. “obtains change and spec counts via getProjectSummary” expects snapshot options and `kernel.project.getProjectSummary.execute` not called, and checks `specs: 12 total` plus workspace lines from the stubbed map.                                                                                                                                                                                                                                                                                                                                                  |
| includes change counts                            | Compliant | Counts come from `summary.activeCount` / `draftCount` / `discardedCount` / `archivedCount`. Snapshot is always called with `includeChanges: true`. Text and JSON include `active` and `drafts` entries with `name`, `state`, and task incomplete/total (`?? []` only if the summary key is missing). Handler does not call list use cases.                                                                                                                                                                                                                                                                                                                                                                             | Yes. Count lines, JSON `changes`, listing text (`tasks 2/5`), and JSON `active` / `drafts`. Snapshot options include `includeChanges: true`.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| includes specs health (always)                    | Compliant | Snapshot options always include `includeSpecsHealth: true`. JSON/TOON spread `summary.specsHealth` unchanged (`passed` / `failed` / `warned`). Text line is `` `${total} total · ${passed} ok · ${failed} failed · ${warned} warning` ``. Issue rows use `failed` when `issue.passed` is false and `warning` when it is true. No glyph-only health markers.                                                                                                                                                                                                                                                                                                                                                            | Yes for the summary line labels and for JSON `specsHealth.passed`. Issue-row words `failed` / `warning` are implemented but not asserted (the text test only checks `specsHealth.issues:`).                                                                                                                                                                                                                                                                                                                                                                              |
| includes active-change overlaps (always)          | Compliant | Every snapshot call passes `includeOverlaps: true` together with `includeChanges: true` and `includeSpecsHealth: true` (default and `--graph`). Handler copies `snapshot.summary.overlaps` to a root `overlaps` object (`hasOverlap`, `entries[].specId`, `entries[].changes[].name`, `entries[].changes[].state`) and spreads it only when defined, never as `null` and never under a `summary` key. The JSON/TOON payload has no `summary` property. Empty reports still render: JSON `{ hasOverlap: false, entries: [] }`, text `overlaps: (none)`. Text lists `specId` and change names (with state). `status.ts` does not reference `GetProjectSummary` or `DetectOverlap`. There is no flag to disable overlaps. | Yes. Default and `--graph` tests expect the three flags true. `getProjectSummary.execute` and `kernel.changes.detectOverlap.execute` are not called. JSON populated case expects root `overlaps` and `not.toHaveProperty('summary')`. Empty JSON and text `(none)` are asserted. Text lists `core:get-project-summary`, `alpha`, and `beta`. TOON expects `hasOverlap`, `specId`, and `alpha,ready`. A separate test expects the root key to be absent when the snapshot omits `overlaps`; that matches copy-if-present, and the command still always requests the flag. |
| includes approval gates                           | Compliant | Output uses `snapshot.approvals` (`specEnabled`, `signoffEnabled`) in JSON and as `approvals.spec` / `approvals.signoff` on/off in text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | No. Stub sets both flags false and no assertion reads them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| includes graph freshness (always)                 | Compliant | Default snapshot options are `{ includeGraph: true, includeHotspots: false, includeChanges: true, includeSpecsHealth: true, includeOverlaps: true }`. `stale` and `lastIndexedAt` are read from `snapshot.graphHealth`. When `graphHealth` is null, JSON `graph.freshness` and `graph.stale` are `null` (`?? null`). Text renders that null as `never indexed (unknown)`. Graph data is only taken from the snapshot.                                                                                                                                                                                                                                                                                                  | Partial. Text null case expects `graph.freshness: never indexed (unknown)`. No JSON/TOON assertion that the fields are `null`. Default options test covers `includeGraph: true` plus the three summary flags.                                                                                                                                                                                                                                                                                                                                                            |
| supports --graph flag                             | Compliant | `--graph` sets `includeHotspots: true` and keeps `includeGraph`, `includeChanges`, `includeSpecsHealth`, and `includeOverlaps` true. Extended block adds `fileCount`, `symbolCount`, languages, and hotspot entries from the snapshot. Formatting stays in the handler.                                                                                                                                                                                                                                                                                                                                                                                                                                                | Yes. “Extended graph stats with --graph flag” expects those snapshot options and `graph.files` / `graph.symbols` / `graph.languages`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| includes config flags (always)                    | Compliant | JSON includes `approvals` and `llmOptimizedContext` from the snapshot on every run. Text prints `approvals.spec`, `approvals.signoff`, and `llmOptimizedContext` without a flag.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | No. No assertion on those lines.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| supports --context flag                           | Compliant | `--context` defaults off. When set, the handler calls `kernel.project.getProjectContext.execute({})` first, prints full `contextEntries` in text, and does not build a `CompileContextConfig`. When optimized context is fresh it keeps `optimizedContext` and calls `execute({ llmOptimizedContext: false })` for the raw spec id list. JSON context object carries instructions, files, specs, and optional `optimizedContext` (key omitted when absent).                                                                                                                                                                                                                                                            | Yes. Context tests cover full text, no inline config, `execute({})`, the `llmOptimizedContext: false` follow-up, and optimized content.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Optimization warning signal                       | Compliant | Warnings from `GetProjectContext` are written to stderr as `warning: ${message}`. The stale-optimization message is forwarded, including the optimizer remediation text supplied by the use case.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Yes. Stderr test expects `stale-optimization` wording and `specd-project-context-optimizer`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| defaults to text output                           | Compliant | `--format` defaults to `text`. Without the flag the handler writes newline-joined lines to stdout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Yes. Tests that omit `--format` assert human-readable lines.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| supports json and toon formats                    | Compliant | Non-text formats go through `output(..., fmt)` with `parseFormat`. JSON tests `JSON.parse` the payload. TOON tests see field fragments from the same object.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Yes. JSON parse tests and TOON fragments (`archived: 9`, overlap fields).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| SDK host bootstrap                                | Compliant | Handler `await openSpecdHost(...)` from `@specd/sdk` and passes that host into `buildProjectStatusSnapshot`. Approvals and graph data come back on the snapshot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Yes, indirect. The SDK module is mocked; snapshot is called with `expect.objectContaining({ kernel })` from the object `openSpecdHost` resolved. No standalone `expect(openSpecdHost).toHaveBeenCalled()`.                                                                                                                                                                                                                                                                                                                                                               |
| No direct repository bootstrap in command handler | Compliant | `status.ts` imports `buildProjectStatusSnapshot` and `openSpecdHost` only. It does not construct `ChangeRepository` or `SpecRepository`. Workspace display and summary/graph/approvals go through the host kernel and the snapshot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | No explicit assertion. Source has no repository constructors; overlap tests assert summary and `DetectOverlap` are not called beside the snapshot.                                                                                                                                                                                                                                                                                                                                                                                                                       |

### Discrepancies

None.

### Missing tests

- Workspace row fields (`prefix`, `ownership`, `isExternal`, `codeRoot`) and project root / schema lines.
- Approval gate and `llmOptimizedContext` output.
- JSON/TOON `graph.freshness` and `graph.stale` are `null` when `graphHealth` is null (text “unknown” is covered).
- Issue-row severity words `failed` and `warning` (the summary counter line is covered).
- Direct assertion that the handler never constructs `ChangeRepository` or `SpecRepository`.

### Summary

- requirements: 16
- compliant: 16
- partial: 0
- missing: 0
- discrepancies: 0

## sdk:build-project-status-snapshot

### Requirements

| Requirement                                              | Status    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Test                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------- |
| buildProjectStatusSnapshot orchestration                 | Compliant | Summary input is built only from flags that are strictly `true`. Each true flag is spread as `true`; `false` and omitted flags are left out (not `null`, not `false`). If all three are off, `getProjectSummary.execute` is called with `undefined` (count-only). `includeOverlaps: true` forwards `{ includeOverlaps: true }` only. The module does not import or call `DetectOverlap`. `includeGraph` defaults false and skips `withOpenGraphProvider`. When true, it opens the provider, `createGetGraphHealth()`, `listWorkspaces.execute()`, and `getGraphHealth.execute({ config, provider, codeGraphVersion, workspaces })`. `config` is `getConfig.execute()`. There is no `assertUnlocked` property (`GetGraphHealthInput` has no such field; the call does not pass one). Provider, health, and hotspot failures return `graphHealth: null` and, when hotspots were requested, `hotspots: null`, without throwing. | Yes for flag forwarding, count-only `execute(undefined)`, graph skip, graph load, hotspot success, hotspot failure clearing both fields, and provider failure returning null. Graph execute assertion is `objectContaining` on `codeGraphVersion` and `workspaces` only, so it would not fail if `assertUnlocked` were added, and it does not assert `config` or `provider`. No spy asserts `DetectOverlap` is absent; the module has no such call. |
| Result shape stability                                   | Compliant | Options interface has `includeGraph`, `includeHotspots`, `includeChanges`, `includeSpecsHealth`, `includeOverlaps`, all optional. Result has `summary`, `graphHealth` (`null` when graph is off or failed), `approvals.specEnabled` / `signoffEnabled` from `config.approvals`, and `llmOptimizedContext` from config (`?? false`). `hotspots` is spread only when `includeHotspots` is true (`null` if unavailable). Enriched `active`, `drafts`, `specsHealth`, and `overlaps` stay on `summary`; the root object does not copy them.                                                                                                                                                                                                                                                                                                                                                                                      | Yes. Approvals and `llmOptimizedContext` asserted on the includeGraph false case. Overlap and all-flags tests expect `summary.overlaps` and `not.toHaveProperty('overlaps'                                                                                                                                                                                                                                                                          | 'active' | 'specsHealth')` on the root. |
| No presenter formatting                                  | Compliant | Return value is a plain object. No text, JSON, or TOON encoding in this module.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Yes. Tests read structured fields only.                                                                                                                                                                                                                                                                                                                                                                                                             |
| No direct repository bootstrap in snapshot orchestration | Compliant | Summary, config, and workspaces come from `ctx.kernel.project.getProjectSummary`, `getConfig`, and `listWorkspaces`. No `ChangeRepository` or `SpecRepository` construction and no second bootstrap path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | No explicit repository assertion. The test context only exposes those three project queries, and the implementation uses them.                                                                                                                                                                                                                                                                                                                      |

### Discrepancies

None.

### Missing tests

- `getGraphHealth.execute` is not asserted as exactly `{ config, provider, codeGraphVersion, workspaces }` with `assertUnlocked` absent. Implementation already passes that set and nothing else.
- No test spies `DetectOverlap` on the snapshot. The snapshot does not call it.

### Summary

- requirements: 4
- compliant: 4
- partial: 0
- missing: 0
- discrepancies: 0

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

# Globals

## default:\_global/architecture

### Findings

None.

`GetProjectSummary` stays in the application layer. Its new imports are `OverlapReport` (domain) and `DetectOverlap` (application use case). It does not import `infrastructure/` or `composition/`. Overlap detection is delegated to `DetectOverlap.execute()` with no name filter; the use case does not read the filesystem itself.

`createGetProjectSummary` remains in `composition/`. The config overload still goes through `createCompositionResolver` and `resolveGetProjectSummaryDeps`, which now wires `createDetectOverlap(resolveDetectOverlapDeps(resolver))`. The deps overload passes `detectOverlap` into the constructor. No concrete adapter is exported from this factory.

`buildProjectStatusSnapshot` forwards `includeOverlaps` onto `kernel.project.getProjectSummary` and leaves `overlaps` on `summary`. Graph health is loaded only when `includeGraph` is true, via `createGetGraphHealth().execute({ config, provider, codeGraphVersion, workspaces })`. That call does not pass `assertUnlocked`.

`registerProjectStatus` imports `buildProjectStatusSnapshot` and `openSpecdHost` from `@specd/sdk` only. It maps the overlap report into text and into a root `overlaps` object. That mapping is delivery formatting, not a second overlap policy.

### Summary

- compliant: yes
- discrepancies: 0

## default:\_global/conventions

### Findings

None.

Touched sources use named exports only (`GetProjectSummary`, `createGetProjectSummary`, `resolveGetProjectSummaryDeps`, `buildProjectStatusSnapshot`, `registerProjectStatus`, and the related interfaces). No `export default`. No `any`. New and existing public functions and class methods on these files have explicit return types.

Public symbols touched by the change have JSDoc. `includeOverlaps` is documented on `BuildProjectStatusSnapshotOptions`. `GetProjectSummaryInput` / `GetProjectSummaryResult` document the enrichment switch and the optional `overlaps` field at the interface. Constructor JSDoc includes `@param detectOverlap`. `execute` keeps `@param` and `@returns`. File names stay kebab-case.

### Summary

- compliant: yes
- discrepancies: 0

## default:\_global/testing

### Findings

None.

Tests live under each package `test/` tree, mirror `src/`, and use the `.spec.ts` suffix:

- `packages/core/test/application/use-cases/get-project-summary.spec.ts`
- `packages/core/test/composition/use-cases/get-project-summary.spec.ts`
- `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts`
- `packages/cli/test/commands/project/status.spec.ts`

New overlap tests use `given …, when …, then …` titles:

- unfiltered report when `includeOverlaps` is true
- omitted or false skips `DetectOverlap` and omits `overlaps`
- specs health is not filtered by an active-change spec
- empty report is present with `hasOverlap: false`
- factory rejects deps that omit `detectOverlap`
- snapshot forwards the flag and keeps `overlaps` under `summary`
- count-only snapshot when no summary flags are set
- all summary flags stay under `summary`
- CLI text `(none)`, text spec id plus change names and states, JSON root object, empty JSON report, omitted JSON key, and TOON fields

No new overlap test uses `toMatchSnapshot` or `toMatchInlineSnapshot`. They do not build or assert host filesystem paths.

### Summary

- compliant: yes
- discrepancies: 0

## default:\_global/docs

### Findings

1. `docs/cli/project.md` — `--graph` does not match the graph-health contract the command implements. The status section now says code graph freshness is part of `specd project status`, and the implementation always calls `buildProjectStatusSnapshot` with `includeGraph: true`, so freshness, stale, and fingerprint mismatch are always loaded. `--graph` only sets `includeHotspots` and, when health is present, adds extended stats (`fileCount`, `symbolCount`, `relationCounts`, `languages`, hotspots). The option line still says `--graph` includes “code graph indexing and freshness metrics.” `project status` does not index, and freshness is not gated on that flag. `docs/cli/cli-reference.md` already states freshness is always included and `--graph` is extended statistics. Overlap prose in `project.md` matches the implementation (always on, text `overlaps: (none)` or one line per spec id, json/toon `overlaps` with `hasOverlap` and `entries` on the command root).

Checked and aligned:

- `docs/core/use-cases.md` — constructor takes `DetectOverlap`; `includeOverlaps` defaults to false; `overlaps` is absent unless the flag is true; a true flag returns `DetectOverlap.execute()` with no name filter, including an empty report; `specsHealth` stays `GetSpecsHealth.execute({})` and is not filtered by active-change membership.
- `docs/cli/cli-reference.md` — overlaps are copied to the command root; text prints `overlaps: (none)` or one line per spec id with change names and states; json/toon keep that object at the root; there is no disable flag. Graph freshness is documented as always included.
- `docs/code-graph/use-cases.md` — the `GetGraphHealth` example passes `config`, `provider`, `codeGraphVersion`, and optional `workspaces`. It does not pass `assertUnlocked`. That input matches `GetGraphHealthInput` and the SDK call in `buildProjectStatusSnapshot`. The consumer line still names `project status --graph`. That invocation does call `GetGraphHealth`, because the CLI always sets `includeGraph: true`; the flag itself only adds hotspots. The example contract is the one this change corrected, and it matches.

Docs updated by the change stay under `docs/core/`, `docs/cli/`, and `docs/code-graph/`.

### Summary

- compliant: no
- discrepancies: 1

## default:\_global/eslint

### Findings

None.

The same touched sources satisfy the enforced rules: no explicit `any`, no default exports, explicit return types on exported functions and methods, kebab-case file names, JSDoc on the new public symbols, and no application import of `infrastructure/` or `composition/`. Test files are exempt from JSDoc. `dist/` is not part of the change.

### Summary

- compliant: yes
- discrepancies: 0
