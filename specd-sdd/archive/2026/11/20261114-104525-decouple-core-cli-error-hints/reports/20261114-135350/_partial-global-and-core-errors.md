# Spec Compliance Audit — Batch 1: `global-and-core-errors`

**Change:** `decouple-core-cli-error-hints`  
**Attempt:** `verification-attempt-1`  
**Scope:** `default:_global/error-handling-conventions`, `core:generate-metadata`, `core:invalidate-change`, `core:update-spec-deps`, `core:transition-change`, `core:draft-change`

---

## Overall Summary

| Spec                                         | Total Requirements | Compliant | Discrepancies | Missing Tests |
| -------------------------------------------- | -----------------: | --------: | ------------: | ------------: |
| `default:_global/error-handling-conventions` |                  8 |         7 |             1 |             0 |
| `core:generate-metadata`                     |                 10 |        10 |             0 |             1 |
| `core:invalidate-change`                     |                 15 |        15 |             0 |             2 |
| `core:update-spec-deps`                      |                 13 |        13 |             0 |             1 |
| `core:transition-change`                     |                 11 |        11 |             0 |             1 |
| `core:draft-change`                          |                  9 |         9 |             0 |             1 |
| **Total**                                    |             **66** |    **65** |         **1** |         **6** |

**Test Run Observed:** `pnpm --filter @specd/core exec vitest run test/domain/errors/host-neutral-errors.spec.ts test/domain/errors/specd-error.spec.ts test/domain/errors/invalid-state-transition-error.spec.ts test/application/use-cases/generate-spec-metadata.spec.ts test/application/use-cases/invalidate-change.spec.ts test/application/use-cases/update-spec-deps.spec.ts test/application/use-cases/draft-change.spec.ts test/application/use-cases/transition-change.spec.ts` — **8 test files passed, 232 tests passed**.

---

## 1. `default:_global/error-handling-conventions`

### Requirements Summary

1. **Specd Error Contract**: Errors inherit from `Error`, expose `readonly specd = true`, `readonly code: string`, and descriptive `message`.
2. **core Mandate**: `@specd/core` defines `SpecdError`; every domain and application error in `@specd/core` extends `SpecdError`.
3. **Monorepo Package Mandate**: Packages depending on `@specd/core` extend `SpecdError` via package-level base classes.
4. **Error Code Naming**: `UPPER_SNAKE_CASE`, unique within package.
5. **Actionable Messaging**: Descriptive, actionable messages.
6. **Host-Neutral Core Errors and Delivery Hints**: `@specd/core` errors, services, and use cases MUST NOT embed CLI flags (`--force`, `--next`, `--target`, `--allow-out-of-scope`, `--set`, `--add`, `--remove`, `--clear`) or CLI command syntax (`specd ...`) inside `message`; expose structured metadata properties instead.
7. **Metadata Extraction**: Contextual metadata properties exposed and documented in JSDoc.
8. **JSDoc Documentation**: Error classes have JSDoc describing error, `code`, and metadata; use cases document thrown errors with `@throws`.

### Implementation Status

- **Compliant (7/8)**:
  - `packages/core/src/domain/errors/specd-error.ts` implements `SpecdError` extending `Error` with `get specd(): true` and `abstract get code(): string`.
  - All error classes in `packages/core/src/domain/errors/` and `packages/core/src/application/errors/` extend `SpecdError` (directly or via `ConfigValidationError`) and use `UPPER_SNAKE_CASE` codes.
  - No `@specd/core` error `message` embeds CLI flags (`--force`, `--next`, `--target`, `--allow-out-of-scope`, `--set`, `--add`, `--remove`, `--clear`) or `specd ...` command syntax.
  - Structured metadata properties are exposed on `DependsOnOverwriteError` (`existingDeps`, `incomingDeps`), `HistoricalImplementationGuardError` (`operation`, `changeName`), `HappyPathNextUnavailableError` (`state`), `InvalidateRequiresForceError` (`gates`, `recoveries`), and `SpecNotInChangeError` (`specId`, `changeName`).

### Discrepancies (1)

- **JSDoc Documentation (`@throws` tags on use-case `execute()` methods)**:
  - `InvalidateChange.execute` (`packages/core/src/application/use-cases/invalidate-change.ts#L112-L117`) has no `@throws` tags (omits `ChangeNotFoundError`, `InvalidInvalidateTargetError`, `InvalidateRequiresForceError`).
  - `DraftChange.execute` (`packages/core/src/application/use-cases/draft-change.ts#L37-L43`) omits `@throws {HistoricalImplementationGuardError}`.
  - `TransitionChange.execute` (`packages/core/src/application/use-cases/transition-change.ts#L181-L198`) omits `@throws {HappyPathNextUnavailableError}`.
  - `GenerateSpecMetadata.execute` (`packages/core/src/application/use-cases/generate-spec-metadata.ts#L92-L102`) omits `@throws {SchemaProviderIdentityMismatchError}`.
  - _(Informational)_ Doc comments (not `message`) in `historical-implementation-guard-error.ts#L11`, `invalidate-requires-force-error.ts#L11`, and `happy-path-next-unavailable-error.ts#L33` still reference `--force` / `--next`.

