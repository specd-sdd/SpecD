# Delegated Compliance Audit — Batch 2: `core-remaining`

- **Change:** `decouple-core-cli-error-hints` (`20261114-104525-decouple-core-cli-error-hints`)
- **Verification Attempt:** `verification-attempt-2`
- **Assigned Specs:** `core:discard-change`, `core:transition-checks`, `core:edit-change`, `core:validate-artifacts`, `core:preview-spec`
- **Audit Mode:** Delegated Change (read-only)

---

## Summary Table

| Spec ID                   | Status    | Requirements Audited                | Implemented | Discrepancies | Test Coverage                                                                                                                                                 |
| ------------------------- | --------- | ----------------------------------- | ----------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:discard-change`     | Compliant | 9                                   | 9           | 0             | Covered (`discard-change.spec.ts`, `change.spec.ts`, `host-neutral-errors.spec.ts`); minor gap on `mutateDraft` in `discard-change.spec.ts`                   |
| `core:transition-checks`  | Compliant | Change delta + core check contracts | Verified    | 0             | Covered (`detect-impl-links-in-scope.spec.ts`, `transition-checks.spec.ts`); minor gap on `count > 3` compact summary in `detect-impl-links-in-scope.spec.ts` |
| `core:edit-change`        | Compliant | Change delta + core contracts       | Verified    | 0             | Covered (`edit-change.spec.ts`, `host-neutral-errors.spec.ts`)                                                                                                |
| `core:validate-artifacts` | Compliant | Change delta + core contracts       | Verified    | 0             | Covered (`validate-artifacts.spec.ts`, `host-neutral-errors.spec.ts`)                                                                                         |
| `core:preview-spec`       | Compliant | Change delta + core contracts       | Verified    | 0             | Covered (`preview-spec.spec.ts`, `composition/use-cases/preview-spec.spec.ts`, `host-neutral-errors.spec.ts`)                                                 |

---

## Test Execution Evidence

Executed targeted Vitest run in `@specd/core`:

```bash
pnpm --filter @specd/core exec vitest run \
  test/domain/errors/host-neutral-errors.spec.ts \
  test/application/use-cases/discard-change.spec.ts \
  test/application/services/detect-impl-links-in-scope.spec.ts \
  test/domain/services/transition-checks.spec.ts \
  test/application/use-cases/edit-change.spec.ts \
  test/application/use-cases/validate-artifacts.spec.ts \
  test/application/use-cases/preview-spec.spec.ts \
  test/composition/use-cases/preview-spec.spec.ts
