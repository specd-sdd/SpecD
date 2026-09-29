# Globals and direct dependencies

Read-only audit of `include-overlaps-in-project-summary` against published global specs and the dependency specs this change's behavior relies on. Specs were loaded with `specs context --rules --constraints`. Graph search/impact located `GetProjectSummary`, `resolveGetProjectSummaryDeps`, `DetectOverlap`, `buildProjectStatusSnapshot`, `registerProjectStatus`, and `GetGraphHealthInput` before file reads.

Graph stats reported `stale: null` (workspace `default` had `state: stale` / `CONTENT_KNOWN_STALE`). The index was not rebuilt.

Behavior under test:

- `GetProjectSummary` optional `includeOverlaps` defaults false. `true` calls `DetectOverlap.execute()` with no name and returns that `OverlapReport`. `false` or omitted omits `overlaps` and never sets it to `null`.
- CLI `project status` always calls `buildProjectStatusSnapshot` with `includeOverlaps: true`. JSON/TOON copy `overlaps` to the command root. Text prints `overlaps: (none)` or one line per spec id.
- The snapshot forwards `includeOverlaps` only when it is strictly `true`. The graph-health call does not pass `assertUnlocked`.
- `core:kernel` is not in this batch. `kernel.ts` is not treated as a file this change should edit.

Out of this batch: the other kernel dependency specs (about 50). Not audited here.

## default:\_global/architecture

### Requirements checked

- Application code does not import `infrastructure/` or `composition/`. Domain stays free of I/O.
- `composition/` is the only layer that wires adapters. Config factories go through one composition resolver. Canonical `createX(deps)` remains available without `createKernel`.
- Delivery hosts translate to use cases. They do not implement a second domain policy. `cli` imports `@specd/sdk` rather than pairing `@specd/core` with `@specd/code-graph` for the same host path.
- No module-level singletons. Constructors receive dependencies.

### Contradiction

No. `GetProjectSummary` stays in `application/` and imports `OverlapReport` (domain) plus `DetectOverlap` (application). `includeOverlaps: true` delegates to `DetectOverlap.execute()` with no name. The use case does not read the filesystem itself.

`createGetProjectSummary` stays in `composition/`. The config overload builds one resolver and calls `resolveGetProjectSummaryDeps`, which wires `detectOverlap` with `createDetectOverlap(resolveDetectOverlapDeps(resolver))`. The deps overload passes that dependency into the constructor. No concrete adapter is exported from the factory.

`registerProjectStatus` imports `buildProjectStatusSnapshot` and `openSpecdHost` from `@specd/sdk` only. Copying `hasOverlap` and `entries` onto the command root, and formatting text lines, is delivery mapping. Overlap policy stays in `DetectOverlap`.

`buildProjectStatusSnapshot` forwards the flag onto `kernel.project.getProjectSummary` and leaves `overlaps` on `summary`. Graph health runs only when `includeGraph` is true, on an already-open provider, with no `assertUnlocked`.

### Discrepancies

None.

### Test gaps

None for this spec. Overlap tests construct the use case through its constructor or `createGetProjectSummary`. The CLI status test asserts the command does not call `kernel.project.getProjectSummary` or `kernel.changes.detectOverlap` itself.

### Summary

- compliant: yes
- discrepancies: 0

## default:\_global/conventions

### Requirements checked

- Named exports, no `any`, explicit return types on public functions and methods.
- kebab-case sources. Tests live under `test/` as `.spec.ts`.
- `exactOptionalPropertyTypes`: optional result fields are omitted rather than set to `null`.
- JSDoc on public types and functions (`@param`, `@returns`).
- `list()` stays metadata; full change content is loaded only by an explicit `get()` inside the overlap use case, and only when the flag is true.

### Contradiction

No. Touched sources use named exports (`GetProjectSummary`, `createGetProjectSummary`, `resolveGetProjectSummaryDeps`, `buildProjectStatusSnapshot`, `registerProjectStatus`). `includeOverlaps === true` is the only path that calls `DetectOverlap`. The result spreads `overlaps` only when that report is defined. `false` and omitted inputs do not set the key.

`BuildProjectStatusSnapshotOptions.includeOverlaps` and `GetProjectSummaryInput` document the switch. Constructor JSDoc includes `@param detectOverlap`. `execute` keeps `@param` and `@returns`. The snapshot forwards `{ includeOverlaps: true }` only when the option is strictly true, which matches `exactOptionalPropertyTypes`.

### Discrepancies

None.

### Test gaps

None for this spec. Unit tests assert the key is absent for omitted and `false`, and present (including an empty report) when the flag is true.

