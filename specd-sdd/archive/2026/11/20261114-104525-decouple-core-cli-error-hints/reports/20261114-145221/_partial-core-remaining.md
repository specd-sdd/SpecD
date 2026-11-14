# Partial Compliance Audit — Batch 2 (`core-remaining`)

- **Change**: `decouple-core-cli-error-hints` (`20261114-104525-decouple-core-cli-error-hints`)
- **Verification Attempt**: `verification-attempt-3`
- **Mode**: Delegated Change Audit (read-only)
- **Assigned Specs**:
  - `core:discard-change`
  - `core:transition-checks`
  - `core:edit-change`
  - `core:validate-artifacts`
  - `core:preview-spec`

## Per-Spec Summary

| Spec ID                   | Status                           | Delta Compliance | Canonical Compliance | Test Files Executed                                                                                              | Test Result | Notes / Gaps                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------- | ---------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:discard-change`     | Compliant (with minor test gaps) | Pass             | Pass                 | `discard-change.spec.ts` (9), `host-neutral-errors.spec.ts` (5)                                                  | 14 passed   | `HistoricalImplementationGuardError` JSDoc line 11 still mentions `--force` (comment only; `error.message` is host-neutral). Unit test gaps for `by`, omitted `supersededBy`, `mutateDraft`, and composition `resolveDiscardChangeDeps`. |
| `core:transition-checks`  | Compliant                        | Pass             | Pass                 | `transition-checks.spec.ts` (69), `detect-impl-links-in-scope.spec.ts` (2), `checks/*.spec.ts` (17)              | 88 passed   | `detectImplLinksInScope` message is host-neutral without `--allow-out-of-scope` and preserves `outOfScopeSpecIds`.                                                                                                                       |
| `core:edit-change`        | Compliant                        | Pass             | Pass                 | `edit-change.spec.ts` (47), `host-neutral-errors.spec.ts` (5)                                                    | 52 passed   | `SpecNotInChangeError` is host-neutral (`SPEC_NOT_IN_CHANGE`, exposes `specId` and `changeName`, omits `specd specs show`).                                                                                                              |
| `core:validate-artifacts` | Compliant                        | Pass             | Pass                 | `validate-artifacts.spec.ts` (71), `host-neutral-errors.spec.ts` (5)                                             | 76 passed   | `SpecNotInChangeError` is host-neutral (`SPEC_NOT_IN_CHANGE`, exposes `specId` and `changeName`, omits `specd specs show`).                                                                                                              |
| `core:preview-spec`       | Compliant                        | Pass             | Pass                 | `preview-spec.spec.ts` (25), `composition/use-cases/preview-spec.spec.ts` (6), `host-neutral-errors.spec.ts` (5) | 36 passed   | `SpecNotInChangeError` is host-neutral (`SPEC_NOT_IN_CHANGE`, exposes `specId` and `changeName`, omits `specd specs show`).                                                                                                              |

## Detailed Findings

### 1. `core:discard-change`

- **Implementation**:
  - `packages/core/src/application/use-cases/discard-change.ts` (L7-L67): `DiscardChangeInput` requires `name`, `reason`, and optional `supersededBy?: string[]`, `force?: boolean`. `execute()` checks `get(input.name)` then `getDraft(input.name)`, throwing `ChangeNotFoundError` if neither exists, resolves actor via `ActorResolver.identity()`, and persists via `mutate` (active) or `mutateDraft` (drafted) calling `change.discard(input.reason, actor, input.supersededBy, input.force)`.
  - `packages/core/src/domain/errors/historical-implementation-guard-error.ts` (L14-L46): `HistoricalImplementationGuardError` extends `SpecdError`, defines `code === 'IMPLEMENTATION_DETECTED'`, exposes `operation` and `changeName`, and sets `message` to `"Cannot ${operation} a change that has reached implementing without force: implementation may already exist and specs and code could be left out of sync"` (host-neutral, omits `--force`).
  - `packages/core/src/composition/use-cases/discard-change.ts` (L28-L87): `resolveDiscardChangeDeps(resolver)` resolves `changes` and `actor`, and `createDiscardChange(config, options?)` delegates to `createDiscardChange(resolveDiscardChangeDeps(resolver))`.
- **Consistency with `default:_global/error-handling-conventions`**:
  - `HistoricalImplementationGuardError` extends `SpecdError`, uses `UPPER_SNAKE_CASE` code `IMPLEMENTATION_DETECTED`, exposes `operation` and `changeName` metadata, and omits CLI flags from `message`.
  - Non-blocking observation: `packages/core/src/domain/errors/historical-implementation-guard-error.ts:11` has a JSDoc comment (`Pass --force to bypass this guard intentionally.`), which does not affect runtime `error.message`.
- **Test Coverage**:
  - `packages/core/test/application/use-cases/discard-change.spec.ts`: 9/9 passed (covers `discarded` event, `reason`, `supersededBy` provided, `mutate`, `ChangeNotFoundError`, guard rejection without `force`, guard bypass with `force: true`).
  - `packages/core/test/domain/errors/host-neutral-errors.spec.ts`: 5/5 passed (verifies `HistoricalImplementationGuardError('discard', 'my-change')` omits `--force` and exposes `operation: 'discard'` and `changeName: 'my-change'`).
  - **Missing / Partial Unit Tests**:
    - `discard-change.spec.ts` does not explicitly assert `discarded.by` matches `ActorResolver.identity()`.
    - `discard-change.spec.ts` does not test `supersededBy` omission when not provided.
    - `discard-change.spec.ts` does not test `mutateDraft` for drafted changes or verify `mutateDraft` is not called on active discard.
    - No dedicated `test/composition/use-cases/discard-change.spec.ts` for `resolveDiscardChangeDeps` (covered indirectly by `barrel-kernel-coverage.spec.ts`).

### 2. `core:transition-checks`

- **Implementation**:
  - `packages/core/src/domain/services/transition-checks.ts` (L24-L98): `CheckId` is `string`, `CHECK_LABELS` defines gerund labels without `Executing:` prefix, and `CheckResult` matches the spec.
  - `packages/core/src/application/services/detect-impl-links-in-scope.ts` (L39-L54): `detectImplLinksInScope` returns `{ blocked: true, outOfScopeSpecIds, message }` where `message` is `"Implementation sidecar updates would touch ${String(count)} ${noun} outside the change \"${change.name}\" scope (${list}). Re-run with allowOutOfScope if intentional."` — host-neutral (omits `--allow-out-of-scope`), uses compact summary (`slice(0, 3)` / `examples: ...`), and preserves `outOfScopeSpecIds`.
  - `packages/core/src/domain/checks/impl-links-in-scope.ts` (L22-L31): `runImplLinksInScope` forwards `facts.linksInScopeMessage` on failure.
  - Legacy `PredicateSnapshots`, `gatherPredicateSnapshots`, and `archive.publication` are absent from `packages/core/src`.
- **Consistency with `default:_global/error-handling-conventions`**:
  - `detectImplLinksInScope` avoids CLI flags in its failure message.
- **Test Coverage**:
  - `packages/core/test/domain/services/transition-checks.spec.ts`: 69/69 passed.
  - `packages/core/test/application/services/detect-impl-links-in-scope.spec.ts`: 2/2 passed (verifies `blocked: true`, `outOfScopeSpecIds`, and `message` omitting `--allow-out-of-scope`).
  - `packages/core/test/application/checks/verification-current.spec.ts`: 3/3 passed.
  - `packages/core/test/application/checks/workflow-check-factories.spec.ts`: 4/4 passed.
  - `packages/core/test/domain/checks/workflow-requires.spec.ts`: 4/4 passed.
  - `packages/core/test/domain/checks/approval-signoff.spec.ts`: 6/6 passed.

### 3. `core:edit-change`

- **Implementation**:
  - `packages/core/src/application/use-cases/edit-change.ts` (L300): Throws `new SpecNotInChangeError(id, input.name)` when a spec in `removeSpecIds` is absent from `specIds`.
  - `packages/core/src/application/errors/spec-not-in-change-error.ts` (L6-L36): `SpecNotInChangeError` extends `SpecdError`, defines `code === 'SPEC_NOT_IN_CHANGE'`, exposes `specId` and `changeName`, and sets `message` to `"Spec '${specId}' is not in the current specIds of change '${changeName}'."` (host-neutral, omits `specd specs show`).
- **Consistency with `default:_global/error-handling-conventions`**:
  - `SpecNotInChangeError` satisfies the Specd Error Contract, uses `UPPER_SNAKE_CASE` code `SPEC_NOT_IN_CHANGE`, exposes `specId` and `changeName`, and omits CLI command syntax.
- **Test Coverage**:
  - `packages/core/test/application/use-cases/edit-change.spec.ts`: 47/47 passed (L274-L285, L933-L941 verify `SpecNotInChangeError` is thrown).
  - `packages/core/test/domain/errors/host-neutral-errors.spec.ts`: 5/5 passed (L47-L54 verify `SpecNotInChangeError` omits `specd specs show` and exposes `specId` and `changeName`).

### 4. `core:validate-artifacts`

- **Implementation**:
  - `packages/core/src/application/use-cases/validate-artifacts.ts` (L214, L225, L287): Throws `SpecNotInChangeError` when `specPath` is not in `change.specIds` or omitted for a `scope: spec` artifact. `@throws {SpecNotInChangeError}` documented at L181.
  - Uses `ResolveChangeSchema` (L187-L191) and `ListWorkspaces` (L199).
- **Consistency with `default:_global/error-handling-conventions`**:
  - Uses host-neutral `SpecNotInChangeError`.
- **Test Coverage**:
  - `packages/core/test/application/use-cases/validate-artifacts.spec.ts`: 71/71 passed (L123-L138, L4064-L4079 verify `SpecNotInChangeError` is thrown).
  - `packages/core/test/domain/errors/host-neutral-errors.spec.ts`: 5/5 passed.

### 5. `core:preview-spec`

- **Implementation**:
  - `packages/core/src/application/use-cases/preview-spec.ts` (L121-L123): Throws `new SpecNotInChangeError(specId, change.name)` when normalized `specId` is not in `change.specIds`. `@throws {SpecNotInChangeError}` documented at L105.
  - Validates `specId` via `parseSpecId` (L108-L110), resolves schema via `ResolveChangeSchema` (L115-L119).
- **Consistency with `default:_global/error-handling-conventions`**:
  - Uses host-neutral `SpecNotInChangeError`.
- **Test Coverage**:
  - `packages/core/test/application/use-cases/preview-spec.spec.ts`: 25/25 passed (L133-L143, L744 verify `SpecNotInChangeError`).
  - `packages/core/test/composition/use-cases/preview-spec.spec.ts`: 6/6 passed.
  - `packages/core/test/domain/errors/host-neutral-errors.spec.ts`: 5/5 passed.

## Discrepancies

None found between spec requirements and implementation behavior. (Minor non-blocking observations: JSDoc on `HistoricalImplementationGuardError` at `packages/core/src/domain/errors/historical-implementation-guard-error.ts:11` still references `--force`; `discard-change.spec.ts` has minor unit-test coverage gaps for `by`, omitted `supersededBy`, and `mutateDraft`.)

## Vitest Runs Executed

- `pnpm --filter @specd/core exec vitest run discard-change edit-change validate-artifacts preview-spec impl-links-in-scope transition-checks`: **7 test files passed (229 tests passed)**.
- `pnpm --filter @specd/core exec vitest run host-neutral-errors`: **1 test file passed (5 tests passed)**.
- `pnpm --filter @specd/core exec vitest run checks/`: **4 test files passed (17 tests passed)**.
