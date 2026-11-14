# Specs Compliance Report — Change `decouple-core-cli-error-hints`

- **Change:** `decouple-core-cli-error-hints` (`specd-sdd/changes/20261114-104525-decouple-core-cli-error-hints`)
- **Verification Attempt:** `verification-attempt-3`
- **Audit Mode:** Delegated Change Audit (read-only, 3 parallel batches across 20 affected specs)
- **Timestamp:** `20261114-145221`
- **Partial Reports Preserved:**
  - [`_partial-global-and-core-errors.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specd-sdd/changes/20261114-104525-decouple-core-cli-error-hints/reports/20261114-145221/_partial-global-and-core-errors.md)
  - [`_partial-core-remaining.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specd-sdd/changes/20261114-104525-decouple-core-cli-error-hints/reports/20261114-145221/_partial-core-remaining.md)
  - [`_partial-cli-specs.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specd-sdd/changes/20261114-104525-decouple-core-cli-error-hints/reports/20261114-145221/_partial-cli-specs.md)

---

## Executive Summary

Across all **20 affected specs** audited in `verification-attempt-3`:

- **20 / 20 specs** are **Compliant** with **0 blocking discrepancies**.
- Both active discrepancies from `verification-attempt-2` are resolved:
  1. `RegenerateSpecMetadata._regenerateOne` (`regenerate-spec-metadata.ts`) preserves `code` for `SpecdError` instances (`DEPENDS_ON_OVERWRITE`), and `packages/cli/src/commands/spec/generate-metadata.ts` resolves the centralized `--force` hint in both `text` and `json`/`toon` modes (verified by 2 new tests in `spec-generate-metadata.spec.ts` and 1 new test in `regenerate-spec-metadata.spec.ts`).
  2. `HOOK_CHECK_NOT_SKIPPABLE_REASON` in `packages/core/src/application/services/validate-skip-checks.ts` is now host-neutral (`'Effect checks (hooks) are governed exclusively by skipHookPhases'`), and `packages/cli/src/error-hints.ts` routes `CHECK_NOT_SKIPPABLE` for `hook.*` on `change.transition` / `change.archive` to `'Use --skip-hooks <phases> instead of --skip-checks for hook checks'` (verified in `validate-skip-checks.spec.ts`, `error-hints.spec.ts`, and `archive.spec.ts`).
- Non-blocking observations:
  - JSDoc comments in 3 core error files (`invalidate-requires-force-error.ts:11`, `historical-implementation-guard-error.ts:11`, `happy-path-next-unavailable-error.ts:33`) still reference `--force` / `--next` in comments (runtime `message` strings are host-neutral).
  - Minor unit/command-level test gaps in `discard-change.spec.ts` and 5 CLI command spec files where the centralized hint behavior is already covered in `error-hints.spec.ts` and `handle-error.spec.ts`.
- All Vitest runs across batches passed (`@specd/cli`: 111 files, 1638/1638 passed; `@specd/core` targeted batches: 229 + 8 + 229 + 5 + 17 passed).

---

## Consolidated Summary Table

| Batch | Spec ID                                      | Status    | Blocking Discrepancies | Non-Blocking Notes / Test Gaps                                                      |
| ----- | -------------------------------------------- | --------- | ---------------------- | ----------------------------------------------------------------------------------- |
| 1     | `default:_global/error-handling-conventions` | Compliant | 0                      | 3 JSDoc comment notes                                                               |
| 1     | `core:generate-metadata`                     | Compliant | 0                      | —                                                                                   |
| 1     | `core:invalidate-change`                     | Compliant | 0                      | —                                                                                   |
| 1     | `core:update-spec-deps`                      | Compliant | 0                      | —                                                                                   |
| 1     | `core:transition-change`                     | Compliant | 0                      | —                                                                                   |
| 1     | `core:draft-change`                          | Compliant | 0                      | —                                                                                   |
| 2     | `core:discard-change`                        | Compliant | 0                      | Minor unit test gaps (`by`, omitted `supersededBy`, `mutateDraft`)                  |
| 2     | `core:transition-checks`                     | Compliant | 0                      | —                                                                                   |
| 2     | `core:edit-change`                           | Compliant | 0                      | —                                                                                   |
| 2     | `core:validate-artifacts`                    | Compliant | 0                      | —                                                                                   |
| 2     | `core:preview-spec`                          | Compliant | 0                      | —                                                                                   |
| 3     | `cli:entrypoint`                             | Compliant | 0                      | —                                                                                   |
| 3     | `cli:spec-generate-metadata`                 | Compliant | 0                      | 1 minor spec-phrasing note (`_regenerateOne` returns `code` rather than rethrowing) |
| 3     | `cli:spec-validate`                          | Compliant | 0                      | 1 command-level hint test gap (covered in `error-hints.spec.ts`)                    |
| 3     | `cli:change-invalidate`                      | Compliant | 0                      | 1 command-level JSON/TOON `hint` test gap                                           |
| 3     | `cli:change-transition`                      | Compliant | 0                      | —                                                                                   |
| 3     | `cli:change-draft`                           | Compliant | 0                      | 1 command-level hint assertion gap (covered in `error-hints.spec.ts`)               |
| 3     | `cli:change-discard`                         | Compliant | 0                      | 1 command-level hint assertion gap (covered in `error-hints.spec.ts`)               |
| 3     | `cli:change-archive`                         | Compliant | 0                      | —                                                                                   |
| 3     | `cli:change-deps`                            | Compliant | 0                      | 1 command-level hint test gap (covered in `error-hints.spec.ts`)                    |

---

## Batch 1 — `global-and-core-errors` (Verbatim)

| Spec ID                                      | Status    | Discrepancies           | Test Coverage                                                                                                         | Notes                                                                                                                                               |
| -------------------------------------------- | --------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default:_global/error-handling-conventions` | Compliant | 0 (3 minor JSDoc notes) | Covered (`host-neutral-errors.spec.ts`, `specd-error.spec.ts`, `validate-skip-checks.spec.ts`, `error-hints.spec.ts`) | Core error `message` strings are host-neutral; CLI `error-hints.ts` translates codes + metadata (including `CHECK_NOT_SKIPPABLE` for `hook.*`).     |
| `core:generate-metadata`                     | Compliant | 0                       | Covered (`generate-spec-metadata.spec.ts`, `host-neutral-errors.spec.ts`)                                             | `DependsOnOverwriteError` exposes `existingDeps`/`incomingDeps` and omits `--force` from `message`.                                                 |
| `core:invalidate-change`                     | Compliant | 0                       | Covered (`invalidate-change.spec.ts`, `host-neutral-errors.spec.ts`)                                                  | `validateCommandShape` uses `targets`/`policy` without `--target`; `InvalidateRequiresForceError` exposes `gates`/`recoveries` and omits `--force`. |
| `core:update-spec-deps`                      | Compliant | 0                       | Covered (`update-spec-deps.spec.ts`)                                                                                  | `InvalidInputError` (`INVALID_INPUT`) messages reference `set`/`add`/`remove`/`clear` without `--` prefixes.                                        |
| `core:transition-change`                     | Compliant | 0                       | Covered (`transition-change.spec.ts`, `validate-skip-checks.spec.ts`, `host-neutral-errors.spec.ts`)                  | `HappyPathNextUnavailableError` exposes `state` and omits `--next`; `validateSkipChecks` uses `HOOK_CHECK_NOT_SKIPPABLE_REASON` (`skipHookPhases`). |
| `core:draft-change`                          | Compliant | 0                       | Covered (`draft-change.spec.ts`, `host-neutral-errors.spec.ts`)                                                       | `HistoricalImplementationGuardError` (`IMPLEMENTATION_DETECTED`) exposes `operation`/`changeName` and omits `--force`.                              |

**Executed Vitest Suites:**

- `@specd/core` (6 use-case/service suites): 229 tests passed.
- `@specd/core` (`host-neutral-errors.spec.ts`, `specd-error.spec.ts`): 8 tests passed.
- `@specd/cli` (`error-hints.spec.ts`): 10 tests passed.

---

## Batch 2 — `core-remaining` (Verbatim)

| Spec ID                   | Status                           | Delta Compliance | Canonical Compliance | Test Files Executed                                                                                              | Test Result | Notes / Gaps                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------- | ---------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:discard-change`     | Compliant (with minor test gaps) | Pass             | Pass                 | `discard-change.spec.ts` (9), `host-neutral-errors.spec.ts` (5)                                                  | 14 passed   | `HistoricalImplementationGuardError` JSDoc line 11 still mentions `--force` (comment only; `error.message` is host-neutral). Unit test gaps for `by`, omitted `supersededBy`, `mutateDraft`, and composition `resolveDiscardChangeDeps`. |
| `core:transition-checks`  | Compliant                        | Pass             | Pass                 | `transition-checks.spec.ts` (69), `detect-impl-links-in-scope.spec.ts` (2), `checks/*.spec.ts` (17)              | 88 passed   | `detectImplLinksInScope` message is host-neutral without `--allow-out-of-scope` and preserves `outOfScopeSpecIds`.                                                                                                                       |
| `core:edit-change`        | Compliant                        | Pass             | Pass                 | `edit-change.spec.ts` (47), `host-neutral-errors.spec.ts` (5)                                                    | 52 passed   | `SpecNotInChangeError` is host-neutral (`SPEC_NOT_IN_CHANGE`, exposes `specId` and `changeName`, omits `specd specs show`).                                                                                                              |
| `core:validate-artifacts` | Compliant                        | Pass             | Pass                 | `validate-artifacts.spec.ts` (71), `host-neutral-errors.spec.ts` (5)                                             | 76 passed   | `SpecNotInChangeError` is host-neutral (`SPEC_NOT_IN_CHANGE`, exposes `specId` and `changeName`, omits `specd specs show`).                                                                                                              |
| `core:preview-spec`       | Compliant                        | Pass             | Pass                 | `preview-spec.spec.ts` (25), `composition/use-cases/preview-spec.spec.ts` (6), `host-neutral-errors.spec.ts` (5) | 36 passed   | `SpecNotInChangeError` is host-neutral (`SPEC_NOT_IN_CHANGE`, exposes `specId` and `changeName`, omits `specd specs show`).                                                                                                              |

---

## Batch 3 — `cli-specs` (Verbatim)

**Vitest Verification:** `pnpm --filter @specd/cli test -- --run` — **111 test files passed (111), 1638 tests passed (1638)**.

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