### Summary

- compliant: yes
- discrepancies: 0

## default:\_global/testing

### Requirements checked

- Vitest tests under package `test/` trees, mirroring `src/`, with the `.spec.ts` suffix.
- New behavior described as `given …, when …, then …`.
- No `toMatchSnapshot` / `toMatchInlineSnapshot`.
- Unit tests do not require a host filesystem. The composition factory test uses `os.tmpdir()` and `node:path`.

### Contradiction

No. Overlap coverage lives in:

- `packages/core/test/application/use-cases/get-project-summary.spec.ts`
- `packages/core/test/composition/use-cases/get-project-summary.spec.ts`
- `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts`
- `packages/cli/test/commands/project/status.spec.ts`

New cases cover the unfiltered report, omitted and `false` skipping `DetectOverlap`, specs health left unfiltered, an empty report with `hasOverlap: false`, factory rejection when `detectOverlap` is missing, snapshot forwarding with `overlaps` kept under `summary`, count-only snapshot when no summary flags are set, all summary flags staying under `summary`, and CLI text, JSON, and TOON shapes.

`DetectOverlap` stubs use `as unknown as DetectOverlap`. That cast is on a use case, not a port mock. It does not violate the port-mock rule.

### Discrepancies

None.

### Test gaps

None that violate this spec. Narrow assertion gaps against dependency contracts are recorded on those specs below.

### Summary

- compliant: yes
- discrepancies: 0

## default:\_global/docs

### Requirements checked

- Command output-contract changes are documented under `docs/cli/` in the same change (purpose, flags, examples).
- A listing/summary input, output, or dependency-resolution change updates every in-repo `docs/` file that still shows the old shape, including `docs/core/`, `docs/cli/`, and `docs/guide/`.
- Factory contract changes document canonical `createX(deps)` and convenience `createX(config, options?)`.
- `GetGraphHealth` examples stay on an already-open provider and do not invent caller lock fields.
- Host docs keep `@specd/sdk` as the integrator surface.

### Contradiction

Yes. CLI and core use-case prose match the new overlap behavior. One composition example still shows a factory input this change's resolver does not produce. Two shorter catalog lines omit the new contract.

Checked and aligned:

- `docs/core/use-cases.md` — constructor takes `DetectOverlap`. `includeOverlaps` defaults to false. `overlaps` is absent unless the flag is true. A true flag returns `DetectOverlap.execute()` with no name filter, including an empty report. `specsHealth` stays `GetSpecsHealth.execute({})` and is not filtered by active-change membership. The config factory is described as wiring through `resolveGetProjectSummaryDeps`.
- `docs/cli/project.md` — overlaps are always on. Text is `overlaps: (none)` or one line per spec id. JSON/TOON put `overlaps` (`hasOverlap`, `entries`) on the command root. `--graph` is extended statistics and hotspots. Freshness is always in the default output. The flag does not index.
- `docs/cli/cli-reference.md` — same overlap placement, no disable flag, freshness always included, `--graph` is extended statistics.
- `docs/code-graph/use-cases.md` — the `GetGraphHealth` example passes `config`, `provider`, `codeGraphVersion`, and optional `workspaces`. It does not pass `assertUnlocked`. That matches `GetGraphHealthInput` and the snapshot call. The consumer line names `project status --graph`. That invocation does call `GetGraphHealth`, because the CLI always sets `includeGraph: true`. The flag itself only adds hotspots.
- `docs/sdk/index.md` — `buildProjectStatusSnapshot` remains `GetProjectSummary` plus optional graph health. Overlaps stay inside the summary. Formatting stays in the delivery host.

### Discrepancies

1. **Medium** — `docs/core/ports.md` still shows a `createGetProjectSummary` deps object the factory rejects. The sample passes `listChanges`, `listDrafts`, `listDiscarded`, `listArchived`, and `listWorkspaces` taken from resolver getters. `GetProjectSummaryDeps` is `changes`, `archive`, `listWorkspaces`, `listChanges`, `listDrafts`, `countTasks`, `getSpecsHealth`, and `detectOverlap`. `resolveGetProjectSummaryDeps` builds `detectOverlap` with `createDetectOverlap(resolveDetectOverlapDeps(resolver))`. `CompositionResolver` has no `getListChanges`, `getListDiscarded`, or `getListArchived`. This change's dependency-resolution contract is the one the docs rule requires every old-shape example to follow. This example does not.

2. **Low** — `docs/core/overview.md` still describes `GetProjectSummary` as returning counts without loading entities. Default execution still does that. `includeOverlaps: true` calls `DetectOverlap.execute()`, which loads active change entities. `docs/core/use-cases.md` already states that split. The export table does not. The same sentence was already inexact for `includeChanges`.

