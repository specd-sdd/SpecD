# Spec Compliance Audit — Batch 3 (`cli-specs`)

- **Change:** `decouple-core-cli-error-hints` (`verification-attempt-1`)
- **Scope:** 9 CLI specs (`cli:entrypoint`, `cli:spec-generate-metadata`, `cli:spec-validate`, `cli:change-invalidate`, `cli:change-transition`, `cli:change-draft`, `cli:change-discard`, `cli:change-archive`, `cli:change-deps`)
- **Conventions Checked:** `default:_global/error-handling-conventions` and direct spec dependencies
- **Test Run Observed:** `pnpm --filter @specd/cli test` — 111 test files passed (1631 tests passed)

---

## 1. `cli:entrypoint`

- **Requirements Summary:**
  - Global config discovery, `--config` override, stdout/stderr separation, uniform exit codes (`0`, `1`, `2`, `3`, `130`, `143`), `CliExitError` + `runCliCleanup()` before process exit, signal handling, decoupled `createProgram()`, `guide-sdk` registration, and **command-aware error hint rendering** (`handleError(..., { command })` resolving `hint` via centralized `resolveCliErrorHint` and emitting `hint` on stderr and in `json`/`toon` output without mutating `message`; unmatched command contexts omit `hint`).
- **Implementation Status:** Compliant
  - `packages/cli/src/error-hints.ts` defines `CliCommandId`, `CliHintId`, `CLI_ERROR_HINTS`, `CLI_ERROR_HINT_RULES`, and `resolveCliErrorHint`.
  - `packages/cli/src/handle-error.ts` accepts `HandleErrorOptions` (`command`, `lockRepairHint`), resolves `hint` via `resolveCliErrorHint(code, options ?? {}, metadata)`, and passes `{ hint }` to `cliError`, which writes `hint` on the line after `error: <message>` on stderr and includes `payload.hint` in `json`/`toon` output without altering `message`.
  - `packages/cli/src/errors/specd-cli-error.ts` extends `SpecdError` (`default:_global/error-handling-conventions` compliant).
- **Discrepancies:** None for `cli:entrypoint` itself (see `cli:change-transition` below for a hint-template discrepancy in `error-hints.ts` affecting `transition.explicit-step`).
- **Test Coverage:**
  - `packages/cli/test/error-hints.spec.ts` (9 tests) covers all `CLI_ERROR_HINT_RULES` and unmatched codes/commands.
  - `packages/cli/test/handle-error.spec.ts` covers exit codes, `CliExitError`, metadata extraction, `InvalidSpecLockError` repair hints, and `command-aware hint rendering` (`DEPENDS_ON_OVERWRITE` for `specs.generate-metadata` and `specs.validate`, `SPEC_NOT_IN_CHANGE` for `change.transition`).
  - `packages/cli/test/entrypoint.spec.ts` covers entrypoint cleanup and signal handling.
- **Missing Tests:**
  - `packages/cli/test/handle-error.spec.ts`: no explicit test in `command-aware hint rendering` asserting `toon` format includes `hint` (though `toon` is tested in `structured error output` and shares the `cliError` `output(payload, format)` path).
- **Summary Counts:** `totalRequirements`: 10, `compliant`: 10, `discrepancies`: 0, `missingTests`: 1

---

## 2. `cli:spec-generate-metadata`

- **Requirements Summary:**
  - `spec generate-metadata [specPath]` with `--all`, `--force`, `--workspace`, `--format`, `--config`; delegates to `RegenerateSpecMetadata`; handles `SpecNotFoundError`, `WorkspaceNotFoundError`, `hasExtraction: false`, and `DependsOnOverwriteError` via `handleError(..., { command: 'specs.generate-metadata' })` rendering a `--force` hint on stderr and as `hint` in `json`/`toon` output.
