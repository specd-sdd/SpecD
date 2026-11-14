# Spec Compliance Audit Report — `decouple-core-cli-error-hints`

- **Change:** `decouple-core-cli-error-hints`
- **Verification Attempt:** `verification-attempt-1` (delegated)
- **Timestamp:** `20261114-135350`
- **Specs Audited:** 20

## Executive Summary

| Batch                              |  Specs | Total Requirements | Compliant | Discrepancies | Missing Tests |
| ---------------------------------- | -----: | -----------------: | --------: | ------------: | ------------: |
| Batch 1 (`global-and-core-errors`) |      6 |                 66 |        65 |             1 |             6 |
| Batch 2 (`core-remaining`)         |      5 |                 58 |        56 |             2 |             3 |
| Batch 3 (`cli-specs`)              |      9 |                 81 |        78 |             3 |            10 |
| **Total**                          | **20** |            **205** |   **199** |         **6** |        **19** |

### Key Findings

1. **Core Host-Neutrality:** All 8 modified `@specd/core` error/service/use-case modules omit CLI flags and `specd ...` command syntax from runtime error messages and expose structured metadata properties (`existingDeps`, `incomingDeps`, `operation`, `changeName`, `state`, `gates`, `recoveries`, `specId`, `outOfScopeSpecIds`).
2. **Functional Discrepancies (3 in `@specd/cli`):**
   - `cli:change-transition`: `HappyPathNextUnavailableError` is caught by `isRepairGuideError` in `packages/cli/src/commands/change/transition.ts` and exits without calling `resolveCliErrorHint` or `handleError(..., { command: 'change.transition' })`.
   - `cli:change-transition`: `CLI_ERROR_HINTS['transition.explicit-step']` in `packages/cli/src/error-hints.ts` suggests `--to <state>`, whereas `change transition` takes a positional `<step>` argument (no `--to` flag exists).
   - `cli:change-archive`: In `json`/`toon` mode, `CheckPredicateFailedError` falls through to `handleError`, where `err.code` (`err.checkCode`) and `metadata.skippable` do not match `CLI_ERROR_HINT_RULES` (`code: 'impl.linksInScope'`, `metadata.isSkippable === true`), so `hint` is omitted in structured output.
3. **Minor JSDoc Discrepancies (3 in `@specd/core`):** Missing `@throws` tags on `InvalidateChange.execute`, `DraftChange.execute`, `TransitionChange.execute`, `GenerateSpecMetadata.execute`, `DiscardChange.execute`, and `ValidateArtifacts.execute`.
4. **Missing Test Assertions (19):** Command-level and use-case-level test assertions for several new hint/metadata paths (detailed per-spec below).

---

## Detailed Findings

<!-- BEGIN _partial-global-and-core-errors.md -->

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
<!-- END _partial-global-and-core-errors.md -->

<!-- BEGIN _partial-core-remaining.md -->

# Spec Compliance Audit — Batch 2: `core-remaining`

Change: `decouple-core-cli-error-hints` (`verification-attempt-1`)
Audited against merged specs, `default:_global/error-handling-conventions`, and `@specd/core` implementation + unit tests.

---

## 1. `core:discard-change`

### Requirements Summary

- `DiscardChange.execute(input: DiscardChangeInput)` accepts `name`, `reason` (required), `supersededBy` (optional), `force` (optional).
- Locates active change via `ChangeRepository.get(name)` or drafted change via `getDraft(name)`; throws `ChangeNotFoundError` otherwise.
- Resolves actor via `ActorResolver` and delegates `change.discard(reason, actor, supersededBy, force)` inside `mutate` / `mutateDraft`.
- Respects historical implementation guard (`HistoricalImplementationGuardError`, code `IMPLEMENTATION_DETECTED`), bypassed only when `force === true`.
- **Host-neutral `HistoricalImplementationGuardError`**: `message` MUST explain in host-neutral terms without embedding CLI flags such as `--force`, and MUST preserve `operation` and `changeName` metadata properties.
- Config-based `createDiscardChange(config, options?)` delegates through `resolveDiscardChangeDeps(resolver)` to canonical `createDiscardChange(deps)`.
- Consistency with `default:_global/error-handling-conventions`: `HistoricalImplementationGuardError` extends `SpecdError`, defines `code = 'IMPLEMENTATION_DETECTED'`, has JSDoc on class/properties; use case `execute` documents thrown errors with `@throws`.

