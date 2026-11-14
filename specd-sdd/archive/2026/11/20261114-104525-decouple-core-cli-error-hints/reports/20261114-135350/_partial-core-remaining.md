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

---

## Overall Batch 2 Summary (`core-remaining`)

| Spec                      | `totalRequirements` | `compliant` | `discrepancies` | `missingTests` |
| ------------------------- | ------------------: | ----------: | --------------: | -------------: |
| `core:discard-change`     |                   8 |           7 |               1 |              2 |
| `core:transition-checks`  |                  13 |          13 |               0 |              1 |
| `core:edit-change`        |                  12 |          12 |               0 |              0 |
| `core:validate-artifacts` |                  14 |          13 |               1 |              0 |
| `core:preview-spec`       |                  11 |          11 |               0 |              0 |
| **Total**                 |              **58** |      **56** |           **2** |          **3** |

- **All audited `@specd/core` unit test suites passed** (235 tests across 7 test files: `host-neutral-errors.spec.ts`, `discard-change.spec.ts`, `edit-change.spec.ts`, `validate-artifacts.spec.ts`, `preview-spec.spec.ts`, `transition-checks.spec.ts`, `check-bindings.spec.ts`).
- **Core host-neutral error decoupling is implemented cleanly**: `HistoricalImplementationGuardError`, `SpecNotInChangeError`, and `detectImplLinksInScope` all omit CLI flags/commands from runtime messages and expose structured metadata (`operation`, `changeName`, `specId`, `outOfScopeSpecIds`).
- **Remaining minor gaps**:
  1. Missing `@throws {HistoricalImplementationGuardError}` on `DiscardChange.execute` and missing `@throws {SpecNotInChangeError}` on `ValidateArtifacts.execute` (`default:_global/error-handling-conventions`).
  2. Missing direct unit test for `detectImplLinksInScope` asserting `blocked: true`, `outOfScopeSpecIds`, and `!message.includes('--allow-out-of-scope')`, and missing assertion on `error.message`/`operation`/`changeName` in `discard-change.spec.ts` (`host-neutral-errors.spec.ts` only tests `'draft'`).