- **Implementation Status:** Compliant
  - `packages/cli/src/commands/spec/generate-metadata.ts` (line 126) calls `handleError(err, opts.format, { command: 'specs.generate-metadata' })`.
  - `CLI_ERROR_HINT_RULES` maps `DEPENDS_ON_OVERWRITE` + `specs.generate-metadata` to `force.overwrite-deps` (`'Re-run with --force to overwrite curated dependsOn entries'`).
- **Discrepancies:** None.
- **Test Coverage:**
  - `packages/cli/test/commands/spec-generate-metadata.spec.ts` covers missing args, single-spec delegation, `--all`, `--force`, and batch JSON totals.
  - `packages/cli/test/error-hints.spec.ts` and `packages/cli/test/handle-error.spec.ts` verify `DEPENDS_ON_OVERWRITE` routing for `specs.generate-metadata`.
- **Missing Tests:**
  - `packages/cli/test/commands/spec-generate-metadata.spec.ts` has no command-level test where `kernel.specs.regenerateMetadata.execute` rejects with `DependsOnOverwriteError` in `text`, `json`, or `toon` mode.
- **Summary Counts:** `totalRequirements`: 7, `compliant`: 7, `discrepancies`: 0, `missingTests`: 1

---

## 3. `cli:spec-validate`

- **Requirements Summary:**
  - `spec validate [specPath] [--all] [--workspace <name>] [--format text|json|toon] [--config <path>]`; delegates to `ValidateSpecs`; **MUST NOT** suggest `--force` on `specs validate` when `DependsOnOverwriteError` (`DEPENDS_ON_OVERWRITE`) occurs, and SHALL instead render a hint guiding to `specd specs deps add/set` or `specd specs generate-metadata --force`.
- **Implementation Status:** Compliant
  - `packages/cli/src/commands/spec/validate.ts` (line 123) calls `handleError(err, opts.format, { command: 'specs.validate' })`.
  - `CLI_ERROR_HINT_RULES` maps `DEPENDS_ON_OVERWRITE` + `specs.validate` to `deps.repair-or-force-generate`: `'Repair with: specd specs deps add <spec-id> / specd specs deps set <spec-id>, or re-run specd specs generate-metadata --force'`.
- **Discrepancies:** None.
- **Test Coverage:**
  - `packages/cli/test/commands/spec-validate.spec.ts` covers single-spec pass/fail, `--all`, `--workspace`, JSON output, not-found, and missing scope.
  - `packages/cli/test/error-hints.spec.ts` (lines 10-14) and `packages/cli/test/handle-error.spec.ts` (lines 470-475) explicitly verify `DEPENDS_ON_OVERWRITE` for `specs.validate` includes `specd specs deps` / `specd specs generate-metadata --force` and does NOT contain `specs validate --force`.
- **Missing Tests:**
  - `packages/cli/test/commands/spec-validate.spec.ts` has no command-level test where `kernel.specs.validate.execute` rejects with `DependsOnOverwriteError`.
- **Summary Counts:** `totalRequirements`: 12, `compliant`: 12, `discrepancies`: 0, `missingTests`: 1

---

## 4. `cli:change-invalidate`

- **Requirements Summary:**
  - `changes invalidate <name> --reason <text>` with `--artifact-policy`, `--workflow-policy`, `--target`, `--force`, `--format`; delegates policy & recovery to core; renders `InvalidateRequiresForceError` (`--force` hint) and target policy validation errors (`--target` hint) via the centralized hint-resolution helper in text and structured output.
- **Implementation Status:** Compliant
  - `packages/cli/src/commands/change/invalidate.ts` (line 230) calls `handleError(err, opts.format, { command: 'change.invalidate' })`.
  - `CLI_ERROR_HINT_RULES` maps `INVALIDATE_REQUIRES_FORCE`, `INVALID_INVALIDATE_TARGET`, and `INVALID_INPUT` for `change.invalidate` to `force.revoke-consent` and `invalidate.target-flags`.