```

- **Result:** 8 test files passed, 234 tests passed, 0 failed, 0 skipped.

---

## Detailed Findings

### 1. `core:discard-change`

- **Spec Preview:** `node packages/cli/dist/index.js changes spec-preview decouple-core-cli-error-hints core:discard-change`
- **Implementation:**
  - [discard-change.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/discard-change.ts#L7-L67)
  - [discard-change.ts (composition)](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/composition/use-cases/discard-change.ts#L15-L97)
  - [historical-implementation-guard-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/errors/historical-implementation-guard-error.ts#L14-L46)
- **Requirements & Implementation Status:**
  - **Input contract (`DiscardChangeInput`):** `name`, `reason`, `supersededBy?`, `force?` ([discard-change.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/discard-change.ts#L7-L16)).
  - **Change must exist & Persistence:** Checks `get(name)` first and mutates via `mutate(name, fn)`; falls back to `getDraft(name)` and mutates via `mutateDraft(name, fn)`; throws `ChangeNotFoundError` when neither exists ([discard-change.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/discard-change.ts#L48-L65)).
  - **Actor resolution:** Resolves `await this._actor.identity()` ([discard-change.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/discard-change.ts#L54)).
  - **Historical implementation guard & Host-neutral `HistoricalImplementationGuardError`:** `change.discard(input.reason, actor, input.supersededBy, input.force)` enforces the guard. `HistoricalImplementationGuardError` extends `SpecdError`, sets `code` to `'IMPLEMENTATION_DETECTED'`, exposes `operation` and `changeName`, and formats `message` as `` `Cannot ${operation} a change that has reached implementing without force: implementation may already exist and specs and code could be left out of sync` `` without `--force` ([historical-implementation-guard-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/errors/historical-implementation-guard-error.ts#L14-L46)).
  - **Config-based factory:** `createDiscardChange(config, options?)` creates a composition resolver, derives `DiscardChangeDeps` (`changes`, `actor`) via `resolveDiscardChangeDeps(resolver)`, and delegates to `createDiscardChange(deps)` ([discard-change.ts (composition)](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/composition/use-cases/discard-change.ts#L28-L87)).
- **Discrepancies:** None.
- **Test Coverage & Gaps:**
  - [discard-change.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/application/use-cases/discard-change.spec.ts#L1-L127) (9 tests passing) covers active discard, `reason`, `supersededBy`, `mutate`, `ChangeNotFoundError`, and `HistoricalImplementationGuardError` with/without `force`.
  - [host-neutral-errors.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/domain/errors/host-neutral-errors.spec.ts#L17-L29) explicitly verifies `HistoricalImplementationGuardError` (`code === 'IMPLEMENTATION_DETECTED'`, `message` omits `--force`, `operation === 'discard'`, `changeName === 'my-change'`).
  - **Minor test gap:** `discard-change.spec.ts` does not explicitly exercise the `getDraft` / `mutateDraft` branch.

---

### 2. `core:transition-checks`

- **Spec Preview:** `node packages/cli/dist/index.js changes spec-preview decouple-core-cli-error-hints core:transition-checks`
- **Implementation:**
  - [detect-impl-links-in-scope.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/services/detect-impl-links-in-scope.ts#L6-L54)
  - [impl-links-in-scope.ts (domain)](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/checks/impl-links-in-scope.ts#L22-L62)
  - [impl-links-in-scope.ts (application)](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/checks/impl-links-in-scope.ts#L20-L77)
  - [transition-checks.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/services/transition-checks.ts)
- **Requirements & Implementation Status:**
  - **Host-neutral `impl.linksInScope` message (change delta):** `detectImplLinksInScope(change)` computes `outOfScopeSpecIds`, formats a compact summary (`count <= 3 ? shown.join(', ') : \`examples: ${shown.join(', ')}\``), and sets `message` to `` `Implementation sidecar updates would touch ${String(count)} ${noun} outside the change "${change.name}" scope (${list}). Re-run with allowOutOfScope if intentional.` `` — omitting `--allow-out-of-scope`and preserving`outOfScopeSpecIds` ([detect-impl-links-in-scope.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/services/detect-impl-links-in-scope.ts#L39-L54)).
  - `runImplLinksInScope` and `createImplLinksInScope` propagate `detection.blocked` and `detection.message` into `CheckResult` without adding CLI flags ([impl-links-in-scope.ts (domain)](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/checks/impl-links-in-scope.ts#L22-L31), [impl-links-in-scope.ts (application)](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/checks/impl-links-in-scope.ts#L57-L65)).
  - No CLI flags or `specd` command syntax appear in runtime error/diagnostic messages in `transition-checks.ts`.
- **Discrepancies:** None.
- **Test Coverage & Gaps:**
  - [detect-impl-links-in-scope.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/application/services/detect-impl-links-in-scope.spec.ts#L5-L30) (2 tests passing) verifies `blocked: false` when in scope and `blocked: true` with `outOfScopeSpecIds` and `message` omitting `--allow-out-of-scope`.
  - [transition-checks.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/domain/services/transition-checks.spec.ts) (69 tests passing).
  - **Minor test gap:** `detect-impl-links-in-scope.spec.ts` does not test the `count > 3` compact `examples:` branch.

---

### 3. `core:edit-change`

- **Spec Preview:** `node packages/cli/dist/index.js changes spec-preview decouple-core-cli-error-hints core:edit-change`
- **Implementation:**
  - [edit-change.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/edit-change.ts#L300)
  - [edit-change.ts (composition)](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/composition/use-cases/edit-change.ts#L36-L118)
  - [spec-not-in-change-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/errors/spec-not-in-change-error.ts#L6-L36)
- **Requirements & Implementation Status:**
  - **Host-neutral `SpecNotInChangeError` (change delta):** When removing an absent spec ID, `EditChange` throws `new SpecNotInChangeError(id, input.name)` ([edit-change.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/edit-change.ts#L300)). `SpecNotInChangeError` extends `SpecdError`, defines `code: 'SPEC_NOT_IN_CHANGE'`, exposes `specId` and `changeName` getters, and sets `message` to `` `Spec '${specId}' is not in the current specIds of change '${changeName}'.` `` without `specd specs show` ([spec-not-in-change-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/errors/spec-not-in-change-error.ts#L6-L36)).
  - **Config-based factory:** `createEditChange` derives `EditChangeDeps` through `resolveEditChangeDeps(resolver)` and delegates to `createEditChange(deps)` ([edit-change.ts (composition)](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/composition/use-cases/edit-change.ts#L36-L118)).
- **Discrepancies:** None.
- **Test Coverage:**
  - [edit-change.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/application/use-cases/edit-change.spec.ts) (47 tests passing, including `SpecNotInChangeError` checks at lines 154, 274-284, 933-941).
  - [host-neutral-errors.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/domain/errors/host-neutral-errors.spec.ts#L47-L54) explicitly verifies `SpecNotInChangeError` (`code === 'SPEC_NOT_IN_CHANGE'`, `specId`, `changeName`, and `message` omits `specd specs show`).

---

### 4. `core:validate-artifacts`

- **Spec Preview:** `node packages/cli/dist/index.js changes spec-preview decouple-core-cli-error-hints core:validate-artifacts`
- **Implementation:**
  - [validate-artifacts.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/validate-artifacts.ts#L213-L226) and [L283-L288](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/validate-artifacts.ts#L283-L288)
  - [validate-artifacts.ts (composition)](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/composition/use-cases/validate-artifacts.ts#L43-L99)
  - [spec-not-in-change-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/errors/spec-not-in-change-error.ts#L6-L36)
- **Requirements & Implementation Status:**
  - **Host-neutral `SpecNotInChangeError` (change delta):** `ValidateArtifacts` throws `new SpecNotInChangeError(parsed.specId, input.name)` when `specPath` is not in `change.specIds` for a spec-scoped target, and `new SpecNotInChangeError('<specPath required>', input.name)` when `specPath` is omitted for a spec-scoped artifact ([validate-artifacts.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/validate-artifacts.ts#L213-L288)). `SpecNotInChangeError` is host-neutral without `specd specs show` and exposes `specId` and `changeName`.
  - **Config-based factory:** `createValidateArtifacts` derives `ValidateArtifactsDeps` through `resolveValidateArtifactsDeps(resolver)` without resolving `lifecycle`/`LifecycleEngine` ([validate-artifacts.ts (composition)](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/composition/use-cases/validate-artifacts.ts#L43-L61)).
- **Discrepancies:** None.
- **Test Coverage:**
  - [validate-artifacts.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/application/use-cases/validate-artifacts.spec.ts) (71 tests passing, including `SpecNotInChangeError` at lines 123-138 and 4064-4079).
  - [host-neutral-errors.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/domain/errors/host-neutral-errors.spec.ts#L47-L54) verifies `SpecNotInChangeError` host-neutrality and metadata.

---

### 5. `core:preview-spec`

- **Spec Preview:** `node packages/cli/dist/index.js changes spec-preview decouple-core-cli-error-hints core:preview-spec`
- **Implementation:**
  - [preview-spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/preview-spec.ts#L96-L124)
  - [preview-spec.ts (composition)](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/composition/use-cases/preview-spec.ts#L35-L100)
  - [spec-not-in-change-error.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/errors/spec-not-in-change-error.ts#L6-L36)
- **Requirements & Implementation Status:**
  - **Host-neutral `SpecNotInChangeError` (change delta):** `PreviewSpec.execute` throws `new SpecNotInChangeError(specId, change.name)` when `!change.specIds.includes(specId)` ([preview-spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/preview-spec.ts#L121-L123)). `@throws` documentation lists `InvalidSpecIdError`, `WorkspaceNotFoundError`, `ChangeNotFoundError`, `SchemaProviderIdentityMismatchError`, and `SpecNotInChangeError` ([preview-spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/preview-spec.ts#L101-L105)).
  - **Config-based factory:** `createPreviewSpec` derives `PreviewSpecDeps` through `resolvePreviewSpecDeps(resolver)` and delegates to `createPreviewSpec(deps)` ([preview-spec.ts (composition)](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/composition/use-cases/preview-spec.ts#L35-L82)).
- **Discrepancies:** None.
- **Test Coverage:**
  - [preview-spec.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/application/use-cases/preview-spec.spec.ts) (25 tests passing, including `SpecNotInChangeError` at lines 133-142 and 744).
  - [preview-spec.spec.ts (composition)](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/composition/use-cases/preview-spec.spec.ts) (6 tests passing).
  - [host-neutral-errors.spec.ts](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/domain/errors/host-neutral-errors.spec.ts#L47-L54).

---

## Global & Dependency Consistency

- **`default:_global/error-handling-conventions`:** Both `HistoricalImplementationGuardError` (`IMPLEMENTATION_DETECTED`) and `SpecNotInChangeError` (`SPEC_NOT_IN_CHANGE`) extend `SpecdError`, use `UPPER_SNAKE_CASE` error codes, include JSDoc comments, omit CLI flags/command syntax from `message`, and expose structured metadata getters (`operation`/`changeName` and `specId`/`changeName`). `detectImplLinksInScope` likewise omits `--allow-out-of-scope` and preserves `outOfScopeSpecIds`.
- **`default:_global/architecture`:** Domain, application, and composition boundaries are respected across all 5 audited specs.

---

## Batch Totals

- **Specs Audited:** 5
- **Compliant:** 5
- **Discrepancies:** 0
- **Tests Verified:** 8 files, 234 tests passed
