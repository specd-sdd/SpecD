# Proposal: move-diff-to-core

## Motivation

Unified diff generation currently lives exclusively in the CLI layer. HTTP API and MCP consumers also need preview diffs, and duplicating that logic across hosts would create drift in output and maintenance cost. This change moves diff generation to the shared preview capability in core so every host can reuse the same behavior.

## Current behaviour

The CLI `specd changes spec-preview --diff` generates unified diffs directly in [`packages/cli/src/commands/change/spec-preview.ts`](/Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/spec-preview.ts:1) with `createTwoFilesPatch` from the `diff` package. [`PreviewSpec`](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/preview-spec.ts:13) in core returns `base` and `merged` content only, so any non-CLI host that needs diffs must either reimplement the same transformation or call into CLI-only logic.

## Proposed solution

Extend core `PreviewSpec` so it can optionally return a unified diff alongside `base` and `merged` for changed files. Diff generation becomes part of the shared preview use case rather than a CLI-only post-processing step. Hosts that want diffs opt in through the use-case input, and hosts that only need merged content keep the existing lightweight path.

To avoid binding the use case directly to one diff library, `PreviewSpec` depends on a narrow diff-generation capability and core provides the default implementation internally. The CLI remains a thin presentation adapter: it requests diff-enabled previews when `--diff` is passed and keeps text colorization as a CLI concern. HTTP API and MCP can reuse the same preview result shape without duplicating the merge-to-diff transformation.

## Specs affected

### New specs

- `core:diff-generator`: define the internal diff-generation capability used by `PreviewSpec`, with a default core implementation that can change libraries later without rewriting the use case contract.
  - Depends on: none

### Modified specs

- `core:preview-spec`: expand the preview contract so callers can request unified diff output from the shared core use case instead of relying on CLI-local diff generation, while keeping diff production behind the diff-generator capability.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:change-spec-preview`: stop generating unified diffs in the command itself and consume diff data returned by `PreviewSpec`.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `@specd/core`: [`packages/core/src/application/use-cases/preview-spec.ts`](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/preview-spec.ts:1) changes its input/result contract to support opt-in diff generation.
- `@specd/core`: add a diff-generation port plus a default core factory or adapter that encapsulates whichever library is used to produce unified diffs.
- `@specd/core`: [`packages/core/src/composition/use-cases/preview-spec.ts`](/Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/preview-spec.ts:1) will need extra dependency wiring so config-based and explicit-deps factory paths both construct `PreviewSpec` with the default diff generator.
- `@specd/core`: `PreviewSpec` has CRITICAL graph impact and is consumed by `CompileContext`, composition factories, kernel wiring, and a broad test surface, so the change must preserve default behavior for callers that do not request diffs.
- `@specd/core`: `packages/core/package.json` will need the runtime diff dependency because the default implementation moves into core, but the use case remains isolated from that choice.
- `@specd/cli`: [`packages/cli/src/commands/change/spec-preview.ts`](/Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/spec-preview.ts:1) stops calling `createTwoFilesPatch` directly and uses diff data returned from the core use case; CLI-only colorization remains in place.
- Tests: core preview tests and CLI command tests will need coverage for diff-present and diff-disabled paths.

## Technical context

- The current code already concentrates preview merge logic in `PreviewSpec` and leaves diff generation as a final CLI transformation. That split is the source of host duplication.
- `PreviewSpec` is a high-impact core use case: graph impact shows 63 affected files, including `CompileContext`, composition factories, kernel wiring, and broad test helpers. For that reason, the proposal keeps diff generation opt-in instead of always-on.
- The current CLI implementation calls `createTwoFilesPatch` in two places and also synthesizes diff strings for structured output. Moving that transformation to core removes duplicated host logic while preserving CLI presentation responsibilities.
- The existing `core:preview-spec` spec explicitly says diff generation is not part of `PreviewSpec`; this change intentionally revises that constraint.
- The diff capability is intentionally narrow. It exists to keep `PreviewSpec` decoupled from the concrete library, not to create a general-purpose host extension point.
- The default implementation should live in core composition, for example through a `createDefaultDiffGenerator` factory, so the library choice can change later without rewriting the use case or its callers.
- `PreviewSpec` already has the two inputs a unified diff needs for each artifact file: `base` and `merged`. The new behavior should reuse those values; it does not require loading a second independent source beyond the existing preview pipeline.
- The current `PreviewSpecInput` only accepts `name` and `specId`, and `PreviewSpecFileEntry` currently exposes `filename`, `base`, `merged`, and `status`. The spec work will need to define one opt-in input flag for diff generation and one optional output field for the generated diff, while keeping the default contract compatible for callers that ignore diffs today.
- The diff should only be generated for entries whose preview status is `merged`. `no-op` and `missing` entries should continue to return their current preview semantics and should not force synthetic diff output.
- The current CLI uses 3 context lines and names the two diff sides as `a/<filename> (base)` and `b/<filename> (merged)`. If that output shape is part of the intended compatibility surface, the specs should say so explicitly; otherwise they should clarify what parts are host presentation and what parts belong to the shared diff payload.
- CLI responsibilities that should remain outside core: ANSI colorization via `chalk`, separator rendering for text output, artifact filtering UX, and stderr presentation of warnings. Core should return plain data only.
- Composition implications are real, even if the diff capability stays internal. `PreviewSpecDeps` and `resolvePreviewSpecDeps()` currently only provide `changes`, `specs`, `schemaProvider`, and `parsers`; the specs should state whether diff generation becomes a constructor dependency of `PreviewSpec` and how the default implementation is resolved for both explicit-deps and config-based factory paths.
- The specs should also pin the boundary with `CompileContext`: because `CompileContext` consumes `PreviewSpec` for materialized views, requesting diffs must be opt-in and the default path must not generate or require diff data for context compilation.
- Test expectations that will matter downstream:
  - core unit tests should cover `includeDiff` disabled, enabled with merged output, and enabled with `no-op`/`missing` files
  - composition tests should confirm the default diff generator is wired in config-based construction
  - CLI tests should confirm `--diff` consumes returned diff data rather than calling the diff library inline
- The output should keep plain unified diff strings in core and leave ANSI colorization in CLI only.

## Open questions

None at proposal stage. The remaining detail is design-level: how the optional diff flag and result field are named, as long as the default non-diff path remains backward-compatible for existing callers.
