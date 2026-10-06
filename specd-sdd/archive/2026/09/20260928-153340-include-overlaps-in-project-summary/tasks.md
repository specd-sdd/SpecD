# Tasks: include-overlaps-in-project-summary

## 1. Core summary contract

- [x] 1.1 Add `includeOverlaps` to the execute input
      `packages/core/src/application/use-cases/get-project-summary.ts`: `GetProjectSummaryInput` — add `readonly includeOverlaps?: boolean`
      Approach: optional field, default false; `execute` treats only `input?.includeOverlaps === true` as on
      (Req: Optional enrichment input flags)

- [x] 1.2 Add `overlaps` to the result
      `packages/core/src/application/use-cases/get-project-summary.ts`: `GetProjectSummaryResult` — add `readonly overlaps?: OverlapReport`
      Approach: import `OverlapReport` from `../../domain/value-objects/overlap-report.js`; omit the key with a conditional spread, never assign `null`
      (Req: Returns count-only project summary, Optional active-change overlap enrichment)

- [x] 1.3 Accept `DetectOverlap` on the constructor
      `packages/core/src/application/use-cases/get-project-summary.ts`: `GetProjectSummary` — append `detectOverlap: DetectOverlap` and store `_detectOverlap`
      Approach: import `DetectOverlap` from `./detect-overlap.js`; keep the existing seven parameters in order and add this one last; update the JSDoc `@param`
      (Req: Constructor accepts orchestration dependencies)

- [x] 1.4 Call `DetectOverlap` only when the flag is true
      `packages/core/src/application/use-cases/get-project-summary.ts`: `execute` — add the overlap promise to the existing `Promise.all`
      Approach: `includeOverlaps ? this._detectOverlap.execute() : Promise.resolve(undefined)`; spread `{ overlaps }` only when the flag is true and the report is defined; pass no `name`
      (Req: Optional active-change overlap enrichment, Parallelizes independent queries)

- [x] 1.5 Leave specs health unfiltered
      `packages/core/src/application/use-cases/get-project-summary.ts`: `execute` — keep `this._getSpecsHealth.execute({})` and assign that result as `specsHealth`
      Approach: do not drop or rewrite rows whose spec id is in an active change `specIds`
      (Req: Optional specs health enrichment)

## 2. Composition wiring

- [x] 2.1 Add `detectOverlap` to factory deps
      `packages/core/src/composition/use-cases/get-project-summary.ts`: `GetProjectSummaryDeps` — add `readonly detectOverlap: DetectOverlap`
      Approach: import the type from the application use case module
      (Req: Config-based factory delegates through resolveGetProjectSummaryDeps)

- [x] 2.2 Resolve `DetectOverlap` from the shared resolver
      `packages/core/src/composition/use-cases/get-project-summary.ts`: `resolveGetProjectSummaryDeps` — set `detectOverlap: createDetectOverlap(resolveDetectOverlapDeps(resolver))`
      Approach: import `createDetectOverlap` and `resolveDetectOverlapDeps` from `./detect-overlap.js`; do not write a second overlap implementation
      (Req: Config-based factory delegates through resolveGetProjectSummaryDeps, Factory wires from SpecdConfig)

- [x] 2.3 Pass `detectOverlap` into the use case
      `packages/core/src/composition/use-cases/get-project-summary.ts`: `createGetProjectSummaryFromNormalized` and `isGetProjectSummaryDeps`
      Approach: destructure `detectOverlap` and pass it as the last `new GetProjectSummary` argument; type guard also requires `'detectOverlap' in value`
      (Req: Constructor accepts orchestration dependencies, Config-based summary wiring preserves complete repository bootstrap semantics)

## 3. SDK snapshot

- [x] 3.1 Accept `includeOverlaps` on snapshot options
      `packages/sdk/src/orchestration/build-project-status-snapshot.ts`: `BuildProjectStatusSnapshotOptions` — add `readonly includeOverlaps?: boolean`
      Approach: document it as forwarded to `GetProjectSummary`, default false
      (Req: Result shape stability)