### Implementation Status

- **Compliant** (with 1 minor JSDoc discrepancy vs `error-handling-conventions`):
  - `packages/core/src/application/use-cases/discard-change.ts`: implements `DiscardChange`, `DiscardChangeInput`, `get`/`getDraft` lookup, `mutate`/`mutateDraft` persistence, `ActorResolver`, and `change.discard(...)`.
  - `packages/core/src/domain/errors/historical-implementation-guard-error.ts`: extends `SpecdError`, `code = 'IMPLEMENTATION_DETECTED'`, exposes `operation` and `changeName`, and `message` is `"Cannot ${operation} a change that has reached implementing without force: implementation may already exist and specs and code could be left out of sync"` (no `--force` in `message`).
  - `packages/core/src/composition/use-cases/discard-change.ts`: `createDiscardChange` delegates through `resolveDiscardChangeDeps(resolver)`.

### Discrepancies

1. **Minor JSDoc gap (`default:_global/error-handling-conventions`)**: `DiscardChange.execute` (`packages/core/src/application/use-cases/discard-change.ts:44`) only documents `@throws {ChangeNotFoundError}` and omits `@throws {HistoricalImplementationGuardError}`. (Also note `historical-implementation-guard-error.ts:11` has `--force` in a class JSDoc comment, though not in `error.message`.)

### Test Coverage

- `packages/core/test/application/use-cases/discard-change.spec.ts` (9 tests, all passing): covers `discarded` event, `reason`, `supersededBy`, `mutate`, `ChangeNotFoundError`, and `HistoricalImplementationGuardError` with and without `force: true`.
- `packages/core/test/domain/entities/change.spec.ts` (lines 1047–1097): tests `c.discard(...)` throwing `HistoricalImplementationGuardError` with `operation === 'discard'` and `changeName`.
- `packages/core/test/domain/errors/host-neutral-errors.spec.ts` (lines 17–23): tests `HistoricalImplementationGuardError('draft', 'my-change')` omits `--force` and exposes `operation` and `changeName`.

### Missing Tests

1. `packages/core/test/application/use-cases/discard-change.spec.ts` (and `host-neutral-errors.spec.ts`) does not explicitly assert `error.message` omits `--force`, `error.operation === 'discard'`, and `error.changeName` when `DiscardChange.execute` throws `HistoricalImplementationGuardError` (only `toThrow(HistoricalImplementationGuardError)` is asserted in `discard-change.spec.ts`; `host-neutral-errors.spec.ts` only tests `'draft'`).
2. `discard-change.spec.ts` does not cover drafted change discard via `mutateDraft` or `resolveDiscardChangeDeps` composition delegation.

### Summary Counts

- `totalRequirements`: 8
- `compliant`: 7
- `discrepancies`: 1
- `missingTests`: 2

---

## 2. `core:transition-checks`

### Requirements Summary

- Shared check registry, `Check` / `CustomCheckDefinition` ABI, `CheckBindingSpec` / `CheckBinding`, one implementation module per check, no shared `PredicateSnapshots` bag, generic check progress bus (`check-start`, `check-progress`, `check-done`), approval precedence, and production composition.
- **Host-neutral `impl.linksInScope` message**: `detectImplLinksInScope` returns `{ blocked: true, outOfScopeSpecIds, message }` when confirmed implementation links target specs outside `change.specIds`, and `message` MUST NOT contain `--allow-out-of-scope`.

### Implementation Status

- **Compliant**:
  - `packages/core/src/application/services/detect-impl-links-in-scope.ts`: `detectImplLinksInScope(change)` computes `outOfScopeSpecIds` via `collectOutOfScopeImplementationSpecIds(linkedSpecIds, change.specIds)`. When non-empty, returns `blocked: true`, `outOfScopeSpecIds`, and `message`: `` `Implementation sidecar updates would touch ${String(count)} ${noun} outside the change "${change.name}" scope (${list}). Re-run with allowOutOfScope if intentional.` `` (no `--allow-out-of-scope`).
  - `packages/core/src/domain/checks/impl-links-in-scope.ts` & `packages/core/src/application/checks/impl-links-in-scope.ts`: consume `detectImplLinksInScope` and pass its `message` into the check result.
  - `packages/core/src/domain/services/check-bindings.ts` & `packages/core/src/composition/use-cases/workflow-check-registry.ts`: wire `detectImplLinksInScope` into the workflow check registry.

