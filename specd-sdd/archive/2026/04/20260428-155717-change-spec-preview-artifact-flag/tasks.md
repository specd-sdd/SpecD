# Tasks: change-spec-preview-artifact-flag

## 1. CLI Implementation

- [x] 1.1 Update `spec-preview` command signature
      `packages/cli/src/commands/change/spec-preview.ts`: `registerChangeSpecPreview` — add `--artifact <name>` option
      Approach: use `.option('--artifact <name>', 'filter by artifact ID (e.g. specs, verify)')` to match `spec show`
      (Req: Command signature)

- [x] 1.2 Implement artifact filtering logic
      `packages/cli/src/commands/change/spec-preview.ts`: `registerChangeSpecPreview` action handler — filter `result.files` based on schema resolution
      Approach: if `opts.artifact` is present, fetch active schema via `kernel.specs.getActiveSchema.execute()`, resolve artifact name to filename using `schema.artifact()`, and filter `result.files` by that filename. Throw `cliError` for unknown, non-spec, or missing artifacts.
      (Req: Text output . merged mode, Text output . diff mode, JSON/TOON output, Artifact filtering errors)

## 2. Automated Tests

- [x] 2.1 Create unit tests for `change spec-preview --artifact`
      `packages/cli/test/commands/change/spec-preview.spec.ts`: new test file — verify filtering, error cases, and diff mode interaction
      Approach: use `vitest` to mock the kernel and verify command output for various `--artifact` scenarios (success, unknown ID, missing file)
      (Req: Artifact filtering errors, scenario: Filtered artifact in merged mode, scenario: Filtered artifact in diff mode)

## 3. Verification

- [x] 3.1 Manual E2E verification
      CLI: `specd change spec-preview` — run manual steps defined in `design.md`
      Approach: use a real change with multiple artifacts to confirm filtering works as expected for both merged and diff modes across all formats
      (Req: all requirements)