- [x] 3.2 Forward the flag into `getProjectSummary.execute`
      `packages/sdk/src/orchestration/build-project-status-snapshot.ts`: `buildProjectStatusSnapshot` — include `includeOverlaps` in the summary-input condition
      Approach: `const includeOverlaps = options?.includeOverlaps === true`; build `summaryInput` when any of the three flags is true and set `includeOverlaps: true as const` only then; otherwise `execute(undefined)`; do not call `DetectOverlap`
      (Req: buildProjectStatusSnapshot orchestration)

- [x] 3.3 Keep `overlaps` on `summary` only
      `packages/sdk/src/orchestration/build-project-status-snapshot.ts`: return value — do not copy `overlaps` to the snapshot root
      Approach: return the use-case result as `summary` unchanged
      (Req: Result shape stability, No presenter formatting)

## 4. CLI project status

- [x] 4.1 Always request overlaps from the snapshot
      `packages/cli/src/commands/project/status.ts`: `registerProjectStatus` — add `includeOverlaps: true` to both `buildProjectStatusSnapshot` calls
      Approach: keep `includeGraph: true`, `includeChanges: true`, `includeSpecsHealth: true`; set `includeHotspots` only for `--graph`; do not call `getProjectSummary` or `detectOverlap` on the kernel
      (Req: includes active-change overlaps (always), includes graph freshness (always), supports --graph flag, SDK host bootstrap, No direct repository bootstrap in command handler)

- [x] 4.2 Render overlaps in json and toon
      `packages/cli/src/commands/project/status.ts`: structured `output` object and the help-text schema
      Approach: `const overlaps = summary.overlaps`; spread `...(overlaps !== undefined ? { overlaps } : {})` beside `specsHealth`; mention `overlaps?: { entries, hasOverlap }` in the help schema
      (Req: includes active-change overlaps (always), supports json and toon formats)

- [x] 4.3 Render overlaps in text
      `packages/cli/src/commands/project/status.ts`: text `lines` array, after specs-health lines and before `graph.freshness`
      Approach: undefined prints nothing; `hasOverlap === false` prints `overlaps: (none)`; otherwise print `overlaps:` and `  <specId>: <name> [<state>], ...` per entry in report order
      (Req: includes active-change overlaps (always), defaults to text output)

## 5. Tests

- [x] 5.1 Cover summary overlap and health scenarios
      `packages/core/test/application/use-cases/get-project-summary.spec.ts`: add cases for no flags, overlap present, empty report, flag false, and a spec that stays in `specsHealth` while listed on an active change
      Approach: mock `DetectOverlap.execute` and `GetSpecsHealth.execute`; assert call args and absent keys with `exactOptionalPropertyTypes`-safe checks (`'overlaps' in result`)
      (Req: Returns count-only project summary, Optional active-change overlap enrichment, Optional specs health enrichment)

- [x] 5.2 Cover factory wiring
      `packages/core/test/composition/use-cases/get-project-summary.spec.ts`: assert config factory resolves `detectOverlap`, and a deps object without that field is not accepted as deps
      Approach: use the existing composition test config helper; do not construct repositories inside the use case
      (Req: Factory wires from SpecdConfig, Config-based factory delegates through resolveGetProjectSummaryDeps)

- [x] 5.3 Cover snapshot forwarding
      `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts`: forward `includeOverlaps: true`, omit all three flags, and keep `overlaps` under `summary` only
      Approach: stub `ctx.kernel.project.getProjectSummary.execute` and assert it is the only overlap path
      (Req: buildProjectStatusSnapshot orchestration, Result shape stability)

