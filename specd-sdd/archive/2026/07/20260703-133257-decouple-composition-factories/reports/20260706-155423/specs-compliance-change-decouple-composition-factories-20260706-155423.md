# Spec Compliance Audit

- Mode: `--change decouple-composition-factories`
- Change: `decouple-composition-factories`
- Timestamp: `20260706-155423`
- Result: `PASS_WITH_NOTES`

## Scope

- Change specs reviewed through merged previews and change context:
  - `core:composition`
  - `core:kernel`
  - `core:kernel-builder`
  - `core:composition-resolver`
  - `core:get-status`
  - `core:validate-specs`
  - `core:get-project-context`
  - `core:compile-context`
  - `sdk:build-project-status-snapshot`
- Dependency/global context reviewed through compiled context and project instructions:
  - `default:_global/architecture`
  - `default:_global/docs`
  - direct dependency summaries surfaced by `changes context`

## Evidence

- Verification hooks:
  - `changes run-hooks decouple-composition-factories verifying --phase pre` passed
  - `changes run-hooks decouple-composition-factories verifying --phase post` reported `no hooks to run`
- Repository checks:
  - `changes implementation review decouple-composition-factories` reported no open implementation-review issues
  - `graph stats` reported fresh index
- Targeted tests:
  - `@specd/core`
    - `test/composition/composition-resolver.spec.ts`
    - `test/composition/kernel-builder.spec.ts`
    - `test/application/use-cases/compile-context.spec.ts`
    - `test/application/use-cases/get-project-context.spec.ts`
    - Result: `101 passed`
  - `@specd/sdk`
    - `test/orchestration/build-project-status-snapshot.spec.ts`
    - Result: `5 passed`
- Prior verifying pre-hooks for the whole change also passed:
  - tests
  - lint
  - typecheck

## Findings

No spec/code compliance findings were confirmed in the audited scope.

## Checked contracts

- Composition factories now use two public call shapes only: `createX(deps)` and `createX(config, options?)`.
- Config-based factories delegate through `createCompositionResolver(...)` plus per-use-case `resolveXDeps(...)` helpers.
- Kernel is pure orchestration over `createX(...)` and shared composition primitives instead of owning alternate wiring logic.
- Kernel builder reuses the same composition-owned registry model and no longer exposes graph-store-specific surface.
- `createGetStatus(config)` preserves schema-aware wiring through `SchemaProvider` and resolver-derived deps.
- `createValidateSpecs(config)` preserves schema-aware wiring through resolver-derived deps and no longer drops schema customisation.
- `createGetProjectContext(config)` and `createCompileContext(config)` pass baked defaults via deps and respect runtime `llmOptimizedContext` gating.
- `buildProjectStatusSnapshot(...)` clears `graphHealth` and `hotspots` to `null` when hotspot loading fails, matching merged verify scenarios.

## Notes

- `changes context` still warns about missing metadata for `core:composition-resolver` and summary metadata for `core:core/project-metadata`.
- This did not produce a spec/code mismatch in the audited implementation. It is a metadata/context-generation quality issue, not a verified behavior defect in the change.

## Conclusion

The audited implementation is consistent with the merged change specs and targeted verification scenarios in the reviewed scope. No additional spec update or implementation fix is required based on this audit.
