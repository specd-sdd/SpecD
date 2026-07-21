# Tasks: show-spec-diff-during-validate

## 1. Core diff error contract

- [x] 1.1 Add the dedicated diff-generation error type to the port
      `packages/core/src/application/ports/diff-generator.ts`: `DiffGenerationError` — export the typed non-fatal error contract used to distinguish diff-surface failures from merge failures.
      Approach: add a named `Error` subclass beside `DiffGeneratorInput`/`DiffGenerator`; keep the existing `generate(input): string` signature unchanged and support `cause`.
      (Req: Error contract)

- [x] 1.2 Wrap infrastructure diff failures with the typed error
      `packages/core/src/infrastructure/diff/diff-generator.ts`: `DiffDiffGenerator.generate()` — normalize concrete library failures and unusable outputs into `DiffGenerationError`.
      Approach: wrap `createTwoFilesPatch(...)` in `try/catch`, rethrow `DiffGenerationError` with `cause`, and reject blank or non-usable patch payloads before returning.
      (Req: Output contract, Error contract, Default context lines)

- [x] 1.3 Lock the diff contract with infrastructure tests
      `packages/core/test/infrastructure/diff/diff-generator.spec.ts`: `DiffDiffGenerator` suite — cover success, empty-base behavior, and typed error raising.
      Approach: keep the current plain unified diff assertions, then add failure-path tests that expect `DiffGenerationError` instead of generic `Error`.
      (Req: Input contract, Output contract, Error contract)

## 2. PreviewSpec warning-only diff fallback

- [x] 2.1 Catch `DiffGenerationError` without downgrading merged preview entries
      `packages/core/src/application/use-cases/preview-spec.ts`: `PreviewSpec.execute()` — preserve merged preview files when diff generation fails after merge.
      Approach: build `files` entries first, then run diff generation only for `status: 'merged'` entries inside a dedicated `try/catch` that handles `DiffGenerationError` by appending a warning and leaving `status`, `base`, and `merged` untouched.
      (Req: Diff generation, Error handling, Result shape)

- [x] 2.2 Preserve config-based default wiring for the new error-capable diff generator
      `packages/core/src/composition/use-cases/preview-spec.ts`, `packages/core/src/composition/diff-generator.ts`, `packages/core/src/composition/composition-resolver.ts`: `createPreviewSpec()`, `createDefaultDiffGenerator()`, `getDiffGenerator()` — ensure the existing factory/resolver path continues to supply the default implementation.
      Approach: keep dependency signatures stable, rely on the existing resolver, and adjust only imports/types needed by the new error class.
      (Req: Ports and constructor, Config-based factory delegates through resolvePreviewSpecDeps, Default implementation)

- [x] 2.3 Update PreviewSpec tests for typed diff failures
      `packages/core/test/application/use-cases/preview-spec.spec.ts`: diff-generation describe block — replace generic failure expectations with `DiffGenerationError` coverage and assert warning-only partial results.
      Approach: use a stub diff generator that throws `DiffGenerationError`, assert `files[0].status === 'merged'`, `diff` omitted, warning recorded, and existing merge-failure tests still hit `missing`.
      (Req: Diff generation, Error handling, Result shape)

## 3. CLI inline diff rendering

- [x] 3.1 Add the qualifying inline-diff path to single-artifact change validation
      `packages/cli/src/commands/change/validate.ts`: `executeSingle()` — show inline diff only for successful individual `scope: spec` validations backed by existing deltas.
      Approach: after `kernel.changes.validate.execute()` passes, call `kernel.changes.preview.execute({ name, specId, includeDiff: true })`, filter to the requested artifact, require `status: 'merged'` and `base !== null`, then append the diff while omitting the normal preview hint.
      (Req: Output on success)