- [x] 5.4 Cover project status output
      `packages/cli/test/commands/project/status.spec.ts`: snapshot options include `includeOverlaps: true`; json/toon has `overlaps`; text shows `(none)` or spec id plus change names
      Approach: reuse the existing host/snapshot test doubles; assert the handler does not call kernel `getProjectSummary` or `detectOverlap`
      (Req: includes active-change overlaps (always))

- [x] 5.5 Run the targeted Vitest files
      Run the three package test commands from the design Testing section and fix failures in the files above
      Approach: `pnpm --filter @specd/core exec vitest run test/application/use-cases/get-project-summary.spec.ts test/composition/use-cases/get-project-summary.spec.ts`, then the sdk and cli filters named in the design
      (Req: Kernel exposes use case)

## 6. Audit follow-up

- [x] 6.1 Align project status spec counts and overlap output path
      Spec counts come from the snapshot. Command json/toon copies `snapshot.summary.overlaps` to root `overlaps`.
      (Req: includes spec counts, includes active-change overlaps (always))

- [x] 6.2 Drop assertUnlocked from the snapshot graph-health call
      `GetGraphHealth.execute` receives config, provider, codeGraphVersion, and workspaces only.
      (Req: buildProjectStatusSnapshot orchestration)

- [x] 6.3 Update existing docs and fill the missing overlap tests
      `docs/core/use-cases.md`, `docs/cli/cli-reference.md`, `docs/cli/project.md`, and the code-graph health example. Tests use given/when/then titles and cover the empty report, json/toon root field, and `--graph` snapshot options.
      (Req: includes active-change overlaps (always))

## 7. Audit revision

- [x] 7.1 Record project.getProjectSummary on the kernel map
      The `kernel.project` table and the project-group scenario name `GetProjectSummary`. Do not edit `kernel.ts`. Do not map `resolveContextSpecs`.
      (Req: Kernel entry mapping)

- [x] 7.2 Correct the project status --graph doc line
      In `docs/cli/project.md`, `--graph` is extended statistics and hotspots. Freshness stays on the default command. The command does not index.
      (Req: supports --graph flag)

## 8. Kernel map sync

- [x] 8.1 Confirm the kernel tables match createKernel
      The spec and verify deltas name every mounted key, including `resolveContextSpecs`, and the specs resolve path is `resolve`. Do not edit `kernel.ts`.
      (Req: Kernel entry mapping)

## 9. Audit contract follow-up

- [x] 9.1 Start spec counts from the workspace list
      In `GetProjectSummary.execute`, chain `specRepo.count()` off `ListWorkspaces` inside the concurrent batch. Do not wait for change-bucket counts or `DetectOverlap`. Add a test where a pending change count does not block spec counts after workspaces resolve.
      (Req: Parallelizes independent queries)

- [x] 9.2 Align project status help schema
      The after-help schema shows `overlaps` as present and `approvals.specEnabled` / `signoffEnabled`, plus `isExternal` and `codeRoot` on each workspace. Cover it with a help-text test.
      (Req: help schema matches the command payload)

- [x] 9.3 Update the stale docs
      `docs/core/ports.md` example matches `GetProjectSummaryDeps`, including `detectOverlap`. `docs/core/overview.md` states that `includeOverlaps: true` loads active changes. `docs/guide/cli.md` mentions always-on overlaps. `docs/cli/cli-reference.md` lists `isExternal` and `codeRoot` on workspaces.
      (Req: help schema matches the command payload)

## 10. Constraint bullet

- [x] 10.1 Replace the concatenated kernel constraint
      `deltas/core/kernel/spec.md.delta.yaml`: the Constraints item is one bullet. Remove the label `` `createKernelInternals` is not exported from `@specd/core` — it is internal to the composition layer ``. Add `` `createKernel` does not export `createKernelInternals`. Project VCS and actor resolution stay on `CompositionResolver`. ``
      Approach: `removed` plus `added`. Do not use list-item `modified`, which keeps the old label. Do not edit `kernel.ts`.
      (Req: Project-level VCS and actor adapters must use auto-detect)
