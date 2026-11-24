# Partial Compliance Audit — Batch 3: `cli-specs`

**Change:** `decouple-core-cli-error-hints`  
**Verification Attempt:** `verification-attempt-3`  
**Audit Mode:** Delegated (read-only)  
**Vitest Verification:** `pnpm --filter @specd/cli test -- --run` — **111 test files passed (111), 1638 tests passed (1638)**

---

## Per-Spec Summary

| Spec ID                      | Status                                 | Requirements | Scenarios | Discrepancies                        | Missing / Partial Command-Level Tests                                                                                                          |
| ---------------------------- | -------------------------------------- | ------------ | --------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli:entrypoint`             | Compliant                              | All met      | All met   | 0                                    | 0 (covered by `handle-error.spec.ts` & `error-hints.spec.ts`)                                                                                  |
| `cli:spec-generate-metadata` | Compliant (1 minor spec-phrasing note) | All met      | All met   | 1 minor phrasing note (non-blocking) | 0 (covered by `spec-generate-metadata.spec.ts`)                                                                                                |
| `cli:spec-validate`          | Compliant                              | All met      | All met   | 0                                    | 1 command-level hint test (`DEPENDS_ON_OVERWRITE` tested in `error-hints.spec.ts` & `handle-error.spec.ts`, not `spec-validate.spec.ts`)       |
| `cli:change-invalidate`      | Compliant                              | All met      | All met   | 0                                    | 1 structured-mode command test (`--format json`/`toon` `hint` for `InvalidateRequiresForceError` / `InvalidInputError` at command level)       |
| `cli:change-transition`      | Compliant                              | All met      | All met   | 0                                    | 0 (covered by `transition.spec.ts`)                                                                                                            |
| `cli:change-draft`           | Compliant                              | All met      | All met   | 0                                    | 1 command-level hint assertion (`--force` hint in text & JSON/TOON not asserted in `change-draft.spec.ts`, covered in `error-hints.spec.ts`)   |
| `cli:change-discard`         | Compliant                              | All met      | All met   | 0                                    | 1 command-level hint assertion (`--force` hint in text & JSON/TOON not asserted in `change-discard.spec.ts`, covered in `error-hints.spec.ts`) |
| `cli:change-archive`         | Compliant                              | All met      | All met   | 0                                    | 0 (covered by `archive.spec.ts`)                                                                                                               |
| `cli:change-deps`            | Compliant                              | All met      | All met   | 0                                    | 1 command-level hint test (`UpdateSpecDeps` `InvalidInputError` hint tested in `error-hints.spec.ts`, not `change-deps.spec.ts`)               |

---

## Detailed Findings

### 1. `cli:entrypoint`

- **Implementation:**
  - `packages/cli/src/error-hints.ts` (lines 1–184): Defines `CliCommandId`, `CliHintId`, `CLI_ERROR_HINTS`, `CLI_ERROR_HINT_RULES`, and `resolveCliErrorHint(code, context, metadata)`.
  - `packages/cli/src/handle-error.ts`:
    - `handleError(err, format, options)` (lines 192–268) resolves `hint` via `resolveCliErrorHint(code, options ?? {}, metadata)` (and falls back to `metadata.checkId` with `isSkippable: metadata.isSkippable ?? metadata.skippable` at lines 219–226).
    - `cliError(message, format, exitCode, code, options)` (lines 53–79) writes `error: ${message}\n` (or `fatal:` for exit code 3) to stderr, followed by `${options.hint}\n` when `options?.hint !== undefined`. In `json`/`toon` formats, emits `{ result: 'error', code, message, exitCode, ...(hint ? { hint } : {}), ...(metadata ? { metadata } : {}) }` without mutating `message`.
- **Consistency with `default:_global/error-handling-conventions`:** Compliant. Core errors remain host-neutral; CLI translates error codes and metadata using active command context without altering `err.message`.
- **Test Coverage:**
  - `packages/cli/test/handle-error.spec.ts` (lines 451–513): Verifies text, JSON, and TOON `hint` rendering, `SpecNotInChangeError` `specId` interpolation, and `impl.linksInScope` check metadata routing.
  - `packages/cli/test/error-hints.spec.ts` (lines 1–141, 10 tests): Verifies all hint rules, command scoping, and unmatched context omission.
- **Discrepancies:** None.

---

### 2. `cli:spec-generate-metadata`

- **Implementation:**
  - `packages/cli/src/commands/spec/generate-metadata.ts`:
    - Registers `generate-metadata [specPath]` with `--all`, `--force`, `--workspace <name>`, `--format <fmt>`, `--config <path>` (lines 12–29).
    - Validates mutual exclusivity of `--all` and `<specPath>` (lines 42–47).
    - Single-spec failure handling (lines 66–83): When `entry.ok` is `false` and `entry.code !== undefined`, resolves hint via `resolveCliErrorHint(entry.code, { command: 'specs.generate-metadata' })` and calls `cliError(message, opts.format, 1, entry.code, hint !== undefined ? { hint } : undefined)`.
    - Catch block (line 137): Calls `handleError(err, opts.format, { command: 'specs.generate-metadata' })`.
  - `packages/core/src/application/use-cases/regenerate-spec-metadata.ts`:
    - `_regenerateOne` (lines 92–111) catches errors and preserves `code: error.code` when `error instanceof SpecdError` (line 108).
- **Test Coverage:**
  - `packages/cli/test/commands/spec-generate-metadata.spec.ts` (8 tests): Covers missing args, single-spec delegation, `--all` batch delegation, `--force`, batch JSON totals/results, and single-spec `DEPENDS_ON_OVERWRITE` failure in both text mode (lines 195–218: exit 1, empty stdout, stderr contains `dependsOn would change` and `--force`) and JSON mode (lines 220–253: exit 1, stderr contains `dependsOn would change`, JSON `result: "error"`, `code: "DEPENDS_ON_OVERWRITE"`, `hint` contains `--force`).
- **Discrepancies (Minor / Non-blocking):**
  - **Spec vs. Implementation phrasing:** `cli:spec-generate-metadata` Requirement "Error — dependsOn overwrite" states: _"`RegenerateSpecMetadata` throws a `DependsOnOverwriteError`. The error propagates through `handleError` with the `specs.generate-metadata` command context"_. In the actual implementation, `RegenerateSpecMetadata._regenerateOne` (`packages/core/src/application/use-cases/regenerate-spec-metadata.ts:103-110`) catches `DependsOnOverwriteError` and returns `{ specId, ok: false, error, code: 'DEPENDS_ON_OVERWRITE' }`, and `generate-metadata.ts:70-81` resolves the hint via `resolveCliErrorHint` + `cliError`. The observable CLI behavior (exit 1, stderr `error: dependsOn would change`, `--force` hint on stderr and in JSON/TOON `hint`, empty stdout in text mode) matches all spec scenarios.

---

### 3. `cli:spec-validate`

- **Implementation:**
  - `packages/cli/src/commands/spec/validate.ts`:
    - Registers `validate [specPath]` with `--all`, `--workspace <name>`, `--format <fmt>`, `--config <path>` (no `--force` flag) (lines 11–21).
    - Catch block (line 123): Passes `{ command: 'specs.validate' }` to `handleError(err, opts.format, { command: 'specs.validate' })`.
  - `packages/cli/src/error-hints.ts` (lines 101–105, 69–70): Maps `DEPENDS_ON_OVERWRITE` + `specs.validate` to `'deps.repair-or-force-generate'` (`Repair with: specd specs deps add <spec-id> / specd specs deps set <spec-id>, or re-run specd specs generate-metadata --force`), never suggesting `--force` on `specs validate`.
- **Test Coverage:**
  - `packages/cli/test/error-hints.spec.ts` (lines 10–14) and `packages/cli/test/handle-error.spec.ts` (lines 470–474) verify `DEPENDS_ON_OVERWRITE` for `specs.validate` in text and JSON modes.
  - `packages/cli/test/commands/spec-validate.spec.ts`: Covers command behavior, but has no command-level test mocking `kernel.specs.validate.execute` to reject with `DependsOnOverwriteError`.
- **Discrepancies:** None.

---

### 4. `cli:change-invalidate`

- **Implementation:**
  - `packages/cli/src/commands/change/invalidate.ts`:
    - Registers `invalidate <name>` with `--reason`, `--target`, `--artifact-policy`, `--workflow-policy`, `--force`, `--format`, `--config` (lines 30–54).
    - Catch block (lines 222–231): For `InvalidateRequiresForceError`, writes per-gate recovery warnings to stderr (lines 223–229), then calls `handleError(err, opts.format, { command: 'change.invalidate' })` (line 230).
  - `packages/cli/src/error-hints.ts` (lines 112–115, 138–146): Maps `INVALIDATE_REQUIRES_FORCE` (`force.revoke-consent`), `INVALID_INVALIDATE_TARGET`, and `INVALID_INPUT` (`invalidate.target-flags`) for `change.invalidate`.
- **Test Coverage:**
  - `packages/cli/test/commands/change/change-invalidate.spec.ts` (lines 382–409): Tests `InvalidateRequiresForceError` in text mode (verifies `--force` and per-gate recovery targets on stderr). Lines 411+ test invalid target errors.
  - `packages/cli/test/error-hints.spec.ts` (lines 32–42): Verifies `INVALIDATE_REQUIRES_FORCE` and `INVALID_INPUT` routing for `change.invalidate`.
  - Gap: No command-level test in `change-invalidate.spec.ts` asserting `hint` in `--format json`/`toon` output.
- **Discrepancies:** None.

---

### 5. `cli:change-transition`

- **Implementation:**
  - `packages/cli/src/commands/change/transition.ts`:
    - `writeTextRepairGuide` (lines 134–198): Renders `HAPPY_PATH_NEXT_UNAVAILABLE` hint via `resolveCliErrorHint('HAPPY_PATH_NEXT_UNAVAILABLE', { command: 'change.transition' })` (lines 136–143) and skippable `CheckPredicateFailedError` bypass hint via `resolveCliErrorHint(cpErr.checkId, { command: 'change.transition' }, { isSkippable: true })` (lines 175–183).
    - Structured failure record (lines 432–462): Includes `hint` for `HappyPathNextUnavailableError` and skippable `CheckPredicateFailedError` using `resolveCliErrorHint`.
    - Outer catch block (line 468): Calls `handleError(err, opts.format, { command: 'change.transition' })`.
- **Test Coverage:**
  - `packages/cli/test/commands/change/transition.spec.ts`: Verifies `HappyPathNextUnavailableError` hint in text and JSON (`complete` event `result.hint`, lines 862–895) and `impl.linksInScope` bypass hint (`--skip-checks impl.linksInScope (or --allow-out-of-scope)`, lines 1550–1585).
- **Discrepancies:** None.

---

### 6. `cli:change-draft`

- **Implementation:**
  - `packages/cli/src/commands/change/draft.ts`:
    - Registers `draft <name>` with `--reason`, `--force`, `--format`, `--config` (lines 11–24).
    - Catch block (line 51): Calls `handleError(err, opts.format, { command: 'change.draft' })`.
  - `packages/cli/src/error-hints.ts` (lines 107–110): Maps `IMPLEMENTATION_DETECTED` + `change.draft` to `'force.bypass-impl-guard'` (`Re-run with --force to proceed anyway`).
- **Test Coverage:**
  - `packages/cli/test/error-hints.spec.ts` (lines 20–30): Verifies `IMPLEMENTATION_DETECTED` hint for `change.draft`.
  - `packages/cli/test/commands/change-draft.spec.ts` (lines 148–166): Verifies `HistoricalImplementationGuardError` exits 1 and prints `/implementing/` and `/out of sync/`, but does not assert the `--force` hint line on stderr or `hint` in JSON/TOON output at the command level.
- **Discrepancies:** None.

---

### 7. `cli:change-discard`

- **Implementation:**
  - `packages/cli/src/commands/change/discard.ts`:
    - Registers `discard <name>` with required `--reason <text>`, `--force`, `--format`, `--config` (lines 11–24).
    - Catch block (line 54): Calls `handleError(err, opts.format, { command: 'change.discard' })`.
  - `packages/cli/src/error-hints.ts` (lines 107–110): Maps `IMPLEMENTATION_DETECTED` + `change.discard` to `'force.bypass-impl-guard'`.
- **Test Coverage:**
  - `packages/cli/test/error-hints.spec.ts` (lines 20–30): Verifies `IMPLEMENTATION_DETECTED` hint for `change.discard`.
  - `packages/cli/test/commands/change-discard.spec.ts` (lines 165–191): Verifies `HistoricalImplementationGuardError` exits 1 and prints `/implementing/` and `/out of sync/`, but does not assert the `--force` hint line on stderr or `hint` in JSON/TOON output at the command level.
- **Discrepancies:** None.

---

### 8. `cli:change-archive`

- **Implementation:**
  - `packages/cli/src/commands/change/archive.ts`:
    - Translates `--skip-checks`, `--allow-overlap` (`spec.overlap`), and `--allow-out-of-scope` (`impl.linksInScope`) into `ArchiveChangeInput.skipChecks` (lines 107–132).
    - Text-mode `CheckPredicateFailedError` handler (lines 185–202): When `err.skippable === true`, resolves `checkHint` via `resolveCliErrorHint(err.checkId, { command: 'change.archive' }, { isSkippable: true })` (with generic `--skip-checks <id>` fallback) and prints `  bypass:  ${checkHint}`.
    - Catch block (line 203): Calls `handleError(err, opts.format, { command: 'change.archive' })`, which resolves `impl.linksInScope` hint via `metadata.checkId` and `metadata.skippable` in JSON/TOON modes.
- **Test Coverage:**
  - `packages/cli/test/commands/change/archive.spec.ts` (lines 708–741): Verifies centralized bypass hint for skippable `impl.linksInScope` in both text (`--skip-checks impl.linksInScope`) and JSON (`payload.hint` contains `--skip-checks impl.linksInScope` and `--allow-out-of-scope`) modes.
- **Discrepancies:** None.

---

### 9. `cli:change-deps`

- **Implementation:**
  - `packages/cli/src/commands/change/deps.ts`:
    - Registers `deps <name> [specId]` with `--add`, `--remove`, `--set`, `--clear`, `--force`, `--format`, `--config` (lines 13–34).
    - Does not import or call `parseSpecId`; forwards raw `<specId>` and flag values to `kernel.changes.getSpecDeps` / `kernel.changes.updateSpecDeps`.
    - Catch block (line 187): Calls `handleError(err, opts.format, { command: 'change.deps' })`.
  - `packages/cli/src/error-hints.ts` (lines 133–136): Maps `INVALID_INPUT` + `change.deps` to `'deps.operation-flags'` (`Use one of --add, --remove, --set, or --clear (--set and --clear cannot be combined with --add or --remove)`).
- **Test Coverage:**
  - `packages/cli/test/error-hints.spec.ts` (lines 104–110): Verifies `INVALID_INPUT` for `change.deps` references `--add`, `--remove`, `--set`, `--clear`.
  - `packages/cli/test/commands/change-deps.spec.ts`: Covers CLI option validation, clear confirmation, raw forwarding, and normalized `specId` output, but does not have a command-level test mocking `updateSpecDeps.execute` rejecting with `InvalidInputError`.
- **Discrepancies:** None.
