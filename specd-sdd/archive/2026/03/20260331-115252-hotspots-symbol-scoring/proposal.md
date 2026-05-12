# Proposal: hotspots-symbol-scoring

## Motivation

`specd graph hotspots` is intended to surface symbols that are genuinely risky to
change, but its current scoring can overvalue file-level import centrality and bury the
symbol-level signal users actually need for review and impact analysis.

## Current behaviour

Today `packages/code-graph/src/domain/services/compute-hotspots.ts` gives every symbol
in a file the full importer count of that file, using the score formula
`sameWorkspaceCallers * 3 + crossWorkspaceCallers * 5 + fileImporters`. That means
symbols with little or no direct caller evidence can rank highly just because they live
in a heavily imported file, and importer-only symbols can still appear as hotspots.

## Proposed solution

Adjust hotspot ranking so symbol-level caller evidence is the primary signal and
file-level importer data becomes a secondary signal. Update the hotspot specifications
and CLI-facing contract so the ranking better reflects change risk while keeping the
command usable for day-to-day prioritization and exploration. As part of that default
behavior, focus the default hotspot view on `class`, `method`, and `function` symbols
instead of including noisier kinds such as `variable`. If the user explicitly passes
`--kind`, that explicit filter fully replaces the default kind set rather than merging
with it. Other options should override only their own defaults rather than silently
dropping the whole default hotspot policy. By default, symbols with no direct callers
should not surface as hotspots solely because their containing file is widely imported;
file-level importer data should strengthen symbol-level evidence, not replace it. That
broader importer-only view should only appear when the user explicitly opts into it
with a dedicated flag such as `--include-importer-only`. Lowering `--min-score`
alone should not silently change the population being ranked.

## Specs affected

### New specs

- none

### Modified specs

- `code-graph:code-graph/hotspots`: revise hotspot scoring and default ranking
  semantics so file-level import counts no longer dominate symbol-level results, and
  define the default hotspot view around `class`, `method`, and `function`. Also
  change the default scoring behavior so importer-only symbols do not appear as
  hotspots unless the user explicitly opts into a broader importer-only view with a
  dedicated CLI option.
  - Depends on (added): none
- `cli:cli/graph-hotspots`: update the command contract if the default ranking or
  default kind behavior changes at the user-visible CLI layer, including the default
  `--kind` set used when no explicit kind filter is provided and the override semantics
  when `--kind` is passed explicitly. The CLI help output should make this behavior
  explicit so users can tell the difference between the default ranking view and an
  explicit kind filter. The existing CLI documentation in `docs/` should also be
  updated to describe the default kind set and the override behavior clearly.
  - Depends on (added): none

## Impact

- `packages/code-graph/src/domain/services/compute-hotspots.ts`
- `packages/code-graph/src/domain/value-objects/hotspot-result.ts`
- `packages/code-graph/src/composition/code-graph-provider.ts`
- `packages/code-graph/test/domain/services/compute-hotspots.spec.ts`
- `packages/cli/src/commands/graph/hotspots.ts`
- `packages/cli/test/commands/graph-hotspots.spec.ts`
- `docs/cli/cli-reference.md`

The main behavioral impact is on hotspot ranking, filtering defaults, and the
interpretation of hotspot output. No external dependency or storage format change has
been identified at proposal stage.

## Technical context

- The issue is framed as a hotspot computation and scoring problem, not a language
  extraction problem.
- The current implementation already matches the issue's complaint: symbols inherit
  full file importer counts from their containing file.
- `getHotspots()` in `packages/code-graph/src/composition/code-graph-provider.ts`
  delegates directly to `computeHotspots()`, so the likely center of change is the
  domain service rather than composition wiring.
- The default product behavior should emphasize change-worthy symbols, so the default
  hotspot view is now intended to focus on `class`, `method`, and `function`, leaving
  noisier kinds such as `variable` and `interface` to explicit filtering.
- The kind-filter contract is now explicit: omitted `--kind` uses the default hotspot
  kinds, while an explicit `--kind` argument completely overrides that default set.
- The broader default-removal rule turned out to be too aggressive in repos with weak
  symbol-level `CALLS` coverage, because flags such as `--min-risk MEDIUM` unexpectedly
  re-enable importer-only symbols. The contract needs to be narrowed so each option only
  overrides its own default.
- The default ranking behavior is also now explicit: file-level importer counts are a
  secondary signal for symbols that already have direct symbol-level evidence, not a
  standalone path into the default hotspot list.
- Because this behavior is user-visible and non-obvious, the command help and CLI
  reference in `docs/cli/` should both spell it out clearly instead of relying on
  inference.
- Existing tests already cover both the domain service and the CLI command, so this
  change should extend current test suites rather than introduce a new test surface.
- The code graph was reindexed during design setup, and the current hotspot output still
  shows many importer-heavy entries, reinforcing the need for a scoring change.
- The change must continue to respect global constraints: pure domain services,
  hexagonal package boundaries, Vitest tests under `test/`, and CLI docs updates when
  user-visible behavior changes.

## Open questions

- What exact scoring rule should replace or refine the current formula?
- The exact weighting formula should be decided in `design.md`, not frozen into the
  proposal, so future tuning does not require proposal churn for every numeric change.