- **Discrepancies:** None.
- **Test Coverage:**
  - `packages/cli/test/commands/change/change-invalidate.spec.ts` tests `InvalidateRequiresForceError` (line 382) and `INVALID_INVALIDATE_TARGET` (line 411) in text mode, plus policy overrides and JSON/TOON success output.
  - `packages/cli/test/error-hints.spec.ts` tests `INVALIDATE_REQUIRES_FORCE` and `INVALID_INPUT` for `change.invalidate`.
- **Missing Tests:**
  - `packages/cli/test/commands/change/change-invalidate.spec.ts` does not test `json`/`toon` structured error output for `InvalidateRequiresForceError` or `INVALID_INVALIDATE_TARGET`/`INVALID_INPUT` asserting the `hint` field.
- **Summary Counts:** `totalRequirements`: 11, `compliant`: 11, `discrepancies`: 0, `missingTests`: 1

---

## 5. `cli:change-transition`

- **Requirements Summary:**
  - `change transition <name> [step] [--next] [--skip-checks <ids>] [--allow-out-of-scope] [--allow-overlap] [--skip-hooks <phases>] [--format ...]`; delegates to `TransitionChange`; **CLI-rendered transition error hints**: when `HappyPathNextUnavailableError` (`HAPPY_PATH_NEXT_UNAVAILABLE`) or a skippable `impl.linksInScope` failure is surfaced, SHALL use the centralized CLI hint-resolution helper (`change.transition` context) to render `--next` context and `--skip-checks impl.linksInScope` / `--allow-out-of-scope` hints.
- **Implementation Status:** Partial / Non-Compliant on `HappyPathNextUnavailableError`
  - `packages/cli/src/commands/change/transition.ts` line 169 calls `resolveCliErrorHint(cpErr.checkId, { command: 'change.transition' }, { isSkippable: true })` for `CheckPredicateFailedError` in `writeTextRepairGuide`.
  - Line 446 calls `handleError(err, opts.format, { command: 'change.transition' })`.
- **Discrepancies:**
  1. **`HappyPathNextUnavailableError` bypasses `handleError` and `resolveCliErrorHint`:** In `packages/cli/src/commands/change/transition.ts` (lines 97, 105, 414-441), `HappyPathNextUnavailableError` is included in `isRepairGuideError(err)`, which intercepts the error, calls `writeTextRepairGuide` (in `text` mode) or `writeStructuredRecord` (in `json`/`toon` mode), and throws `new CliExitError(1)`. Neither branch calls `resolveCliErrorHint` or reaches `handleError(..., { command: 'change.transition' })`, so the centralized `HAPPY_PATH_NEXT_UNAVAILABLE` hint is never rendered by `change transition`.
  2. **Incorrect flag in `transition.explicit-step` hint template:** In `packages/cli/src/error-hints.ts` (lines 72-73), `CLI_ERROR_HINTS['transition.explicit-step']` returns `'Specify an explicit target state with --to <state> instead of --next'`, whereas `change transition` takes a positional `<step>` argument (`specd change transition <name> [step]`), not a `--to` flag.
- **Test Coverage:**
  - `packages/cli/test/commands/change/transition.spec.ts` tests `impl.linksInScope` `CheckPredicateFailedError` in text mode (lines 1515-1544) verifying the centralized bypass hint, and tests `HappyPathNextUnavailableError` (lines 835-909, 1668-1688) for repair guide rendering.
  - `packages/cli/test/error-hints.spec.ts` tests `HAPPY_PATH_NEXT_UNAVAILABLE` and `impl.linksInScope` for `change.transition`.
- **Missing Tests:**
  - `packages/cli/test/commands/change/transition.spec.ts` has no test verifying `HAPPY_PATH_NEXT_UNAVAILABLE` renders the centralized hint on `change transition`, and no test for `impl.linksInScope` failure in `json`/`toon` mode.
- **Summary Counts:** `totalRequirements`: 14, `compliant`: 13, `discrepancies`: 2, `missingTests`: 2

---

## 6. `cli:change-draft`

