# Tasks: move-diff-to-core

## 1. Diff capability

- [x] 1.1 Add the diff-generator port types
      `packages/core/src/application/ports/diff-generator.ts`: `DiffGeneratorInput`, `DiffGenerator` — define the application-layer contract that `PreviewSpec` will consume.
      Approach: add a file-oriented input object with `filename`, `base`, `merged`, and optional `contextLines`, plus a single `generate(input): string` method so the use case stays decoupled from the concrete library.
      (Req: Interface shape, Input contract, Output contract)

- [x] 1.2 Implement the core diff generator
      `packages/core/src/infrastructure/diff/diff-generator.ts`: `DiffDiffGenerator` — provide the concrete library-backed implementation used by core composition.
      Approach: implement the `DiffGenerator` port behind a concrete class, emit plain unified diff text, use labels `a/<filename> (base)` and `b/<filename> (merged)`, and default to 3 context lines when omitted.
      (Req: Output contract, Default context lines, Default implementation)

- [x] 1.3 Add the composition default factory
      `packages/core/src/composition/diff-generator.ts`: `createDefaultDiffGenerator()` — make composition the only place that chooses the default implementation.
      Approach: import `DiffDiffGenerator` from infrastructure, return it as the `DiffGenerator` port type, and mirror repo patterns such as `createVcsAdapter()` where composition chooses the concrete implementation.
      (Req: Default implementation, Usage boundary)

- [x] 1.4 Move the runtime dependency to core
      `packages/core/package.json`, `packages/cli/package.json`: package manifests — relocate the diff runtime dependency from CLI to core and remove the direct CLI dependency if it becomes unused.
      Approach: keep `chalk` in CLI, add the diff library only where `DiffDiffGenerator` needs it, and refresh the lockfile if the workspace dependency graph changes.
      (Req: Default implementation, Usage boundary)

## 2. PreviewSpec core behavior

- [x] 2.1 Extend PreviewSpec input and result contracts
      `packages/core/src/application/use-cases/preview-spec.ts`: `PreviewSpecInput`, `PreviewSpecFileEntry`, `PreviewSpecResult` — add opt-in diff request and optional diff output without breaking existing callers.
      Approach: add `includeDiff?: boolean` on input and `diff?: string` on file entries, keeping both optional so omitted paths preserve the old contract.
      (Req: Input, Result shape)

- [x] 2.2 Inject DiffGenerator into PreviewSpec
      `packages/core/src/application/use-cases/preview-spec.ts`: `PreviewSpec` constructor — add the port dependency required for shared diff generation.
      Approach: accept `diffGenerator: DiffGenerator` as a constructor argument and store it alongside the existing repositories, schema provider, and parser registry.
      (Req: Ports and constructor)

- [x] 2.3 Generate diffs only for merged preview entries
      `packages/core/src/application/use-cases/preview-spec.ts`: `execute()` — add opt-in diff generation after merged preview content is computed.
      Approach: keep existing preview assembly unchanged, then when `includeDiff === true` call `diffGenerator.generate({ filename, base: entry.base ?? '', merged: entry.merged })` only for `status === 'merged'`; never call it for `no-op` or `missing`.
      (Req: Diff generation, Delta application, Artifact file ordering)

- [x] 2.4 Preserve tolerant preview behavior when diff generation fails
      `packages/core/src/application/use-cases/preview-spec.ts`: `execute()` warning path — keep merged preview data even if diff synthesis throws.
      Approach: catch diff-generator errors separately from delta-application errors, append a warning, omit `diff`, and preserve the existing `merged` entry instead of degrading it to `missing`.
      (Req: Diff generation, Error handling)

- [x] 2.5 Keep CompileContext on the non-diff path
      `packages/core/src/application/use-cases/compile-context.ts` and any direct callers/stubs of `PreviewSpec.execute()` — ensure context compilation remains unaffected by the new optional capability.
      Approach: do not change existing `PreviewSpec.execute()` call sites unless they explicitly need diff output; rely on omitted `includeDiff` to preserve behavior and cost.
      (Req: Input, Diff generation)

