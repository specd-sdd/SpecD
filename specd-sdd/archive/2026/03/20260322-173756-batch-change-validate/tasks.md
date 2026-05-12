# Tasks: batch-change-validate

## 1. CLI command changes

- [x] 1.1 Make `<specPath>` optional in command registration
      `packages/cli/src/commands/change/validate.ts`: change `<specPath>` to `[specPath]`

- [x] 1.2 Add `--all` option and flag validation
      `packages/cli/src/commands/change/validate.ts`: add `.option('--all', ...)`,
      validate mutual exclusivity with `specPath`, require one of the two

- [x] 1.3 Implement batch processing path
      `packages/cli/src/commands/change/validate.ts`: when `--all` is set, load specIds
      from change status, iterate and validate each, collect results

- [x] 1.4 Implement batch output formatting
      `packages/cli/src/commands/change/validate.ts`: text output with per-spec results
      and summary line; JSON output with `passed`, `total`, `results` array

## 2. Tests

- [x] 2.1 Add batch mode tests
      `packages/cli/test/commands/change-validate.spec.ts`: test `--all` validates all specs,
      `--all` with specPath rejected, neither rejected, `--all` with `--artifact`,
      partial failures, JSON output

- [x] 2.2 Run full test suite
      Run `pnpm test` to verify no regressions
