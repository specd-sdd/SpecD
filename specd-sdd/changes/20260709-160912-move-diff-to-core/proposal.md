# Proposal: move-diff-to-core

## Motivation

Unified diff generation currently lives exclusively in the CLI layer. The upcoming HTTP API and MCP hosts also need to expose diffs in spec previews, and duplicating the diff logic across hosts is unacceptable. Moving diff generation to the core `PreviewSpec` use case makes it available to all consumers without code duplication.

## Current behaviour

The CLI `specd changes spec-preview --diff` generates unified diffs by importing `createTwoFilesPatch` from the `diff` npm package directly in `packages/cli/src/commands/change/spec-preview.ts`. The core `PreviewSpec` use case returns `base` and `merged` content only and has no concept of diffs. Other hosts (HTTP API, MCP) would need to duplicate this same diff logic.

## Proposed solution

Add a `DiffGenerator` port interface in core's application layer. The `PreviewSpec` use case receives it as an optional constructor dependency. Add an `includeDiff` boolean flag to `PreviewSpecInput` — when `true`, `PreviewSpec` calls `DiffGenerator.generate(base, merged)` for each merged file and includes the result in a new optional `diff` field on `PreviewSpecFileEntry`. When `false` (default), no diff is computed and `DiffGenerator` is not called — zero cost for `CompileContext` and other callers.

The `diff` npm package implementation becomes an infrastructure adapter (`FsDiffGenerator` or similar). The CLI passes `includeDiff: true` when `--diff` is specified. HTTP API and MCP will also pass the flag when their clients request diffs.

## Specs affected

### New specs

- `core:diff-generator`: Port interface for generating unified diffs. Defines `DiffGenerator` as a single-method port: `generate(base: string, merged: string, contextLines?: number): string`. With an infrastructure adapter using the `diff` npm package.
  - Depends on: none

### Modified specs

- `core:preview-spec`: Add `DiffGenerator` port as optional constructor dependency, add `includeDiff` to input, add `diff` to result shape. Remove the constraint that says diff generation is not part of PreviewSpec.
  - Depends on (added): none
  - Depends on (removed): none

- `core:diff-generator` (new): Port spec for the `DiffGenerator` interface — `generate(base: string, merged: string, contextLines?: number): string`. Defines how unified diffs are produced without coupling to the `diff` npm package.
  - Depends on: none

- `cli:change-spec-preview`: Consume pre-computed `diff` from the use case instead of generating it inline.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `@specd/core`: New port `packages/core/src/application/ports/diff-generator.ts` — `DiffGenerator` interface with `generate(base: string, merged: string, contextLines?: number): string`
- `@specd/core`: New infrastructure adapter `packages/core/src/infrastructure/diff/diff-diff-generator.ts` — implementation using `createTwoFilesPatch` from the `diff` package
- `@specd/core`: `packages/core/src/application/use-cases/preview-spec.ts` — add `DiffGenerator` as optional constructor param, use it when `includeDiff` is true
- `@specd/core`: `packages/core/src/application/use-cases/preview-spec.ts` — add `includeDiff?: boolean` to `PreviewSpecInput`, add `diff?: string` to `PreviewSpecFileEntry`
- `@specd/core`: `packages/core/src/composition/use-cases/preview-spec.ts` — wire `DiffGenerator` in `resolvePreviewSpecDeps` and `PreviewSpecDeps`
- `@specd/core`: `packages/core/package.json` — add `diff` as a production dependency, add `@types/diff` as dev dependency
- `@specd/cli`: `packages/cli/src/commands/change/spec-preview.ts` — remove `import { createTwoFilesPatch } from 'diff'`, pass `includeDiff: true`, use `file.diff` from result
- `@specd/cli`: `packages/cli/package.json` — remove `diff` dependency (moved to core)
- Composition: update `PreviewSpecDeps`, `resolvePreviewSpecDeps`, kernel wiring, and kernel builder to include the new port
- Tests: `packages/core/test/application/use-cases/preview-spec.spec.ts` — add scenarios for `diff` field; `packages/cli/test/commands/change/spec-preview.spec.ts` — update if needed

## Technical context

- `diff` package is already in the monorepo (CLI dependency). Moving it to core is a simple `pnpm add diff` in core's package.json.
- `createTwoFilesPatch` is called at lines 135-143 and 169-177 of `packages/cli/src/commands/change/spec-preview.ts`.
- The existing `PreviewSpec` constraint says "Diff generation is NOT part of PreviewSpec" — this change deliberately reverses that.
- `diff` field is optional (omitted/undefined for `no-op` and `missing` status) to keep backward compatibility.
- No colorization in core — plain unified diff strings. Colorization stays in CLI (presentation layer).
- Context lines: 3 (matching current CLI behavior).

## Open questions

None. All decisions were resolved during exploration.
