# Tasks: batch-generate-metadata

## 1. Shared helper extraction

- [x] 1.1 Create `parseCommaSeparatedValues` helper
      `packages/cli/src/helpers/parse-comma-values.ts`: new file with generic
      `parseCommaSeparatedValues<T>()` function that splits, trims, lowercases,
      and validates tokens against a set of valid values

- [x] 1.2 Refactor `spec list` to use the shared helper
      `packages/cli/src/commands/spec/list.ts`: replace inline `parseMetadataStatusFilter`
      with `parseCommaSeparatedValues`. No behaviour change.

## 2. CLI command changes

- [x] 2.1 Make `<specPath>` optional in command registration
      `packages/cli/src/commands/spec/generate-metadata.ts`: change `<specPath>` to `[specPath]`

- [x] 2.2 Add `--all` and `--status` options
      `packages/cli/src/commands/spec/generate-metadata.ts`: add `.option('--all', ...)` and
      `.option('--status <values>', ...)`

- [x] 2.3 Add flag validation logic
      `packages/cli/src/commands/spec/generate-metadata.ts`: validate `--all` requires `--write`,
      `--all` mutually exclusive with `specPath`, `--status` requires `--all`, `--status` values
      validated via `parseCommaSeparatedValues`

- [x] 2.4 Implement batch processing path
      `packages/cli/src/commands/spec/generate-metadata.ts`: when `--all` is set, call
      `ListSpecs` with `includeMetadataStatus: true`, filter by `--status`, iterate and
      generate+save metadata for each spec, collect results

- [x] 2.5 Implement batch output formatting
      `packages/cli/src/commands/spec/generate-metadata.ts`: text output with per-spec lines
      and summary; JSON output with `result`, `total`, `succeeded`, `failed`, `specs` array

## 3. Tests

- [x] 3.1 Add helper unit tests
      `packages/cli/test/helpers/parse-comma-values.spec.ts`: valid values, invalid values,
      mixed, trimming, case normalization

- [x] 3.2 Add flag validation tests
      `packages/cli/test/commands/spec-generate-metadata.spec.ts`: test `--all` without `--write`,
      `--all` with `specPath`, `--status` without `--all`, invalid `--status` value

- [x] 3.3 Add batch processing tests
      `packages/cli/test/commands/spec-generate-metadata.spec.ts`: test default filter
      (stale+missing), `--status all`, individual failure continues, `--force` skips conflicts,
      JSON output format

- [x] 3.4 Run full test suite
      Run `pnpm test` to verify no regressions
