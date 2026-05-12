# Tasks: hotspots-symbol-scoring

## 0. Follow-up correction

- [x] 0.1 Separate importer-only widening from `--min-score`
      `.specd/changes/20260331-115252-hotspots-symbol-scoring/`: proposal, deltas, design, tasks — replace the overloaded `--min-score 0` widening contract with an explicit `--include-importer-only` switch
      Approach: keep `--min-score` as a pure numeric threshold and move importer-only inclusion to a dedicated flag throughout the change artifacts
      (Req: Requirement: Smart defaults with automatic removal, Requirement: Command signature)

## 1. Artifact correction

- [x] 1.1 Update proposal and deltas for per-option defaults
      `.specd/changes/20260331-115252-hotspots-symbol-scoring/`: proposal, spec deltas, verify deltas, design — replace the blanket “any filter removes all defaults” rule with per-option override semantics
      Approach: `--kind` replaces only default kinds; `--min-risk`, `--limit`, and scope flags only override their own defaults; importer-only symbols stay excluded unless explicitly widened with `--include-importer-only`
      (Req: Requirement: Smart defaults with automatic removal, Requirement: Command signature)
- [x] 1.2 Refresh the task plan to match the corrected semantics
      `.specd/changes/20260331-115252-hotspots-symbol-scoring/tasks.md`: reset implementation tasks around per-option defaults and re-verification
      Approach: remove completed-state assumptions from the previous implementation pass and capture the new work explicitly
      (Req: Requirement: Smart defaults with automatic removal)

## 2. Domain scoring model

- [x] 2.1 Replace binary default-view detection with per-option default resolution
      `packages/code-graph/src/domain/services/compute-hotspots.ts`: `computeHotspots()` — derive `kinds`, `minScore`, `minRisk`, `limit`, and importer-only inclusion independently instead of using “default vs explicit view”
      Approach: remove `isDefaultHotspotView()`, introduce a helper that resolves effective defaults field by field, and keep the existing batch-query structure
      (Req: Requirement: Smart defaults with automatic removal)
- [x] 2.2 Keep the capped scoring formula while changing importer-only gating
      `packages/code-graph/src/domain/services/compute-hotspots.ts`: `computeHotspots()` — preserve the new score formula but only allow importer-only entries when the query is explicitly widened with `includeImporterOnly = true`
      Approach: keep `directCallers`-first scoring for caller-backed entries and gate `findSymbols(...)` importer-only additions on explicit `includeImporterOnly: true`
      (Req: Requirement: Batch hotspot scoring, Requirement: Risk level)
- [x] 2.3 Preserve shared default hotspot kinds
      `packages/code-graph/src/domain/value-objects/hotspot-result.ts`: `DEFAULT_HOTSPOT_KINDS` — keep `class`, `method`, and `function` as the shared default kind set after the semantic rewrite
      Approach: retain the constant and keep `HotspotOptions.kinds` as an explicit override only
      (Req: Requirement: Filtering)

## 3. CLI command semantics and docs

- [x] 3.1 Update `graph hotspots` option construction
      `packages/cli/src/commands/graph/hotspots.ts`: `registerGraphHotspots()` — stop clearing all defaults whenever any flag is present
      Approach: pass only explicit user options, keep `--kind` as the only default-kind override, and update help text to explain per-option defaults plus `--include-importer-only` widening
      (Req: Requirement: Command signature, Requirement: Kind filter semantics)
- [x] 3.2 Keep `parseGraphKinds()` narrow
      `packages/cli/src/commands/graph/parse-graph-kinds.ts`: `parseGraphKinds()` — confirm it remains validation-only and does not acquire defaulting logic
      Approach: leave the parser untouched unless a minimal signature change is needed
      (Req: Requirement: Kind filter semantics)
- [x] 3.3 Update CLI docs
      `docs/cli/cli-reference.md`: `### graph hotspots` — explain per-option defaults, `--kind` replacement semantics, and importer-only widening via `--include-importer-only`
      Approach: edit the option table and prose so `--min-risk MEDIUM` no longer implies a broader query than the default
      (Req: Requirement: CLI reference documentation)

## 4. Automated verification

- [x] 4.1 Rewrite domain tests around per-option defaults
      `packages/code-graph/test/domain/services/compute-hotspots.spec.ts`: `describe('computeHotspots', ...)` — assert that `minRisk`, `limit`, `workspace`, and `minScore` do not disable default kinds or importer-only exclusion, while `includeImporterOnly: true` explicitly widens the query
      Approach: keep the in-memory graph store setup and add focused tests for `--min-risk MEDIUM`-style cases
      (Req: Requirement: Smart defaults with automatic removal, Requirement: Filtering)
- [x] 4.2 Extend CLI tests for per-option override behavior
      `packages/cli/test/commands/graph-hotspots.spec.ts`: `describe('graph hotspots', ...)` — verify the exact `getHotspots()` options passed for `--min-risk`, `--limit`, `--kind interface`, `--min-score 0`, and `--include-importer-only`
      Approach: keep mocking `resolveGraphCliContext()` and `withProvider()`, and replace tests that assume “any filter removes defaults”
      (Req: Requirement: Command signature, Requirement: Kind filter semantics)
- [x] 4.3 Keep help and docs coverage aligned
      `packages/cli/test/commands/graph-hotspots.spec.ts`: help-text coverage and `docs/cli/cli-reference.md` verification — ensure the user-facing text describes per-option defaults accurately
      Approach: update the existing help assertion and docs-content assertion to mention per-option overrides and `--include-importer-only`
      (Req: Requirement: CLI reference documentation)

## 5. Manual verification

- [x] 5.1 Verify default and near-default CLI behavior end to end
      `packages/cli/src/commands/graph/hotspots.ts`: `registerGraphHotspots()` and `packages/code-graph/src/domain/services/compute-hotspots.ts`: `computeHotspots()` — confirm `graph hotspots` and `graph hotspots --min-risk MEDIUM` behave consistently apart from the requested threshold
      Approach: run both commands against a repo with weak `CALLS` coverage and confirm `--min-risk MEDIUM` does not suddenly re-enable importer-only results
      (Req: Requirement: Smart defaults with automatic removal, Requirement: Output format)
- [x] 5.2 Verify explicit widening and merged spec previews
      `docs/cli/cli-reference.md` and change deltas — confirm `--include-importer-only` widens the query as documented and merged specs match the corrected semantics
      Approach: run `graph hotspots --include-importer-only`, `graph hotspots --kind interface`, and `change spec-preview --diff` for both changed specs
      (Req: Requirement: Kind filter semantics, Requirement: CLI reference documentation)