### Test Coverage

- `packages/core/test/domain/errors/specd-error.spec.ts` (3 tests)
- `packages/core/test/domain/errors/host-neutral-errors.spec.ts` (5 tests)

### Missing Tests

- None for core error contract & host-neutrality conventions.

### Summary

- `totalRequirements`: 8
- `compliant`: 7
- `discrepancies`: 1
- `missingTests`: 0

---

## 2. `core:generate-metadata`

### Requirements Summary

- Input/output (`specId`, optional `schemaName`, `metadata`, `hasExtraction`, `sourceState`), schema resolution precedence, spec resolution, artifact loading/parsing, metadata extraction, fresh lock-owned optimizations only, content hashes, assembled result, config-based factory delegation (`resolveGenerateSpecMetadataDeps`), and host-neutral `DependsOnOverwriteError` (omits `--force`, exposes `existingDeps` and `incomingDeps`).

### Implementation Status

- **Compliant (10/10)**:
  - `packages/core/src/application/use-cases/generate-spec-metadata.ts` throws `DependsOnOverwriteError` in `resolveCanonicalDependsOn` when persisted and extracted `dependsOn` differ without `allowDependsOnOverwrite`.
  - `packages/core/src/domain/errors/depends-on-overwrite-error.ts` has `code = 'DEPENDS_ON_OVERWRITE'`, exposes `existingDeps` and `incomingDeps`, and its message (`dependsOn would change (...). Pass force to overwrite curated dependencies.`) omits `--force`.

### Discrepancies

- None.

### Test Coverage

- `packages/core/test/application/use-cases/generate-spec-metadata.spec.ts` (21 tests passing)
- `packages/core/test/domain/errors/host-neutral-errors.spec.ts#L9-L15` (tests `DependsOnOverwriteError` code, host-neutral message, `existingDeps`, `incomingDeps`)

### Missing Tests (1)

- `packages/core/test/application/use-cases/generate-spec-metadata.spec.ts` has no test invoking `GenerateSpecMetadata.execute()` where `DependsOnOverwriteError` is thrown (the scenario is only unit-tested directly on `new DependsOnOverwriteError(...)` in `host-neutral-errors.spec.ts`).

### Summary

- `totalRequirements`: 10
- `compliant`: 10
- `discrepancies`: 0
- `missingTests`: 1

---

## 3. `core:invalidate-change`

### Requirements Summary

- Input contract, effective policy resolution, policy-dependent target rules with host-neutral validation messages (no `--target`), target normalization and validation, approval guard throwing `InvalidateRequiresForceError` (exposing `gates` and `recoveries`, host-neutral message without `--force`), canonical gate-safe invalidation and recovery, manual invalidation cause, policy-aware artifact effects, no invented drift, idempotence, output contract, DAG traversal order, config-based factory delegation, sovereign schema resolution, and lifecycle-guided `nextAction`.

### Implementation Status

- **Compliant (15/15)**:
  - `packages/core/src/application/use-cases/invalidate-change.ts` validates command shape in `validateCommandShape` using host-neutral terms (`targets`, `policy`) without `--target`, throwing `InvalidInvalidateTargetError`.
  - `packages/core/src/application/errors/invalidate-requires-force-error.ts` has `code = 'INVALIDATE_REQUIRES_FORCE'`, exposes `gates` and `recoveries`, and its message omits `--force`.

### Discrepancies

- None.

### Test Coverage

- `packages/core/test/application/use-cases/invalidate-change.spec.ts` (26 tests passing)
- `packages/core/test/domain/errors/host-neutral-errors.spec.ts#L32-L36` (tests `InvalidateRequiresForceError` omits `--force`)

### Missing Tests (2)

- Neither `invalidate-change.spec.ts` nor `host-neutral-errors.spec.ts` asserts `error.gates` and `error.recoveries` on `InvalidateRequiresForceError`.
- `invalidate-change.spec.ts` does not explicitly assert `!error.message.includes('--target')` on `InvalidInvalidateTargetError`.

### Summary

- `totalRequirements`: 15
- `compliant`: 15
- `discrepancies`: 0
- `missingTests`: 2

---

## 4. `core:update-spec-deps`

### Requirements Summary

- Input contract, change lookup, spec membership check, mutual exclusivity of `set` / `clear` / `add`+`remove` with host-neutral `InvalidInputError` (`INVALID_INPUT`, no `--` prefixes), at least one operation required with host-neutral `InvalidInputError` (no `--` prefixes), `set`, `clear`, spec ID validation, `remove` existence check, `add` idempotence, `remove` before `add`, persistence/output, and config-based factory delegation.