## 3. Core composition wiring

- [x] 3.1 Add resolver support for the internal diff capability
      `packages/core/src/composition/composition-resolver.ts`: `CompositionResolver`, `createCompositionResolver()` — expose one memoized getter for the default diff generator.
      Approach: add `getDiffGenerator(): DiffGenerator` to the resolver interface and call `createDefaultDiffGenerator()` lazily once per composition session, making composition the only place that decides the default implementation and avoiding any new public registration surface.
      (Req: Default implementation, Usage boundary)

- [x] 3.2 Wire diffGenerator into PreviewSpec factory deps
      `packages/core/src/composition/use-cases/preview-spec.ts`: `PreviewSpecDeps`, `resolvePreviewSpecDeps()`, `createPreviewSpecFromNormalized()` — make both explicit-deps and config-based paths satisfy the new constructor contract.
      Approach: extend `PreviewSpecDeps` with optional `diffGenerator`, resolve it from `resolver.getDiffGenerator()` for config-based construction, and have `createPreviewSpecFromNormalized()` fall back to `createDefaultDiffGenerator()` when explicit deps omit it before calling `new PreviewSpec(...)`.
      (Req: Config-based factory delegates through resolvePreviewSpecDeps, Default implementation)

- [x] 3.3 Keep kernel-facing construction unchanged for consumers
      `packages/core/src/composition/kernel.ts` and any compile-time type consumers of `PreviewSpecDeps` — ensure the kernel still exposes the same `changes.preview` use case surface.
      Approach: rely on the updated `createPreviewSpec()` wiring rather than adding new kernel APIs; only fix type fallout from the expanded dependency set.
      (Req: Config-based factory delegates through resolvePreviewSpecDeps, Usage boundary)

## 4. CLI adoption

- [x] 4.1 Request diff-enabled previews in CLI diff mode
      `packages/cli/src/commands/change/spec-preview.ts`: `registerChangeSpecPreview()` action — switch diff mode to ask core for diff output instead of recomputing it locally.
      Approach: call `kernel.changes.preview.execute({ name, specId, includeDiff: true })` only when `opts.diff === true`, and keep the existing non-diff call path unchanged.
      (Req: Command signature, Text output — diff mode (--diff), JSON/TOON output)

- [x] 4.2 Render returned diff strings in text mode
      `packages/cli/src/commands/change/spec-preview.ts`: text diff branch — consume `file.diff` and preserve CLI-only presentation behavior.
      Approach: sort and filter files as today, skip entries without `diff`, print `--- <filename> ---`, and colorize each returned diff line with the existing `chalk` rules.
      (Req: Text output — diff mode (--diff))

- [x] 4.3 Forward diff fields unchanged in structured output
      `packages/cli/src/commands/change/spec-preview.ts`: JSON/TOON branch — stop synthesizing diff strings in CLI.
      Approach: after artifact filtering, emit the `PreviewSpecResult` from core directly when `--diff` is set, preserving plain `diff` strings and leaving ANSI output exclusive to text mode.
      (Req: JSON/TOON output, Constraints)

- [x] 4.4 Remove local diff synthesis code paths
      `packages/cli/src/commands/change/spec-preview.ts`: imports and helper logic — eliminate direct `createTwoFilesPatch` usage from CLI now that core owns diff generation.
      Approach: delete the diff-library import and any structured-output synthesis branch that reconstructs diffs from `base` and `merged`.
      (Req: Text output — diff mode (--diff), JSON/TOON output, Constraints)

## 5. Automated tests

- [x] 5.1 Cover PreviewSpec constructor and input changes
      `packages/core/test/application/use-cases/preview-spec.spec.ts`: `PreviewSpec` describe blocks — update constructor expectations and add `includeDiff` opt-in coverage.
      Approach: assert the new dependency is accepted, omitted `includeDiff` leaves diff generation disabled, and `includeDiff: true` enables the new path.
      (Req: Ports and constructor, Input)