3. **Low** — `docs/guide/cli.md` describes `specd project status` as schema, workspaces, spec counts, active changes, and graph freshness. It does not mention always-on overlaps. `docs/cli/project.md` and `docs/cli/cli-reference.md` do. The docs rule puts `docs/guide/` in scope for a summary output-contract change. The guide line is an overview, and it already omitted specs health, so the miss is narrow.

### Test gaps

No test checks that `docs/core/ports.md` matches `GetProjectSummaryDeps`. That is what left discrepancy 1 in place.

### Summary

- compliant: no
- discrepancies: 3

## default:\_global/eslint

### Requirements checked

- No explicit `any`. No default exports. Exported functions have explicit return types.
- `src/` files stay kebab-case.
- JSDoc on functions, methods, classes, and interfaces (`description`, `@param`, `@returns`, `@throws` where the function throws).
- Application files do not import `infrastructure/` or `composition/`.

### Contradiction

No. New and edited public symbols on the summary, composition factory, snapshot, and CLI command follow those rules. `GetProjectSummary.execute` does not throw `ChangeNotFoundError`, because it calls `DetectOverlap.execute()` with no name. Tests are exempt from JSDoc.

### Discrepancies

None.

### Test gaps

None for this spec. Lint is not re-run by the overlap unit tests. The sources reviewed do not add `any`, default exports, or a cross-layer import.

### Summary

- compliant: yes
- discrepancies: 0

## core:spec-overlap

### Requirements checked

- `DetectOverlap.execute` lists active changes, runs `detectSpecOverlap`, and returns `OverlapReport` (`entries`, `hasOverlap`).
- `hasOverlap` is true only when `entries` is non-empty. Zero or one active change yields an empty report and does not throw.
- Optional `name` filters the report. A name that is absent throws `ChangeNotFoundError`. No name returns the unfiltered report.
- Drafts and discarded changes stay out. The constructor takes `ChangeRepository` only. The config factory uses `resolveDetectOverlapDeps`.

### Contradiction

No. `includeOverlaps: true` calls `this._detectOverlap.execute()` with no argument. `execute` treats `input?.name === undefined` as the unfiltered report. The summary returns that report object unchanged, including an empty report. It does not pass a change name, so this path does not raise `ChangeNotFoundError`.

`resolveGetProjectSummaryDeps` builds the dependency with `createDetectOverlap(resolveDetectOverlapDeps(resolver))`, which resolves `changes` only. Overlap still uses repository `list()` plus `get()` for active changes. It does not call draft or discarded lists.

### Discrepancies

None.

### Test gaps

The summary unit test asserts `execute` is called with no arguments and that the same report object is returned, including `hasOverlap: false` for an empty report. It stubs `DetectOverlap`, so it does not re-prove active-only membership or the named-change error. Those rules stay inside `DetectOverlap`, which this change does not edit. The call contract this change uses is tested.

### Summary

- compliant: yes
- discrepancies: 0

## core:get-specs-health

### Requirements checked

- `GetSpecsHealth.execute` calls `ValidateSpecs`.
- Optional `workspace` is forwarded only when it is set. An empty input stays project-wide.
- The result shape (`totalSpecs`, `passed`, `failed`, `warned`, `issues`) is unchanged by overlap enrichment. Clean passes stay out of `issues`.

### Contradiction

No. `includeSpecsHealth` still calls `this._getSpecsHealth.execute({})`. `GetSpecsHealth.execute` forwards `{ workspace }` only when `input.workspace !== undefined`, so `{}` is project-wide. The overlap flag does not filter `issues` or rewrite the counters.

### Discrepancies

None.

### Test gaps

None for this use. `get-project-summary.spec.ts` asserts `getSpecsHealth.execute({})` when both `includeSpecsHealth` and `includeOverlaps` are true, and asserts the health payload is returned unchanged, including an issue whose spec id is also an overlap participant.

### Summary

- compliant: yes
- discrepancies: 0

## code-graph:get-graph-health

### Requirements checked

- `GetGraphHealthInput` is `config`, an already-open `provider`, `codeGraphVersion`, optional `workspaces`, optional `adapters`, optional `manifestSource`.
- The use case does not open or close the provider, does not index, and does not expose a caller lock escape hatch.
- `createGetGraphHealth()` does not capture config. The use case does not load change entities.

### Contradiction

