# Tasks: add-specs-outline-command

## 1. Core Use Case (`GetSpecOutline`)

- [x] 1.1 Create `GetSpecOutlineInput` and `SpecOutlineResult` interfaces
      `packages/core/src/application/use-cases/get-spec-outline.ts`: New file — define input types
      Approach: Export `GetSpecOutlineInput` with `workspace`, `specPath`, `artifactId?`, and `filename?`. Export `SpecOutlineResult` with `filename` and `outline` array.
      (Req: Input, Result)
- [x] 1.2 Implement `GetSpecOutline` class
      `packages/core/src/application/use-cases/get-spec-outline.ts`: `GetSpecOutline` — implement main logic
      Approach: Constructor takes `specs`, `schemaProvider`, and `parsers`. `execute` method handles logic from design.md: resolve filenames, deduplicate, read files via `SpecRepository`, get parser, parse AST, and call `parser.outline()`. Handle artifact scope validation and throw `DomainError` if scope is not 'spec'.
      (Req: Artifact Resolution, Outline Generation)
- [x] 1.3 Add tests for `GetSpecOutline`
      `packages/core/test/application/use-cases/get-spec-outline.spec.ts`: New file — unit tests
      Approach: Write vitest cases covering all scenarios defined in `verify.md` (resolution, deduplication, parsers) plus additional edge cases and error paths (unknown artifact ID, file not found, non-spec scope validation).
      (Req: Testing from design.md)

## 2. Kernel Integration

- [x] 2.1 Expose `getOutline` on `Kernel` interface
      `packages/core/src/composition/kernel.ts`: `Kernel` — add `getOutline` to `specs` namespace
      Approach: Import `GetSpecOutline` and add `getOutline: GetSpecOutline` to `specs` property type.
- [x] 2.2 Wire `GetSpecOutline` in `createKernel`
      `packages/core/src/composition/kernel.ts`: `createKernel` — instantiate use case
      Approach: Inside `createKernel`'s return object, under `specs`, instantiate `getOutline: new GetSpecOutline(i.specs, schemaProvider, i.parsers)`.

## 3. CLI Command

- [x] 3.1 Implement `specs outline` subcommand
      `packages/cli/src/commands/spec/outline.ts`: New file — command implementation
      Approach: Use commander to build `specs outline <specPath>` mirroring `spec show`. Parse ID, map flags (`--artifact`, `--file`, `--format`), call `kernel.specs.getOutline.execute()`. Render JSON via `JSON.stringify` (for text and json formats) or `output(..., 'toon')`. Handle domain errors nicely via `cliError`.
      (Req: Command Interface, Output Rendering, Error Handling)
- [x] 3.2 Register command in CLI
      `packages/cli/src/index.ts`: Root command setup — register `outline.ts` subcommand
      Approach: Import `outlineCommand` and register it under the `specs` command group.
- [x] 3.3 Add tests for `specs outline` command
      `packages/cli/test/commands/spec/outline.spec.ts`: New file — unit tests
      Approach: Write vitest cases covering all scenarios defined in `verify.md` (flag combinations, output formats, deduplication) plus additional edge cases and CLI-specific error mapping.
      (Req: Testing from design.md)
- [x] 3.4 Add E2E/manual verification checklist
      Approach: Verify manually via `specd specs outline core:core/get-spec-outline --format toon`, checking artifact resolution, deduplication, scope validation, and expected formats.
      (Req: Testing from design.md)

## 4. Documentation

- [x] 4.1 Document `specs outline` in CLI reference
      `docs/cli/cli-reference.md`: Add section for `specd specs outline`
      Approach: Add a new section detailing the `outline` subcommand, explaining `--artifact`, `--file`, and `--format` flags, along with examples.