- [x] 5.2 Cover PreviewSpec diff generation behavior
      `packages/core/test/application/use-cases/preview-spec.spec.ts`: merged/new/no-op/missing scenarios — verify the new `diff` field semantics and warning fallback behavior.
      Approach: add tests for merged existing files, new files with empty base, omitted diff on `no-op`/`missing`, and warning retention when the diff generator throws.
      (Req: Diff generation, Result shape, Error handling)

- [x] 5.3 Cover diff-generator implementation
      `packages/core/test/infrastructure/diff/diff-generator.spec.ts`: new describe block — verify plain unified diff semantics independent of PreviewSpec.
      Approach: assert label format, default 3 context lines, plain string output, and empty-base handling for newly introduced files.
      (Req: Input contract, Output contract, Default context lines, Default implementation)

- [x] 5.4 Cover the composition default factory
      `packages/core/test/composition/diff-generator.spec.ts`: new describe block — verify composition chooses the default implementation.
      Approach: assert `createDefaultDiffGenerator()` returns the port type and centralizes the default implementation choice instead of exposing that decision in infrastructure.
      (Req: Default implementation, Usage boundary)

- [x] 5.5 Cover composition wiring for PreviewSpec
      `packages/core/test/composition/use-cases/preview-spec.spec.ts`: config-based and explicit-deps construction — verify the new dependency is wired correctly.
      Approach: assert `resolvePreviewSpecDeps()` includes `diffGenerator`, config-based factory construction succeeds with the default implementation, and explicit deps without `diffGenerator` still receive the composition default.
      (Req: Config-based factory delegates through resolvePreviewSpecDeps, Default implementation)

- [x] 5.6 Update shared core stubs and CompileContext expectations
      `packages/core/test/application/use-cases/helpers.ts`, `packages/core/test/application/use-cases/compile-context.spec.ts`: `PreviewSpec` helpers and compile-context tests — keep non-diff consumers compatible.
      Approach: expand stubs to tolerate optional `diff` and constructor changes, and keep compile-context tests on the default non-diff path.
      (Req: Input, Diff generation, Usage boundary)

- [x] 5.7 Cover CLI diff adoption
      `packages/cli/test/commands/change/spec-preview.spec.ts`: diff-mode and structured-output scenarios — verify CLI consumes returned diffs instead of synthesizing them.
      Approach: assert `includeDiff: true` is passed, text mode renders returned `diff`, JSON/TOON forwards `diff` unchanged, and files without `diff` are omitted from diff mode.
      (Req: Text output — diff mode (--diff), JSON/TOON output, Error handling, Artifact filtering errors)

## 6. Verification and cleanup

- [x] 6.1 Run targeted core and CLI test suites
      `packages/core` and `packages/cli`: automated verification — confirm all changed paths pass after the refactor.
      Approach: run the relevant core preview/composition tests, the new diff-generator tests, and the CLI `change spec-preview` tests before marking implementation ready.
      (Req: all verify scenarios)

- [x] 6.2 Run lint for the touched workspaces
      `packages/core`, `packages/cli`: lint validation — ensure the new port, factory, and adapter changes obey global conventions and JSDoc expectations.
      Approach: run workspace lint commands after code and tests are green; fix any no-default-export, ESM, or docs-style regressions immediately.
      (Req: Constraints)

- [x] 6.3 Manually verify non-diff and diff CLI behavior
      `node packages/cli/dist/index.js changes spec-preview ...`: manual / E2E verification — confirm external behavior stays stable while diff ownership moves to core.
      Approach: run text merged mode, text diff mode, and structured diff mode against an active change; verify merged output is unchanged, diff output still matches current format, and warnings remain on stderr.
      (Req: Text output — merged mode (no --diff), Text output — diff mode (--diff), JSON/TOON output, Drift and overlap review support)

- [x] 6.4 Confirm no docs/ update is required
      `docs/`: documentation impact review — explicitly close the documentation question before ready.
      Approach: verify the change does not alter user-facing command syntax or documented workflows; if that assumption becomes false during implementation, add a follow-up docs task before completion.
      (Req: Constraints)