- **Requirements Summary:**
  - `changes draft <name> [--reason <text>] [--force] [--format text|json|toon]` (and `change draft` alias); when `DraftChange` throws `HistoricalImplementationGuardError` (`IMPLEMENTATION_DETECTED`), passes `{ command: 'change.draft' }` to `handleError` so the centralized hint-resolution helper renders the `--force` bypass hint on stderr and as `hint` in `json`/`toon` output.
- **Implementation Status:** Compliant
  - `packages/cli/src/commands/change/draft.ts` (line 51) calls `handleError(err, opts.format, { command: 'change.draft' })`.
  - `CLI_ERROR_HINT_RULES` maps `IMPLEMENTATION_DETECTED` + `change.draft` to `force.bypass-impl-guard` (`'Re-run with --force to proceed anyway'`).
- **Discrepancies:** None.
- **Test Coverage:**
  - `packages/cli/test/commands/change-draft.spec.ts` (line 148) and `packages/cli/test/commands/change.spec.ts` (line 912) test `HistoricalImplementationGuardError` in text mode.
  - `packages/cli/test/error-hints.spec.ts` (lines 20-30) tests `IMPLEMENTATION_DETECTED` for `change.draft`.
- **Missing Tests:**
  - `packages/cli/test/commands/change-draft.spec.ts` does not explicitly assert the `--force` hint line in stderr or test `json`/`toon` structured error output with `hint` for `HistoricalImplementationGuardError`.
- **Summary Counts:** `totalRequirements`: 6, `compliant`: 6, `discrepancies`: 0, `missingTests`: 1

---

## 7. `cli:change-discard`

- **Requirements Summary:**
  - `change discard <name> --reason <text> [--force] [--format text|json|toon]`; when `DiscardChange` throws `HistoricalImplementationGuardError` (`IMPLEMENTATION_DETECTED`), passes `{ command: 'change.discard' }` to `handleError` so the centralized hint-resolution helper renders the `--force` bypass hint on stderr and as `hint` in `json`/`toon` output.
- **Implementation Status:** Compliant
  - `packages/cli/src/commands/change/discard.ts` (line 54) calls `handleError(err, opts.format, { command: 'change.discard' })`.
  - `CLI_ERROR_HINT_RULES` maps `IMPLEMENTATION_DETECTED` + `change.discard` to `force.bypass-impl-guard` (`'Re-run with --force to proceed anyway'`).
- **Discrepancies:** None.
- **Test Coverage:**
  - `packages/cli/test/commands/change-discard.spec.ts` (line 165) and `packages/cli/test/commands/change.spec.ts` (line 1057) test `HistoricalImplementationGuardError` in text mode.
  - `packages/cli/test/error-hints.spec.ts` (lines 20-30) tests `IMPLEMENTATION_DETECTED` for `change.discard`.
- **Missing Tests:**
  - `packages/cli/test/commands/change-discard.spec.ts` does not explicitly assert the `--force` hint line in stderr or test `json`/`toon` structured error output with `hint` for `HistoricalImplementationGuardError`.
- **Summary Counts:** `totalRequirements`: 6, `compliant`: 6, `discrepancies`: 0, `missingTests`: 1

---

## 8. `cli:change-archive`

- **Requirements Summary:**
  - `changes archive <name> [--skip-hooks <phases>] [--skip-checks <ids>] [--allow-overlap] [--allow-out-of-scope] [--format text|json|toon]` (and `change archive` alias); delegates to `ArchiveChange`; **CLI-rendered out-of-scope implementation hint**: when `ArchiveChange` fails on `impl.linksInScope` as a skippable check, renders `--skip-checks impl.linksInScope` (and `--allow-out-of-scope`) guidance via the centralized hint-resolution helper.
- **Implementation Status:** Partial
  - `packages/cli/src/commands/change/archive.ts` (line 188) calls `resolveCliErrorHint(err.checkId, { command: 'change.archive' }, { isSkippable: true })` for `CheckPredicateFailedError` when `opts.format === 'text'`.
  - Line 203 calls `handleError(err, opts.format, { command: 'change.archive' })`.
