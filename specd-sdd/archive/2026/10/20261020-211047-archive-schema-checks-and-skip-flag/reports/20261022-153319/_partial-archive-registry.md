# Partial compliance audit — archive checks and registry

Scope: delegated compliance for `archive-schema-checks-and-skip-flag`, verification attempt `verification-attempt-7`.

Audited merged change specs:

- `core:archive-change`
- `core:check-registry`
- `core:transition-checks`

The audit used merged change previews, the current code graph (not stale), direct dependency context (`core:change`, `core:schema-format`, `core:workflow-model`, `core:get-status`, and the global architecture/error-handling/testing constraints), source review, and focused tests.

## Requirements and evidence

### `core:archive-change`

**Archive check resolution and generic bypasses — pass.** `ArchiveChangeInput` exposes only `skipChecks` and `skipHookPhases`; it intentionally has no `allowOverlap` or `allowOutOfScope` booleans (`packages/core/src/application/use-cases/archive-change.ts:77-97`). `ArchiveChange.execute` resolves the change's sovereign schema, derives effective archive bindings using `{ operation: 'archive' }`, validates requested bypass ids before predicates/effects/writes, and evaluates the resulting bindings (`:300-348`). This supplies the required generic check bypass mechanism and prevents a bypass from skipping unrelated failed predicates.

**Archive effects are binding-driven — pass.** The archive use case selects `before-persist` effects using `matchingEffects`, applies only `pre`/`post`/`all` hook-phase selectors, and uses failure policy rather than hard-coded hook IDs (`archive-change.ts:381-415`). The paired post-persist path follows the same binding-table model. No `RunStepHooks` dependency is accepted by the use case.

**Safety and lifecycle/reconciliation guards — pass by code inspection and focused coverage.** The use case resolves the recorded schema before work, uses the required reconciler, requires `archivable`/`archiving`, performs archive predicates before effects, refreshes/reconciles after pre-effects, and blocks publication on post-hook invalidity (`archive-change.ts:285-348`, `:417+`). This is consistent with the hexagonal/global architecture rules: orchestration remains in the application use case while checks are injected dependencies.

**Evidence:** `archive-change.spec.ts` covers unknown/case-sensitive ids, effects rejected as check bypasses, locked checks, duplicate handling, schema-disabled checks, skip-only-overlap behavior, retry behavior, plugin/embedded archive checks, configuration/skippability, order, and no mutation of base bindings (notably lines 4388-5100). `archive-change-input.spec.ts` type-checks removal of legacy input booleans.

### `core:check-registry`

**Registry-backed archive bindings — pass.** `resolveEffectiveBindings` consumes the injected base binding table and optional registry, retains code-defined governance, applies declarations only at the archive coordinate, and synthesizes only registered, enabled unserved checks (`packages/core/src/domain/services/transition-checks.ts:635-810`). `validateSkipChecks` strictly validates canonical, case-sensitive ids; deduplicates in caller order; rejects unknown, hook/effect, and non-skippable bindings; and treats registered-but-unbound/disabled ids as harmless no-ops (`packages/core/src/application/services/validate-skip-checks.ts:41-60`).

**Evidence:** `validate-skip-checks.spec.ts` directly exercises all validation cases. `workflow-check-registry.spec.ts` verifies registry composition, archive bindings, required overlap/verification availability, and hook binding properties. Focused suite passed.

### `core:transition-checks`

**Schema-declared `archiveChecks` resolution — pass.** `resolveEffectiveBindings` rejects mixing archive operation with transition coordinates, overlays `archiving.archiveChecks` only on archive-scoped rows, splits residual rows, preserves binding policy unless a permitted declaration overrides it, applies one config cascade, and appends synthesized bindings in declaration order (`transition-checks.ts:635-810`). That keeps archive checks independent from normal transition `checks` and `skipChecks`.

**Evidence:** `transition-checks.spec.ts:1113-1350` covers unchanged base archive bindings; disable, skippable/config overlays; effect failure policy; registered synthesized checks and declaration order; disabled unserved checks; single config cascade; independent `checks` vs `archiveChecks`; no-registry behavior; invalid coordinate combinations; and unchanged non-archive resolution. `build-schema-archive-checks.spec.ts` validates schema construction/governance.

## Test execution

Passed:

```text
pnpm --filter @specd/core exec vitest run \
  test/application/use-cases/archive-change.spec.ts \
  test/application/use-cases/archive-change-input.spec.ts \
  test/domain/services/transition-checks.spec.ts \
  test/application/services/validate-skip-checks.spec.ts \
  test/domain/services/build-schema-archive-checks.spec.ts \
  test/composition/use-cases/workflow-check-registry.spec.ts

Test Files  6 passed (6)
Tests       237 passed (237)
```

## Discrepancies

None found in this assigned scope. The merged requirements align with the implementation and focused tests.

## Coverage gaps / limits

- This partial audit intentionally excludes the other nine change specs and CLI-specific command parsing/presentation; those require their respective audit batches.
- The focused tests validate the core application/domain behavior. This audit did not run the complete monorepo suite, typecheck, lint, or an actual filesystem archive operation against a real CLI invocation.
- Merged previews for the three assigned specs were consulted; requirements with large historical archive behavior outside the new archive-check/registry surface were sampled for integration guards rather than re-audited exhaustively.

## Summary

| Metric                         | Count |
| ------------------------------ | ----: |
| Assigned merged specs reviewed |     3 |
| Discrepancies                  |     0 |
| Blocking discrepancies         |     0 |
| Focused test files passed      |     6 |
| Focused tests passed           |   237 |
| Coverage limitations recorded  |     3 |

Conclusion: **pass for the assigned archive-check and registry scope**, subject to the stated out-of-scope coverage limits.