### Implementation Status

- **Compliant (13/13)**:
  - `packages/core/src/application/use-cases/update-spec-deps.ts#L81-L97` throws `InvalidInputError` (`INVALID_INPUT`) with host-neutral messages (`set is mutually exclusive with add, remove, and clear`, `clear is mutually exclusive with add and remove`, `at least one of add, remove, set, or clear must be provided`) containing no `--` CLI flag prefixes.

### Discrepancies

- None.

### Test Coverage

- `packages/core/test/application/use-cases/update-spec-deps.spec.ts` (31 tests passing)

### Missing Tests (1)

- `update-spec-deps.spec.ts` does not explicitly assert `!error.message.includes('--')` on `InvalidInputError` for conflicting or missing operations.

### Summary

- `totalRequirements`: 13
- `compliant`: 13
- `discrepancies`: 0
- `missingTests`: 1

---

## 5. `core:transition-change`

### Requirements Summary

- Input contract (`skipChecks` instead of ad-hoc booleans), `approvals` baked at construction, change existence, optional pre-transition implementation tracking refresh, spec approval & signoff as checks, human-approval pending states, shared runner errors (`CheckPredicateFailedError`, `InvalidStateTransitionError`), dependencies (`transitionBindings`), config-based factory delegation, historic parked approval repair precedence, and host-neutral `HappyPathNextUnavailableError` (`HAPPY_PATH_NEXT_UNAVAILABLE`, exposes `state`, omits `--next`).

### Implementation Status

- **Compliant (11/11)**:
  - `packages/core/src/application/use-cases/transition-change.ts#L245-L249` throws `HappyPathNextUnavailableError(fromState)` when `to === 'next'` and `nextWorkflowStep(...) === null`.
  - `packages/core/src/domain/errors/happy-path-next-unavailable-error.ts` has `code = 'HAPPY_PATH_NEXT_UNAVAILABLE'`, exposes `state`, and its messages omit `--next`.

### Discrepancies

- None.

### Test Coverage

- `packages/core/test/application/use-cases/transition-change.spec.ts` (131 tests passing)
- `packages/core/test/domain/errors/host-neutral-errors.spec.ts#L25-L30` (tests `HappyPathNextUnavailableError` omits `--next` and exposes `state`)

### Missing Tests (1)

- `transition-change.spec.ts#L335-L390` asserts `HappyPathNextUnavailableError` is thrown for `archivable`, `pending-spec-approval`, `pending-signoff`, and `archiving`, but does not assert `error.state` or `!error.message.includes('--next')` on the use-case call (covered directly on the error class in `host-neutral-errors.spec.ts`).

### Summary

- `totalRequirements`: 11
- `compliant`: 11
- `discrepancies`: 0
- `missingTests`: 1

---

## 6. `core:draft-change`

### Requirements Summary

- Input contract, change must exist in active storage, actor resolution, historical implementation guard, host-neutral `HistoricalImplementationGuardError` (`IMPLEMENTATION_DETECTED`, omits `--force`, exposes `operation: 'draft'` and `changeName`), `drafted` event appended to history, persistence via `ChangeRepository.mutate` returning `DraftedChangeView`, dependencies, and config-based factory delegation.

### Implementation Status

- **Compliant (9/9)**:
  - `packages/core/src/application/use-cases/draft-change.ts` delegates to `change.draft(actor, input.reason, input.force)` inside `mutate(...)`.
  - `packages/core/src/domain/entities/change.ts#L1550-L1553` throws `HistoricalImplementationGuardError('draft', this._name)` when `this.hasEverReachedImplementing && force !== true`.
  - `packages/core/src/domain/errors/historical-implementation-guard-error.ts` has `code = 'IMPLEMENTATION_DETECTED'`, exposes `operation` and `changeName`, and its message omits `--force`.

### Discrepancies

- None.

### Test Coverage

- `packages/core/test/application/use-cases/draft-change.spec.ts` (9 tests passing)
- `packages/core/test/domain/errors/host-neutral-errors.spec.ts#L17-L23` (tests `HistoricalImplementationGuardError` omits `--force` and exposes `operation`, `changeName`)
- `packages/core/test/domain/entities/change.spec.ts#L995-L1038`

### Missing Tests (1)

- `draft-change.spec.ts` asserts `HistoricalImplementationGuardError` is thrown, but does not assert `error.operation === 'draft'`, `error.changeName`, or `!error.message.includes('--force')` on the `DraftChange.execute()` rejection (covered in `host-neutral-errors.spec.ts` and `change.spec.ts`).

### Summary

- `totalRequirements`: 9
- `compliant`: 9
- `discrepancies`: 0
- `missingTests`: 1
