# Partial Compliance Audit — Batch 1: `global-and-core-errors`

**Change**: `decouple-core-cli-error-hints` (`20261114-104525-decouple-core-cli-error-hints`)  
**Verification Attempt**: `verification-attempt-3`  
**Audit Mode**: Delegated Change (read-only)  
**Code Graph**: Current (`stale: false`, `lastIndexedRef: 45617e805`)

## Per-Spec Summary

| Spec ID                                      | Status    | Discrepancies           | Test Coverage                                                                                                         | Notes                                                                                                                                               |
| -------------------------------------------- | --------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default:_global/error-handling-conventions` | Compliant | 0 (3 minor JSDoc notes) | Covered (`host-neutral-errors.spec.ts`, `specd-error.spec.ts`, `validate-skip-checks.spec.ts`, `error-hints.spec.ts`) | Core error `message` strings are host-neutral; CLI `error-hints.ts` translates codes + metadata (including `CHECK_NOT_SKIPPABLE` for `hook.*`).     |
| `core:generate-metadata`                     | Compliant | 0                       | Covered (`generate-spec-metadata.spec.ts`, `host-neutral-errors.spec.ts`)                                             | `DependsOnOverwriteError` exposes `existingDeps`/`incomingDeps` and omits `--force` from `message`.                                                 |
| `core:invalidate-change`                     | Compliant | 0                       | Covered (`invalidate-change.spec.ts`, `host-neutral-errors.spec.ts`)                                                  | `validateCommandShape` uses `targets`/`policy` without `--target`; `InvalidateRequiresForceError` exposes `gates`/`recoveries` and omits `--force`. |
| `core:update-spec-deps`                      | Compliant | 0                       | Covered (`update-spec-deps.spec.ts`)                                                                                  | `InvalidInputError` (`INVALID_INPUT`) messages reference `set`/`add`/`remove`/`clear` without `--` prefixes.                                        |
| `core:transition-change`                     | Compliant | 0                       | Covered (`transition-change.spec.ts`, `validate-skip-checks.spec.ts`, `host-neutral-errors.spec.ts`)                  | `HappyPathNextUnavailableError` exposes `state` and omits `--next`; `validateSkipChecks` uses `HOOK_CHECK_NOT_SKIPPABLE_REASON` (`skipHookPhases`). |
| `core:draft-change`                          | Compliant | 0                       | Covered (`draft-change.spec.ts`, `host-neutral-errors.spec.ts`)                                                       | `HistoricalImplementationGuardError` (`IMPLEMENTATION_DETECTED`) exposes `operation`/`changeName` and omits `--force`.                              |

**Totals**: 6 specs audited, 6 compliant, 0 blocking discrepancies.

---

## Detailed Findings by Spec

### 1. `default:_global/error-handling-conventions`

- **Requirements Checked**:
  - `Specd Error Contract` (`specd: true`, `code: string`, `Error` inheritance, descriptive `message`)
  - `core Mandate` (all `@specd/core` domain/application errors extend `SpecdError`)
  - `Error Code Naming` (`UPPER_SNAKE_CASE`)
  - `Actionable Messaging`, `Metadata Extraction`, `JSDoc Documentation`
  - `Host-Neutral Core Errors and Delivery Hints`: `@specd/core` error `message` properties omit CLI flags (`--force`, `--next`, `--target`, `--allow-out-of-scope`, `--set`, `--add`, `--remove`, `--clear`, `--skip-checks`, `--skip-hooks`) and `specd ...` command syntax, exposing structured metadata so `@specd/cli` can render command-appropriate hints.
- **Implementation Evidence**:
  - `packages/core/src/application/services/validate-skip-checks.ts:9-10,51-53`: `HOOK_CHECK_NOT_SKIPPABLE_REASON` is `'Effect checks (hooks) are governed exclusively by skipHookPhases'`, passed to `new CheckNotSkippableError(checkId, HOOK_CHECK_NOT_SKIPPABLE_REASON)`.
  - `packages/core/src/domain/errors/check-registry-errors.ts:233-258`: `CheckNotSkippableError` extends `SpecdError`, `code === 'CHECK_NOT_SKIPPABLE'`, exposes `checkId` and `reason`.
  - `packages/cli/src/error-hints.ts:88-89,154-159,170-184`: `CLI_ERROR_HINTS['checks.skip-hooks-instead']` returns `'Use --skip-hooks <phases> instead of --skip-checks for hook checks'`, and `CLI_ERROR_HINT_RULES` routes `CHECK_NOT_SKIPPABLE` for `commands: ['change.transition', 'change.archive']` when `typeof metadata.checkId === 'string' && metadata.checkId.startsWith('hook.')`.
- **Non-Blocking Notes**:
  - JSDoc comments in `packages/core/src/application/errors/invalidate-requires-force-error.ts:11`, `packages/core/src/domain/errors/historical-implementation-guard-error.ts:11`, and `packages/core/src/domain/errors/happy-path-next-unavailable-error.ts:33` still mention `--force` / `--next` in doc comments, while runtime `message` values are host-neutral.
- **Test Evidence**:
  - `packages/core/test/domain/errors/specd-error.spec.ts` (3/3 passed)
  - `packages/core/test/domain/errors/host-neutral-errors.spec.ts` (5/5 passed)
  - `packages/core/test/application/services/validate-skip-checks.spec.ts` (11/11 passed — asserts `reason === HOOK_CHECK_NOT_SKIPPABLE_REASON` and `message` does not contain `--skip-hooks`)
  - `packages/cli/test/error-hints.spec.ts` (10/10 passed — asserts `CHECK_NOT_SKIPPABLE` routing for `hook.*` on `change.transition`/`change.archive` and all other hint rules)

### 2. `core:generate-metadata`

- **Requirements Checked**: Delta requirement `Host-neutral DependsOnOverwriteError` and existing `GenerateSpecMetadata` contract.
- **Implementation Evidence**:
  - `packages/core/src/domain/errors/depends-on-overwrite-error.ts:13-64`: Extends `SpecdError`, `code === 'DEPENDS_ON_OVERWRITE'`, exposes `existingDeps` and `incomingDeps`, and `message` (`dependsOn would change (...). Pass force to overwrite curated dependencies.`) omits `--force`.
  - `packages/core/src/application/use-cases/generate-spec-metadata.ts:367`: Throws `new DependsOnOverwriteError([...persistedDependsOn], [...extractedDependsOn])`.
- **Test Evidence**:
  - `packages/core/test/application/use-cases/generate-spec-metadata.spec.ts` (21/21 passed)
  - `packages/core/test/domain/errors/host-neutral-errors.spec.ts` (`DependsOnOverwriteError omits CLI flags`)

### 3. `core:invalidate-change`

- **Requirements Checked**: Delta requirements `Policy-dependent target rules` (host-neutral `targets`/`policy` without `--target`) and `Approval guard` (`InvalidateRequiresForceError` exposing `gates` and `recoveries` without `--force`).
- **Implementation Evidence**:
  - `packages/core/src/application/use-cases/invalidate-change.ts:245-264`: `validateCommandShape` emits `targets are not allowed with policy '...'` and `At least one target is required with policy '...'` (no `--target`).
  - `packages/core/src/application/errors/invalidate-requires-force-error.ts:13-46`: Extends `SpecdError`, `code === 'INVALIDATE_REQUIRES_FORCE'`, exposes `gates` and `recoveries`, and `message` omits `--force`.
  - `packages/core/src/application/use-cases/invalidate-change.ts:133,147`: Throws `InvalidInvalidateTargetError` and `InvalidateRequiresForceError`.
- **Test Evidence**:
  - `packages/core/test/application/use-cases/invalidate-change.spec.ts` (26/26 passed)
  - `packages/core/test/domain/errors/host-neutral-errors.spec.ts` (`InvalidateRequiresForceError omits --force and exposes gates and recoveries`)

### 4. `core:update-spec-deps`

- **Requirements Checked**: Delta scenarios for host-neutral validation errors (`InvalidInputError` with `INVALID_INPUT` for mutually exclusive operations and missing operation, omitting `--` CLI flag prefixes).
- **Implementation Evidence**:
  - `packages/core/src/application/use-cases/update-spec-deps.ts:81-97`: Throws `InvalidInputError` with `'set is mutually exclusive with add, remove, and clear'`, `'clear is mutually exclusive with add and remove'`, and `'at least one of add, remove, set, or clear must be provided'`.
  - `packages/core/src/domain/errors/invalid-input-error.ts:6-22`: Extends `SpecdError`, `code === 'INVALID_INPUT'`.
- **Test Evidence**:
  - `packages/core/test/application/use-cases/update-spec-deps.spec.ts` (31/31 passed, including `INVALID_INPUT` and operation conflict/missing tests)

### 5. `core:transition-change`

- **Requirements Checked**: Delta requirement `Host-neutral HappyPathNextUnavailableError` and `validateSkipChecks` hook-check rejection (`HOOK_CHECK_NOT_SKIPPABLE_REASON`).
- **Implementation Evidence**:
  - `packages/core/src/domain/errors/happy-path-next-unavailable-error.ts:8-51`: Extends `SpecdError`, `code === 'HAPPY_PATH_NEXT_UNAVAILABLE'`, exposes `state`, and `happyPathNextMessage` omits `--next`.
  - `packages/core/src/application/use-cases/transition-change.ts:249,293`: Throws `HappyPathNextUnavailableError(fromState)` when `next === null` and validates `skipChecks` via `validateSkipChecks`.
  - `packages/core/src/application/services/validate-skip-checks.ts:9-10,51-53`: Rejects `hook.*` effect checks with `HOOK_CHECK_NOT_SKIPPABLE_REASON` (`'Effect checks (hooks) are governed exclusively by skipHookPhases'`).
- **Test Evidence**:
  - `packages/core/test/application/use-cases/transition-change.spec.ts` (131/131 passed)
  - `packages/core/test/application/services/validate-skip-checks.spec.ts` (11/11 passed)
  - `packages/core/test/domain/errors/host-neutral-errors.spec.ts` (`HappyPathNextUnavailableError omits --next and exposes state`)

### 6. `core:draft-change`

- **Requirements Checked**: Delta requirement `Host-neutral HistoricalImplementationGuardError` (`IMPLEMENTATION_DETECTED`, omitting `--force`, exposing `operation` and `changeName`).
- **Implementation Evidence**:
  - `packages/core/src/domain/errors/historical-implementation-guard-error.ts:14-46`: Extends `SpecdError`, `code === 'IMPLEMENTATION_DETECTED'`, exposes `operation` and `changeName`, and `message` omits `--force`.
  - `packages/core/src/application/use-cases/draft-change.ts:53`: Calls `change.draft(actor, input.reason, input.force)`.
- **Test Evidence**:
  - `packages/core/test/application/use-cases/draft-change.spec.ts` (9/9 passed)
  - `packages/core/test/domain/errors/host-neutral-errors.spec.ts` (`HistoricalImplementationGuardError omits CLI flags`)

---

## Executed Vitest Suites

1. `pnpm --filter @specd/core exec vitest run test/application/services/validate-skip-checks.spec.ts test/application/use-cases/generate-spec-metadata.spec.ts test/application/use-cases/invalidate-change.spec.ts test/application/use-cases/update-spec-deps.spec.ts test/application/use-cases/transition-change.spec.ts test/application/use-cases/draft-change.spec.ts` → **6 files passed, 229 tests passed**.
2. `pnpm --filter @specd/core exec vitest run test/domain/errors/host-neutral-errors.spec.ts test/domain/errors/specd-error.spec.ts` → **2 files passed, 8 tests passed**.
3. `pnpm --filter @specd/cli exec vitest run test/error-hints.spec.ts` → **1 file passed, 10 tests passed**.
