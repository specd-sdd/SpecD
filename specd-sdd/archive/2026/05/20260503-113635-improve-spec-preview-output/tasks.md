# Tasks: improve-spec-preview-output

## 1. Core: Update PreviewSpec result interfaces

- [x] 1.1 Update `PreviewSpecFileEntry` to include status field
      `packages/core/src/application/use-cases/preview-spec.ts`: `PreviewSpecFileEntry` — add `status: 'merged' | 'no-op' | 'missing'`
      Approach: update the interface definition in the same file as the use case
      (Req: Result shape)
- [x] 1.2 Update `SpecNotInChangeError` message
      `packages/core/src/application/errors/spec-not-in-change-error.ts`: `SpecNotInChangeError` — update constructor to add suggestion
      Approach: append ` Suggestion: use specd specs show <specId>` to the error message string
      (Req: Error handling, scenario: Spec not in change exits with error and suggestion)

## 2. Core: Update PreviewSpec implementation

- [x] 2.1 Refactor `PreviewSpec.execute` to iterate over all schema spec artifacts
      `packages/core/src/application/use-cases/preview-spec.ts`: `PreviewSpec.execute` — loop over `schema.artifacts()` where scope is `spec`
      Approach: instead of only processing artifacts found in the change, iterate over all artifacts the schema expects for a spec
      (Req: Delta application, scenario: All schema artifacts returned)
- [x] 2.2 Implement status recording logic in `execute`
      `packages/core/src/application/use-cases/preview-spec.ts`: `PreviewSpec.execute` — determine status for each artifact
      Approach: record `missing` if artifact/delta not found or application fails; `no-op` if delta has no changes; `merged` otherwise
      (Req: Delta application, scenarios: Delta merged into base spec content, No-op delta records status, Missing delta file records status)
- [x] 2.3 Update error handling in `execute` to be non-throwing
      `packages/core/src/application/use-cases/preview-spec.ts`: `PreviewSpec.execute` — catch application errors and record as `missing`
      Approach: wrap delta application in try/catch; on failure, add warning to result and set status to `missing`
      (Req: Error handling, scenario: Delta application failure produces warning and missing status)

## 3. CLI: Update spec-preview command

- [x] 3.1 Update CLI `PreviewFile` interface to include status
      `packages/cli/src/commands/change/spec-preview.ts`: `PreviewFile` and `isPreviewFile` — add `status` field
      Approach: update local interface and type guard to match core result shape
      (Req: JSON/TOON output)
- [x] 3.2 Implement status labels in text output
      `packages/cli/src/commands/change/spec-preview.ts`: `registerChangeSpecPreview` — update text rendering loop
      Approach: use a helper to determine label from `status` and `base` (e.g. `(no-op delta, showing original)`) and append to header
      (Req: Text output — merged mode, scenario: Files separated by header lines with status labels)

## 4. Testing

- [x] 4.1 Update core use case tests
      `packages/core/test/application/use-cases/preview-spec.spec.ts`: new tests for all statuses and missing artifacts
      Approach: mock schema with multiple artifacts and verify result contains all with correct statuses
      (Scenarios: Delta merged into base spec content, No-op delta records status, Missing delta file records status, All schema artifacts returned)
- [x] 4.2 Update CLI command tests
      `packages/cli/test/commands/change/spec-preview.spec.ts`: verify headers and error messages
      Approach: mock use case return values and assert stdout/stderr content
      (Scenarios: Files separated by header lines with status labels, Spec not in change exits with error and suggestion)

## 8. Missing CLI Diff Tests

- [x] 8.1 Add tests for diff colorization
      `packages/cli/test/commands/change/spec-preview.spec.ts`: add tests verifying chalk colors for +, -, @@, and context lines in diff mode
      Approach: add `describe` block testing `--diff` text output colorization using `chalk` and mocked output capture
      (Scenarios: Additions colored green, Removals colored red, Hunk headers colored cyan, Context lines dimmed)
- [x] 8.2 Add test for `--artifact` combined with `--diff`
      `packages/cli/test/commands/change/spec-preview.spec.ts`: add test combining artifact filter with diff output
      Approach: add test in `--artifact flag` block that also passes `--diff`
      (Scenarios: Filtered artifact in diff mode)