No. `GetGraphHealthInput` has no `assertUnlocked` field. `buildProjectStatusSnapshot` calls `execute` only when `includeGraph` is true, inside `withOpenGraphProvider`, with `{ config, provider, codeGraphVersion, workspaces }`. `config` comes from `ctx.kernel.project.getConfig.execute()`. `workspaces` comes from `listWorkspaces`. Overlap loading stays in `GetProjectSummary` and is not passed into graph health.

### Discrepancies

None.

### Test gaps

`build-project-status-snapshot.spec.ts` asserts graph `execute` with `expect.objectContaining({ codeGraphVersion, workspaces })`. That passes if `assertUnlocked` were added, and it does not assert `config` or `provider`. The implementation already passes the four-field set and nothing else. The absent lock field is untested.

### Summary

- compliant: yes
- discrepancies: 0

## sdk:host-context

### Requirements checked

- `openSpecdHost` accepts `configPath` and `options?: SdkContextOptions` (`kernel` and `graph` options). It rejects `configPath` together with `startDir`.
- `SdkHostContext` is `{ kernel, createGraphProvider }`. It does not store a second `SpecdConfig`. Callers read config with `kernel.project.getConfig.execute()`.
- Bootstrap does not write config. Graph provider creation stays on the context factory.

### Contradiction

No. `project status` calls `openSpecdHost({ configPath?, options: { kernel: buildCliKernelOptions() } })`. The snapshot takes that host context and reads config with `getConfig.execute()`. `includeOverlaps` does not add a kernel, a second config object, or another graph-provider factory. Graph open stays behind `includeGraph` via `withOpenGraphProvider(ctx)`.

The command also reads `host.config` from the `openSpecdHost` result (`projectRoot`, schema, context entries). That field is part of `OpenSpecdHostResult`, not a second config stored on `SdkHostContext`.

### Discrepancies

None.

### Test gaps

CLI tests mock `openSpecdHost` and assert `buildProjectStatusSnapshot(..., { includeOverlaps: true, ... })`. They do not assert the `openSpecdHost` argument (`configPath` only when `--config` is set, and `options.kernel`). The implementation matches the input type. The bootstrap argument list is untested.

### Summary

- compliant: yes
- discrepancies: 0

## core:count-tasks

### Requirements checked

- `CountTasks.execute` accepts a `Change`, reads artifacts, and returns `byArtifact` plus `total`.
- It is read-only. It does not decide lifecycle transitions.
- Empty or missing artifacts are omitted from `byArtifact`. Consumers that need task totals call it explicitly.

### Contradiction

No. Task totals are still computed only inside `_buildChangeListings`, which runs when `includeChanges` is true. `includeOverlaps` does not call `CountTasks` and does not change `complete` / `incomplete` / `total`. An overlap-only summary never materializes listing rows.

### Discrepancies

None.

### Test gaps

The overlap-only summary test does not assert `countTasks.execute` was skipped. `includeChanges: false` already asserts that skip on the listing path. The implementation does not call `CountTasks` from the overlap branch.

### Summary

- compliant: yes
- discrepancies: 0

## core:composition-resolver

### Requirements checked

- One resolver per config session. It is not a process singleton.
- Per-use-case helpers such as `resolveGetProjectSummaryDeps(resolver)` live next to `createX`. They are not methods that centralize every `XDeps` on the resolver.
- Config form: create a resolver, assemble deps, delegate to `createX(deps)`.
- Invalid argument combinations throw `InvalidCompositionFactoryArgumentsError`.
- A standalone factory must not build the full kernel.

### Contradiction

No. `resolveGetProjectSummaryDeps` is the per-use-case helper. It is not a method of `CompositionResolver`. The config form of `createGetProjectSummary` creates one resolver, derives deps, and delegates to the deps overload. `detectOverlap` is `createDetectOverlap(resolveDetectOverlapDeps(resolver))` on that same session. A deps object that omits `detectOverlap` fails the type guard and is rejected as invalid factory arguments. The snapshot does not build repositories. It calls the kernel use case.

### Discrepancies

None.

### Test gaps

None for this use. The composition spec asserts the config form returns a `GetProjectSummary`, explicit deps round-trip, a missing `detectOverlap` throws `InvalidCompositionFactoryArgumentsError`, deps plus options are rejected, and `resolveGetProjectSummaryDeps` returns a `DetectOverlap` plus the eight expected keys.

### Summary

- compliant: yes
- discrepancies: 0

## Aggregate

- specs checked: 11 (5 globals, 6 direct dependencies)
- discrepancies: 3
- all 3 are in `default:_global/docs` (1 medium, 2 low)
- other audited specs: clean

`core:kernel` and the rest of the kernel dependency list were out of this batch.