### Discrepancies

- None.

### Test Coverage

- `packages/core/test/domain/services/transition-checks.spec.ts` (69 tests, all passing) and `packages/core/test/domain/services/check-bindings.spec.ts` (9 tests, all passing) cover check registry, bindings, skippability, progress bus, and `impl.linksInScope` check behavior.
- `packages/core/test/application/use-cases/archive-change.spec.ts` (lines 3599–3642) exercises out-of-scope `impl.linksInScope` failure via `ArchiveChange`.

### Missing Tests

1. **No direct unit test for `detectImplLinksInScope` host-neutral message**: No test in `packages/core/test/` directly invokes `detectImplLinksInScope` on a change with out-of-scope `implementationLinks` and asserts `blocked === true`, `outOfScopeSpecIds`, and `!result.message.includes('--allow-out-of-scope')` as specified in `core:transition-checks` `verify.md` ("Out-of-scope detection message omits --allow-out-of-scope").

### Summary Counts

- `totalRequirements`: 13
- `compliant`: 13
- `discrepancies`: 0
- `missingTests`: 1

---

## 3. `core:edit-change`

### Requirements Summary

- `EditChange.execute(input: EditChangeInput)` validates/normalizes `addSpecIds` with `parseSpecId`, rejects `readOnly` workspaces with `ReadOnlyWorkspaceError`, validates `invalidation` policy, checks `ChangeNotFoundError`, performs serialized mutation via `ReconcileChangeValidity` / `ChangeRepository.mutate`.
- `removeSpecIds` entries not in `change.specIds` fail with `SpecNotInChangeError` (never `InvalidSpecIdError`), with duplicate removals collapsed.
- **Host-neutral `SpecNotInChangeError`**: `error.message` MUST NOT contain CLI command syntax (`specd specs show`), and `error.specId` and `error.changeName` MUST be exposed as metadata properties.
- Config-based `createEditChange(config, options?)` delegates through `resolveEditChangeDeps(resolver)`.

### Implementation Status

- **Compliant**:
  - `packages/core/src/application/errors/spec-not-in-change-error.ts`: extends `SpecdError`, `code = 'SPEC_NOT_IN_CHANGE'`, exposes `specId` and `changeName` getters, JSDoc present, and `message` is `` `Spec '${specId}' is not in the current specIds of change '${changeName}'.` `` (no `specd specs show`).
  - `packages/core/src/application/use-cases/edit-change.ts`: throws `new SpecNotInChangeError(id, input.name)` at line 300; `@throws` JSDoc documents all thrown errors including `SpecNotInChangeError`.
  - `packages/core/src/composition/use-cases/edit-change.ts`: `createEditChange` delegates through `resolveEditChangeDeps(resolver)`.

### Discrepancies

- None.

### Test Coverage

- `packages/core/test/application/use-cases/edit-change.spec.ts` (47 tests, all passing): covers `SpecNotInChangeError` when removing absent specs (lines 274–285) and invalid raw removal IDs (lines 933–945), plus validation, `readOnly` workspace rejection, policy updates, and reconciliation.
- `packages/core/test/domain/errors/host-neutral-errors.spec.ts` (lines 38–45): directly asserts `SpecNotInChangeError` `code === 'SPEC_NOT_IN_CHANGE'`, `specId`, `changeName`, exact `message`, and absence of `'specd specs show'`.

### Missing Tests

- None for the audited scope.

### Summary Counts

- `totalRequirements`: 12
- `compliant`: 12
- `discrepancies`: 0
- `missingTests`: 0

---

## 4. `core:validate-artifacts`

### Requirements Summary

- `ValidateArtifacts` validates change- and spec-scoped artifacts against the sovereign schema resolved via `ResolveChangeSchema`, checks required artifacts and dependency order via `evaluateLifecycleVerdict(change, schema, { checksByTarget: {} })`, extracts and persists `dependsOn`, and is the single chokepoint for `complete` status.
- Throws `SpecNotInChangeError` when `specPath` is not in `change.specIds` (for spec-scoped or unspecified `artifactId`) or when `specPath` is omitted for a `scope: spec` `artifactId`.
- **Host-neutral `SpecNotInChangeError`**: `error.message` MUST NOT contain `specd specs show`, and `error.specId` and `error.changeName` are exposed as metadata properties.
- Config-based `createValidateArtifacts(config, options?)` delegates through `resolveValidateArtifactsDeps(resolver)`.

