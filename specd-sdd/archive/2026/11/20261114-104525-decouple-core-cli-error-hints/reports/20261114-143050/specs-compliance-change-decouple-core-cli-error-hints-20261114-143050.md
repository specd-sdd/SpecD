# Specs Compliance Report — Change `decouple-core-cli-error-hints`

- **Change:** `decouple-core-cli-error-hints` (`specd-sdd/changes/20261114-104525-decouple-core-cli-error-hints`)
- **Verification Attempt:** `verification-attempt-2`
- **Audit Mode:** Delegated Change Audit (read-only, 3 parallel batches across 20 affected specs)
- **Timestamp:** `20261114-143050`
- **Partial Reports Preserved:**
  - [`_partial-global-and-core-errors.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specd-sdd/changes/20261114-104525-decouple-core-cli-error-hints/reports/20261114-143050/_partial-global-and-core-errors.md)
  - [`_partial-core-remaining.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specd-sdd/changes/20261114-104525-decouple-core-cli-error-hints/reports/20261114-143050/_partial-core-remaining.md)
  - [`_partial-cli-specs.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specd-sdd/changes/20261114-104525-decouple-core-cli-error-hints/reports/20261114-143050/_partial-cli-specs.md)

---

## Executive Summary

Across the **20 affected specs** audited in `verification-attempt-2`:

- **17 specs** are **fully compliant** with their delta and canonical requirements (5 with minor command-level/branch test gaps where behavior is already covered by unit/hint-router tests).
- **1 spec** (`core:generate-metadata`) is **delta-compliant** with 2 pre-existing non-delta discrepancies.
- **2 specs** have **active discrepancies** relevant to `decouple-core-cli-error-hints`:
  1. **`cli:spec-generate-metadata` (2 failing scenarios):** `RegenerateSpecMetadata._regenerateOne` ([`regenerate-spec-metadata.ts:90-108`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/regenerate-spec-metadata.ts#L90-L108)) catches `DependsOnOverwriteError` and returns `{ ok: false, error: error.message }`, and [`generate-metadata.ts:65-72`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/spec/generate-metadata.ts#L65-L72) calls `cliError(entry.error, opts.format)` directly in single-spec mode instead of `handleError(err, opts.format, { command: 'specs.generate-metadata' })`. Consequently, `--force` hint is missing on `stderr` and `hint` is missing in `--format json` (`code: "CLI_ERROR"`).
  2. **`default:_global/error-handling-conventions` (1 active discrepancy + 1 pre-existing):** [`validate-skip-checks.ts:9-10`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/services/validate-skip-checks.ts#L9-L10) defines `HOOK_CHECK_NOT_SKIPPABLE_REASON = 'Effect checks (hooks) are governed exclusively by skipHookPhases (CLI: --skip-hooks)'` and passes it to `CheckNotSkippableError`, leaking `(CLI: --skip-hooks)` into a `@specd/core` error message. (Pre-existing: `DiffGenerationError` in `application/ports/diff-generator.ts` extends `Error` rather than `SpecdError`.)

All targeted tests executed across the 3 batches passed (0 failed):

- `@specd/core`: 226 tests (Batch 1) + 234 tests (Batch 2) passed.
- `@specd/cli`: 64 tests (Batch 1) + 363 tests (Batch 3) passed.

---

## Consolidated Summary Table

| Batch | Spec ID                                      | Status                       | Discrepancies (Active / Pre-existing)                                                      | Test Gaps                                                                   |
| ----- | -------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 1     | `default:_global/error-handling-conventions` | Partial / Discrepancy        | 1 active (`validate-skip-checks.ts` CLI flag leak), 1 pre-existing (`DiffGenerationError`) | 0                                                                           |
| 1     | `core:generate-metadata`                     | Partial (Pre-existing drift) | 0 delta / 2 pre-existing (`generatedBy`, empty `metadataExtraction`)                       | 0                                                                           |
| 1     | `core:invalidate-change`                     | Compliant                    | 0                                                                                          | 0                                                                           |
| 1     | `core:update-spec-deps`                      | Compliant                    | 0                                                                                          | 0                                                                           |
| 1     | `core:transition-change`                     | Compliant                    | 0 (see `validate-skip-checks.ts` in global spec)                                           | 0                                                                           |
| 1     | `core:draft-change`                          | Compliant                    | 0                                                                                          | 0                                                                           |
| 2     | `core:discard-change`                        | Compliant                    | 0                                                                                          | 1 minor (`mutateDraft` branch)                                              |
| 2     | `core:transition-checks`                     | Compliant                    | 0                                                                                          | 1 minor (`count > 3` compact `examples:` branch)                            |
| 2     | `core:edit-change`                           | Compliant                    | 0                                                                                          | 0                                                                           |
| 2     | `core:validate-artifacts`                    | Compliant                    | 0                                                                                          | 0                                                                           |
| 2     | `core:preview-spec`                          | Compliant                    | 0                                                                                          | 0                                                                           |
| 3     | `cli:entrypoint`                             | Compliant                    | 0                                                                                          | 0                                                                           |
| 3     | `cli:spec-generate-metadata`                 | Discrepancy Found (FAIL)     | 2 active (`DependsOnOverwriteError` swallowed / `cliError` bypasses `handleError` & hint)  | 1 (`spec-generate-metadata.spec.ts` missing `DependsOnOverwriteError` test) |
| 3     | `cli:spec-validate`                          | Compliant                    | 0                                                                                          | 1 minor (command-level `DependsOnOverwriteError` test)                      |
| 3     | `cli:change-invalidate`                      | Compliant                    | 0                                                                                          | 2 minor (command-level JSON/TOON `hint` tests)                              |
| 3     | `cli:change-transition`                      | Compliant                    | 0                                                                                          | 0                                                                           |
| 3     | `cli:change-draft`                           | Compliant                    | 0                                                                                          | 1 minor (command-level `--force`/`hint` assertions)                         |
| 3     | `cli:change-discard`                         | Compliant                    | 0                                                                                          | 1 minor (command-level `--force`/`hint` assertions)                         |
| 3     | `cli:change-archive`                         | Compliant                    | 0                                                                                          | 0                                                                           |
| 3     | `cli:change-deps`                            | Compliant                    | 0                                                                                          | 1 minor (command-level `InvalidInputError` hint assertion)                  |

---

## Batch 1 — `global-and-core-errors` (Verbatim)

### Batch Summary Table

| Spec ID                                      | Status                                               | Delta Scenarios Checked | Discrepancies Found                                                                                                                                  | Test Files Run & Passed                                                                                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default:_global/error-handling-conventions` | Partial / Discrepancy Found                          | 2 / 2 (9 total)         | 1 new/active (`validate-skip-checks.ts` mentions `CLI: --skip-hooks`), 1 pre-existing (`DiffGenerationError` extends `Error`)                        | `packages/core/test/domain/errors/host-neutral-errors.spec.ts` (5/5), `packages/core/test/domain/errors/specd-error.spec.ts` (3/3), `packages/cli/test/error-hints.spec.ts` (9/9), `packages/cli/test/handle-error.spec.ts` (55/55) |
| `core:generate-metadata`                     | Partial (Pre-existing drift)                         | 1 / 1 (35 total)        | 0 delta discrepancies; 2 pre-existing (`generatedBy: 'core'` not set on `metadata`; `metadata` not `{}` when schema has no `metadataExtraction`)     | `packages/core/test/application/use-cases/generate-spec-metadata.spec.ts` (21/21)                                                                                                                                                   |
| `core:invalidate-change`                     | Compliant                                            | 3 / 3 (22 total)        | 0                                                                                                                                                    | `packages/core/test/application/use-cases/invalidate-change.spec.ts` (26/26)                                                                                                                                                        |
| `core:update-spec-deps`                      | Compliant                                            | 3 / 3 (39 total)        | 0                                                                                                                                                    | `packages/core/test/application/use-cases/update-spec-deps.spec.ts` (31/31)                                                                                                                                                         |
| `core:transition-change`                     | Compliant (with cross-ref to `validate-skip-checks`) | 1 / 1 (58 total)        | 0 in `TransitionChange` / `HappyPathNextUnavailableError` (see `validate-skip-checks.ts` under global spec for `CheckNotSkippableError` hook reason) | `packages/core/test/application/use-cases/transition-change.spec.ts` (131/131)                                                                                                                                                      |
| `core:draft-change`                          | Compliant                                            | 1 / 1 (18 total)        | 0                                                                                                                                                    | `packages/core/test/application/use-cases/draft-change.spec.ts` (9/9)                                                                                                                                                               |

### Detailed Findings

#### 1. `default:_global/error-handling-conventions`

- **Specd Error Contract** (`SpecdError` in [specd-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/errors/specd-error.ts#L7-L33)): Defines `get specd(): true`, `abstract get code(): string`, and `this.name = this.constructor.name`. Covered by `packages/core/test/domain/errors/specd-error.spec.ts`.
- **core Mandate**: All error classes under `packages/core/src/domain/errors/` and `packages/core/src/application/errors/` extend `SpecdError`. (See pre-existing exception for `DiffGenerationError` in `application/ports/diff-generator.ts` below.)
- **Monorepo Package Mandate**: `SpecdCliError` in [specd-cli-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/errors/specd-cli-error.ts#L6-L15) extends `SpecdError`.
- **Host-Neutral Core Errors and Delivery Hints (Delta)**:
  - `DependsOnOverwriteError`, `HistoricalImplementationGuardError`, `HappyPathNextUnavailableError`, `InvalidateRequiresForceError`, and `SpecNotInChangeError` all omit CLI flags (`--force`, `--next`) and `specd ...` commands, and expose structured metadata properties (`existingDeps`, `incomingDeps`, `operation`, `changeName`, `state`, `gates`, `recoveries`, `specId`). Covered by [host-neutral-errors.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/domain/errors/host-neutral-errors.spec.ts#L8-L55).
  - CLI hint translation in [handle-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/handle-error.ts#L219-L254) and [error-hints.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/error-hints.ts#L160-L174) resolves command-aware hints without mutating core error messages. Covered by `packages/cli/test/error-hints.spec.ts` and `packages/cli/test/handle-error.spec.ts`.

**Discrepancies:**

1. **Core error message includes CLI flag `--skip-hooks`** (`Host-Neutral Core Errors and Delivery Hints` — `Scenario: Core error message omits CLI flags and commands`)
   - **Location:** [validate-skip-checks.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/services/validate-skip-checks.ts#L9-L10) and [validate-skip-checks.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/services/validate-skip-checks.ts#L51-L53)
   - **Evidence:**
     ```ts
     export const HOOK_CHECK_NOT_SKIPPABLE_REASON =
       'Effect checks (hooks) are governed exclusively by skipHookPhases (CLI: --skip-hooks)'
     ```
     When `validateSkipChecks` encounters an effect check in `skipChecks`, it throws `new CheckNotSkippableError(checkId, HOOK_CHECK_NOT_SKIPPABLE_REASON)`, producing a core `SpecdError` message containing `(CLI: --skip-hooks)`.
   - **Interpretation:**
     - _Implementation bug:_ This violates the `Host-Neutral Core Errors and Delivery Hints` requirement in `default:_global/error-handling-conventions`, which states that domain/application error messages in `@specd/core` must describe the invariant violation without CLI flags (`--force`, `--next`, etc.). The `(CLI: --skip-hooks)` hint belongs in `@specd/cli`'s `error-hints.ts` rather than `@specd/core`.
     - _Spec drift:_ Unlikely, as the spec was just updated in this change to forbid CLI flags in `@specd/core` error messages; however, if `validate-skip-checks.ts` was intentionally left out of scope of this change, it remains a residual non-conformance against the global spec.
2. **Pre-existing: `DiffGenerationError` extends `Error` directly instead of `SpecdError`** (`core Mandate`)
   - **Location:** [diff-generator.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/ports/diff-generator.ts#L18-L38)
   - **Evidence:** `export class DiffGenerationError extends Error` does not extend `SpecdError` and lacks `specd: true` and `code`.
   - **Interpretation:**
     - _Implementation bug:_ If `core Mandate` applies to all `@specd/core` errors (domain and application), `DiffGenerationError` should extend `SpecdError`.
     - _Spec drift:_ `core Mandate` specifically says _"Given: a domain error in @specd/core"_, whereas `DiffGenerationError` is defined in `application/ports/` as an adapter-level port error.

#### 2. `core:generate-metadata`

- **Host-neutral `DependsOnOverwriteError` (Delta):**
  - [depends-on-overwrite-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/errors/depends-on-overwrite-error.ts#L13-L63): `code` is `'DEPENDS_ON_OVERWRITE'`; message is `` `dependsOn would change (${parts.join('; ')}). Pass force to overwrite curated dependencies.` `` (no `--force`); `existingDeps` and `incomingDeps` getters return the arrays.
  - Thrown at [generate-spec-metadata.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/generate-spec-metadata.ts#L367).
  - Tested in [host-neutral-errors.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/domain/errors/host-neutral-errors.spec.ts#L9-L15) and `generate-spec-metadata.spec.ts` (21/21 passed).
- **Schema resolution, spec resolution, dependsOn resolution, single persisted-state read, provenance:** Verified in [generate-spec-metadata.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/generate-spec-metadata.ts#L104-L244).
- **Discrepancies (Pre-existing, unrelated to delta):**
  1. `generatedBy: 'core'` marker not populated by `GenerateSpecMetadata.execute` ([generate-spec-metadata.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/generate-spec-metadata.ts#L216-L229)).
  2. `metadata` when schema has no `metadataExtraction` contains `contentHashes` and `provenance` rather than `{}` ([generate-spec-metadata.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/generate-spec-metadata.ts#L216-L243)).

#### 3. `core:invalidate-change`

- **Policy-dependent target rules (Delta):** [invalidate-change.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/invalidate-change.ts#L251-L261) (`validateCommandShape`) is host-neutral, no `--target`.
- **Approval guard (Delta):** [invalidate-requires-force-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/errors/invalidate-requires-force-error.ts#L13-L45) (`INVALIDATE_REQUIRES_FORCE`, no `--force`, exposes `gates` and `recoveries`).
- **Discrepancies:** None (`invalidate-change.spec.ts` 26/26 passed).

#### 4. `core:update-spec-deps`

- **Typed errors for dependency update failures (Delta):** [update-spec-deps.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/update-spec-deps.ts#L85-L96) and [apply-depends-on-mutation.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/_shared/apply-depends-on-mutation.ts#L27-L58) throw `InvalidInputError` (`INVALID_INPUT`) without `--` CLI flag prefixes.
- **Discrepancies:** None (`update-spec-deps.spec.ts` 31/31 passed).

#### 5. `core:transition-change`

- **Host-neutral `HappyPathNextUnavailableError` (Delta):** [happy-path-next-unavailable-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/errors/happy-path-next-unavailable-error.ts#L8-L51) (`HAPPY_PATH_NEXT_UNAVAILABLE`, `state` getter, omits `--next`).
- **Discrepancies:** None in `TransitionChange` or `HappyPathNextUnavailableError` itself (`transition-change.spec.ts` 131/131 passed; see `validate-skip-checks.ts` under global spec).

#### 6. `core:draft-change`

- **Host-neutral `HistoricalImplementationGuardError` (Delta):** [historical-implementation-guard-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/errors/historical-implementation-guard-error.ts#L14-L45) (`IMPLEMENTATION_DETECTED`, no `--force`, exposes `operation` and `changeName`).
- **Discrepancies:** None (`draft-change.spec.ts` 9/9 passed).

---

## Batch 2 — `core-remaining` (Verbatim)

### Summary Table

| Spec ID                   | Status    | Requirements Audited                | Implemented | Discrepancies | Test Coverage                                                                                                                                                 |
| ------------------------- | --------- | ----------------------------------- | ----------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:discard-change`     | Compliant | 9                                   | 9           | 0             | Covered (`discard-change.spec.ts`, `change.spec.ts`, `host-neutral-errors.spec.ts`); minor gap on `mutateDraft` in `discard-change.spec.ts`                   |
| `core:transition-checks`  | Compliant | Change delta + core check contracts | Verified    | 0             | Covered (`detect-impl-links-in-scope.spec.ts`, `transition-checks.spec.ts`); minor gap on `count > 3` compact summary in `detect-impl-links-in-scope.spec.ts` |
| `core:edit-change`        | Compliant | Change delta + core contracts       | Verified    | 0             | Covered (`edit-change.spec.ts`, `host-neutral-errors.spec.ts`)                                                                                                |
| `core:validate-artifacts` | Compliant | Change delta + core contracts       | Verified    | 0             | Covered (`validate-artifacts.spec.ts`, `host-neutral-errors.spec.ts`)                                                                                         |
| `core:preview-spec`       | Compliant | Change delta + core contracts       | Verified    | 0             | Covered (`preview-spec.spec.ts`, `composition/use-cases/preview-spec.spec.ts`, `host-neutral-errors.spec.ts`)                                                 |

### Test Execution Evidence

8 test files passed, 234 tests passed, 0 failed, 0 skipped (`host-neutral-errors.spec.ts`, `discard-change.spec.ts`, `detect-impl-links-in-scope.spec.ts`, `transition-checks.spec.ts`, `edit-change.spec.ts`, `validate-artifacts.spec.ts`, `preview-spec.spec.ts`, `composition/use-cases/preview-spec.spec.ts`).

### Detailed Findings

- **`core:discard-change`:** Compliant (`DiscardChange` + `HistoricalImplementationGuardError` omit `--force`, expose `operation` & `changeName`). Minor test gap: `discard-change.spec.ts` does not exercise `getDraft`/`mutateDraft`.
- **`core:transition-checks`:** Compliant (`detectImplLinksInScope` omits `--allow-out-of-scope`, preserves `outOfScopeSpecIds`). Minor test gap: `detect-impl-links-in-scope.spec.ts` does not test `count > 3` compact `examples:` branch.
- **`core:edit-change`:** Compliant (`SpecNotInChangeError` omits `specd specs show`, exposes `specId` & `changeName`).
- **`core:validate-artifacts`:** Compliant (`SpecNotInChangeError` omits `specd specs show`, exposes `specId` & `changeName`).
- **`core:preview-spec`:** Compliant (`SpecNotInChangeError` omits `specd specs show`, exposes `specId` & `changeName`).

---

## Batch 3 — `cli-specs` (Verbatim)

### Summary Table

| Spec ID                      | Total Scenarios | Compliant | Discrepancies | Missing Command Tests | Status             |
| ---------------------------- | --------------: | --------: | ------------: | --------------------: | ------------------ |
| `cli:entrypoint`             |              48 |        48 |             0 |                     0 | PASS               |
| `cli:spec-generate-metadata` |              14 |        12 |             2 |                     2 | FAIL               |
| `cli:spec-validate`          |              15 |        15 |             0 |                     1 | PASS (test gap)    |
| `cli:change-invalidate`      |              16 |        16 |             0 |                     2 | PASS (test gap)    |
| `cli:change-transition`      |              39 |        39 |             0 |                     0 | PASS               |
| `cli:change-draft`           |              12 |        12 |             0 |                     1 | PASS (test gap)    |
| `cli:change-discard`         |              11 |        11 |             0 |                     1 | PASS (test gap)    |
| `cli:change-archive`         |              29 |        29 |             0 |                     0 | PASS               |
| `cli:change-deps`            |              27 |        27 |             0 |                     1 | PASS (test gap)    |
| **Total**                    |         **211** |   **209** |         **2** |                 **8** | **1 spec failing** |

### Detailed Findings

- **`cli:entrypoint`:** Compliant (48/48). Centralized hint resolution in `error-hints.ts` and `handle-error.ts` verified; 163 tests passed across `error-hints.spec.ts`, `handle-error.spec.ts`, `entrypoint.spec.ts`, `run.spec.ts`, `guide-sdk.spec.ts`.
- **`cli:spec-generate-metadata`:** **FAIL (2 discrepancies, 2 missing tests):**
  1. _Scenario `dependsOn change exits 1 with --force hint`_: [`RegenerateSpecMetadata._regenerateOne`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/regenerate-spec-metadata.ts#L94-L106) swallows `DependsOnOverwriteError` into `{ ok: false, error: error.message }`. In [`generate-metadata.ts:67-71`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/spec/generate-metadata.ts#L67-L71), single-spec failure calls `cliError(entry.error, opts.format)` directly instead of `handleError(..., { command: 'specs.generate-metadata' })` (L126). `stderr` prints `Pass force to overwrite curated dependencies.` without `--force`.
  2. _Scenario `JSON output on dependsOn error includes hint`_: Because `cliError(entry.error, opts.format)` is called directly with default `code = 'CLI_ERROR'` and no `options.hint`, `--format json` outputs `{ result: "error", code: "CLI_ERROR", message: "...", exitCode: 1 }` with **no `hint` field**.
  3. _Missing test:_ `spec-generate-metadata.spec.ts` lacks tests for `DependsOnOverwriteError` in text and `--format json` modes.
- **`cli:spec-validate`:** Compliant (15/15); minor test gap (`spec-validate.spec.ts` lacks command-level `DependsOnOverwriteError` test; hint tested in `error-hints.spec.ts` and `handle-error.spec.ts`).
- **`cli:change-invalidate`:** Compliant (16/16); minor test gap (`change-invalidate.spec.ts` lacks command-level structured `hint` assertions).
- **`cli:change-transition`:** Compliant (39/39; 52/52 tests passed).
- **`cli:change-draft`:** Compliant (12/12); minor test gap (`change-draft.spec.ts` tests `HistoricalImplementationGuardError` without `--force`/`hint` assertions).
- **`cli:change-discard`:** Compliant (11/11); minor test gap (`change-discard.spec.ts` tests `HistoricalImplementationGuardError` without `--force`/`hint` assertions).
- **`cli:change-archive`:** Compliant (29/29; 45/45 tests passed).
- **`cli:change-deps`:** Compliant (27/27); minor test gap (`change-deps.spec.ts` lacks command-level `InvalidInputError` hint assertion).
