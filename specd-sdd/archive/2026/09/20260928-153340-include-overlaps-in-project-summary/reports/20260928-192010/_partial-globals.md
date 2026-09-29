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