### Implementation Status

- **Compliant** (with 1 minor JSDoc discrepancy vs `error-handling-conventions`):
  - `packages/core/src/application/use-cases/validate-artifacts.ts`: throws `new SpecNotInChangeError(parsed.specId, input.name)` (line 210) and `new SpecNotInChangeError('<specPath required>', input.name)` (lines 221, 283). Uses `SpecNotInChangeError` from `application/errors/spec-not-in-change-error.ts` (host-neutral, `specId` and `changeName` metadata).
  - `packages/core/src/composition/use-cases/validate-artifacts.ts`: `createValidateArtifacts` delegates through `resolveValidateArtifactsDeps(resolver)`.

### Discrepancies

1. **Minor JSDoc gap (`default:_global/error-handling-conventions`)**: `ValidateArtifacts.execute` (`packages/core/src/application/use-cases/validate-artifacts.ts:176-177`) only documents `@throws {ChangeNotFoundError}` and `@throws {SchemaNotFoundError}`, omitting `@throws {SpecNotInChangeError}` (as well as `InvalidSpecIdError`, `WorkspaceNotFoundError`, `SchemaProviderIdentityMismatchError`).

### Test Coverage

- `packages/core/test/application/use-cases/validate-artifacts.spec.ts` (71 tests, all passing): tests `SpecNotInChangeError` when `specPath` is not in `change.specIds` (lines 123–139) and when `spec-scoped` artifact omits `specPath` (lines 4064–4080).
- `packages/core/test/domain/errors/host-neutral-errors.spec.ts` (lines 38–45): tests `SpecNotInChangeError` host-neutral message and metadata properties.

### Missing Tests

- None for the audited scope.

### Summary Counts

- `totalRequirements`: 14
- `compliant`: 13
- `discrepancies`: 1
- `missingTests`: 0

---

## 5. `core:preview-spec`

### Requirements Summary

- `PreviewSpec.execute({ name, specId, includeDiff })` validates/normalizes `specId` via `parseSpecId`, loads change (`ChangeNotFoundError`), resolves sovereign schema via `ResolveChangeSchema` (`SchemaProviderIdentityMismatchError`), verifies `specId` is in `change.specIds` (`SpecNotInChangeError`), applies deltas / loads new spec artifacts, orders `spec.md` first then alphabetical, and generates unified diffs when `includeDiff: true`.
- Public `@throws` documentation on `execute` MUST list `InvalidSpecIdError`, `WorkspaceNotFoundError`, `ChangeNotFoundError`, `SchemaProviderIdentityMismatchError`, and `SpecNotInChangeError`.
- **Host-neutral `SpecNotInChangeError`**: `error.message` MUST NOT contain `specd specs show`, and `error.specId` and `error.changeName` are exposed as metadata properties.
- Config-based `createPreviewSpec(config, options?)` delegates through `resolvePreviewSpecDeps(resolver)`.

### Implementation Status

- **Compliant**:
  - `packages/core/src/application/use-cases/preview-spec.ts`: validates `specId`, resolves schema, throws `new SpecNotInChangeError(specId, change.name)` (line 122), and documents all 5 `@throws` tags (lines 101–105).
  - `packages/core/src/application/errors/spec-not-in-change-error.ts`: host-neutral message, exposes `specId` and `changeName`.
  - `packages/core/src/composition/use-cases/preview-spec.ts`: `createPreviewSpec` delegates through `resolvePreviewSpecDeps(resolver)`.

### Discrepancies

- None.

### Test Coverage

- `packages/core/test/application/use-cases/preview-spec.spec.ts` (25 tests, all passing): covers `SpecNotInChangeError` (lines 133–143, 738–746), schema resolution, delta application, ordering, diff generation, and partial-failure warnings.
- `packages/core/test/domain/errors/host-neutral-errors.spec.ts` (lines 38–45): tests `SpecNotInChangeError` host-neutral message and metadata properties.

### Missing Tests

- None for the audited scope.

### Summary Counts

- `totalRequirements`: 11
- `compliant`: 11
- `discrepancies`: 0
- `missingTests`: 0
<!-- END _partial-core-remaining.md -->

<!-- BEGIN _partial-cli-specs.md -->

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
<!-- END _partial-cli-specs.md -->