- [x] 3.2 Add the non-fatal fallback note when inline diff cannot be produced
      `packages/cli/src/commands/change/validate.ts`: single-spec text rendering helpers — keep validation success intact and print the artifact-filtered `spec-preview --diff` command when preview warns about diff-generation failure.
      Approach: inspect the filtered preview entry and warnings; if validation passed but no inline diff is available from the qualifying path, keep file lines and structural note, omit inline diff, and add the fallback note only for that single-artifact spec flow.
      (Req: Output on success, Output on failure, Structural validation scope)

- [x] 3.3 Preserve existing failure and batch behavior
      `packages/cli/src/commands/change/validate.ts`: `executeSingle()` and `executeBatch()` — ensure failed validations and `--all` runs never emit inline diff review.
      Approach: guard the new preview call behind `passed === true`, `opts.artifact !== undefined`, `requestedArtifactScope === 'spec'`, and non-batch execution; leave JSON/toon and batch output shapes untouched.
      (Req: Output on failure, Batch mode (--all), Unknown artifact ID)

- [x] 3.4 Extend CLI command tests for inline diff and fallback behavior
      `packages/cli/test/commands/change-validate.spec.ts`: `change validate` suite — add coverage for inline diff success, fallback note on typed diff failure, no inline diff on failed validation, and unchanged batch output.
      Approach: mock `kernel.changes.preview.execute` only for the qualifying single-artifact path, assert preview hints disappear on inline success, assert fallback command includes `--diff --artifact`, and keep existing `--all` assertions intact.
      (Req: Output on success, Output on failure, Batch mode (--all))

## 4. Skill and package documentation updates

- [x] 4.1 Update shared workflow guidance for inline diff review
      `packages/skills/templates/shared/shared.md.tpl`: structural validation vs content review section — teach agents to inspect inline diff first for successful single-artifact spec validations and use `spec-preview --diff --artifact` only as fallback.
      Approach: keep the broader merged-preview guidance for overlap/drift review, but add the new narrow-path rule and preserve the scope distinction between spec-scoped and change-scoped artifacts.
      (Req: Structural Validation and Content Review)

- [x] 4.2 Update skill-specific validate/review steps that currently assume `spec-preview`
      `packages/skills/templates/skills/specd-design/SKILL.md.tpl`, `packages/skills/templates/skills/specd-verify/SKILL.md.tpl`: validate/review instructions — align them with the new inline diff path without weakening broader merged-preview verification.
      Approach: in `specd-design`, replace the unconditional post-validate preview step for spec-scoped single-artifact review with “review inline diff when shown”; in `specd-verify`, clarify that `spec-preview` remains for broader merged verification, not the narrow validate success case.
      (Req: Structural Validation and Content Review)

- [x] 4.3 Record the workflow-facing change in the skills package changelog
      `packages/skills/CHANGELOG.md`: changelog entry — document that validate can now surface inline diffs for qualifying spec-delta validations and that skills were updated accordingly.
      Approach: add a concise dated entry in the existing format so package consumers can trace the behavior change.
      (Req: Structural Validation and Content Review)

## 5. Verification and readiness

- [x] 5.1 Run focused automated tests for CLI, core use case, and diff infrastructure
      `packages/cli/test/commands/change-validate.spec.ts`, `packages/core/test/application/use-cases/preview-spec.spec.ts`, `packages/core/test/infrastructure/diff/diff-generator.spec.ts`: affected suites — confirm the new contracts and non-regressions.
      Approach: run the narrowest package-filtered test commands that cover the touched files before broader validation.
      (Req: Output on success, Output on failure, Diff generation, Error handling)

- [x] 5.2 Manually verify the qualifying single-artifact path and unchanged batch path
      `packages/cli/src/commands/change/validate.ts`: end-to-end command behavior — confirm inline diff, fallback note, failed-validation suppression, and `--all` stability.
      Approach: run the command shapes listed in design.md manual verification, compare stdout/exit codes to the new contract, and only then mark the change ready.
      (Req: Output on success, Output on failure, Batch mode (--all), Structural Validation and Content Review)