- **Discrepancies:**
  1. **Structured (`json`/`toon`) `impl.linksInScope` hint mismatch:** When `CheckPredicateFailedError` is thrown with `opts.format` set to `json` or `toon`, `archive.ts` falls through to `handleError(err, opts.format, { command: 'change.archive' })`. `handleError` passes `err.code` (which for `CheckPredicateFailedError` is `this.checkCode`, e.g. `'IMPLEMENTATION_STATE'`, not `err.checkId` `'impl.linksInScope'`) and `metadata` (which has `skippable: true`, not `isSkippable: true`) to `resolveCliErrorHint`. Consequently, the `checks.skip-impl-links-in-scope` rule is not matched in `json`/`toon` mode. (Similarly, if `ArchiveImplementationStateError` with code `'ARCHIVE_IMPLEMENTATION_STATE'` is thrown, no `CLI_ERROR_HINT_RULES` entry matches it.)
- **Test Coverage:**
  - `packages/cli/test/commands/change/archive.spec.ts` tests `--allow-out-of-scope` translation, `CheckPredicateFailedError` for plugin check `@security.code-scan` in text and JSON modes, and `SpecOverlapError`.
  - `packages/cli/test/error-hints.spec.ts` tests `impl.linksInScope` with `isSkippable: true` for `change.archive`.
- **Missing Tests:**
  - `packages/cli/test/commands/change/archive.spec.ts` has no test for `impl.linksInScope` (`CheckPredicateFailedError` or `ArchiveImplementationStateError`) in text or `json`/`toon` mode.
- **Summary Counts:** `totalRequirements`: 10, `compliant`: 9, `discrepancies`: 1, `missingTests`: 1

---

## 9. `cli:change-deps`

- **Requirements Summary:**
  - `change deps <name> [<specId>] [--add ...] [--remove ...] [--set ...] [--clear] [--force] [--format ...]`; raw forwarding of spec IDs; `--clear` confirmation; **CLI-rendered dependency operation flag hints**: when `UpdateSpecDeps` surfaces operation validation errors (`InvalidInputError`), uses `{ command: 'change.deps' }` with `handleError` and the centralized hint-resolution helper to render flag guidance referencing `--set`, `--add`, `--remove`, and `--clear`.
- **Implementation Status:** Compliant
  - `packages/cli/src/commands/change/deps.ts` (line 187) calls `handleError(err, opts.format, { command: 'change.deps' })`.
  - `CLI_ERROR_HINT_RULES` maps `INVALID_INPUT` + `change.deps` to `deps.operation-flags`: `'Use one of --add, --remove, --set, or --clear (--set and --clear cannot be combined with --add or --remove)'`.
- **Discrepancies:** None.
- **Test Coverage:**
  - `packages/cli/test/commands/change-deps.spec.ts` covers `--add`, `--remove`, `--set`, `--clear`, mutual exclusivity CLI errors, raw ID forwarding, `InvalidSpecIdError`, `WorkspaceNotFoundError`, `SpecNotInChangeError`, and `ChangeNotFoundError`.
  - `packages/cli/test/error-hints.spec.ts` (lines 101-107) verifies `INVALID_INPUT` for `change.deps` includes `--add`, `--remove`, `--set`, and `--clear`.
- **Missing Tests:**
  - `packages/cli/test/commands/change-deps.spec.ts` has no test where `kernel.changes.updateSpecDeps.execute` rejects with `InvalidInputError` (`INVALID_INPUT`) asserting the centralized `deps.operation-flags` hint in stderr and `json`/`toon` output.
- **Summary Counts:** `totalRequirements`: 6, `compliant`: 6, `discrepancies`: 0, `missingTests`: 1

---

## Batch 3 Totals

- **Specs Audited:** 9
- **Total Requirements:** 81
- **Compliant:** 78
- **Discrepancies:** 3 (2 in `cli:change-transition`, 1 in `cli:change-archive`)
- **Missing Tests:** 10
