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
