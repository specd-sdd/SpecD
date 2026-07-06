# Specs Compliance Report

- Mode: change
- Change: `decouple-composition-factories`
- Generated at: `2026-07-04 20:10:45`
- Report directory: `specd-sdd/changes/20260703-133257-decouple-composition-factories/reports/20260704-201045`

## Scope

- Change specs audited: 56
- Relevant global/project constraints applied:
  - graph-first exploration
  - spec-driven workflow only
  - composition is the only core layer allowed to import infrastructure
  - explicit public APIs, no concrete adapter leakage on curated public surfaces
  - JSDoc/testing/documentation constraints from global specs

## Inputs Reviewed

- Change state from `changes status decouple-composition-factories --format toon`
- Merged verify previews for:
  - `core:composition`
  - `core:kernel`
  - `core:kernel-builder`
  - `core:composition-resolver`
- Code graph freshness and impact analysis
- Change implementation tracking review
- Built export surfaces from `packages/core/dist/*`
- Focused core test execution for the affected composition and implementation-tracking surfaces

## Aggregate Outcome

- Result: clean audit
- Material discrepancies found: 0
- Spec drift requiring design changes: 0
- Implementation defects requiring code changes: 0
- Critical coverage gaps: 0

## Key Evidence

- Graph freshness:
  - `stale: false`
  - stale symbol diagnostics authoritative
- Change implementation review:
  - `open: (none)`
  - no out-of-scope sidecars
  - confirmed links present for composition/kernel/docs/CLI surfaces touched by the change
- Focused Vitest verification:
  - 14 files passed
  - 71 tests passed
  - 0 failed
- Shared refactor surface:
  - `normalizeCompositionFactoryArgs` affects 59 files
  - `createCompositionResolver` affects 62 files
  - dependency graph confirms shared adoption across the targeted `composition/use-cases/*` surface
- Public surface:
  - curated root exports factories and port-level contracts
  - curated root does not leak `FsSpecRepository` or `NodeHookRunner`
  - `./extensions` exposes `createKernelBuilder`
  - `extensions.d.ts` exports `ChangeStorageFactory`, `KernelBuilder`, and `createKernelBuilder`

## Findings

- No contradictory requirement/implementation pairs were identified in the audited change scope.
- No inconsistency was found between the change-level composition/kernel contracts and the relevant global constraints.
- No evidence was found that the kernel builder introduces a second source of truth; available evidence points to builder reuse of the same kernel/composition path.
- No evidence was found that the new config-or-deps factories reintroduce fs-shaped public constructor inputs on the canonical deps forms.

## Residual Observations

- Several specs still lack LLM-optimized metadata/context according to `changes context` warnings. This is metadata hygiene debt, not a compliance failure in the audited change.
- The kernel and shared composition helpers remain high-blast-radius hotspots. Future changes should continue to use focused graph impact checks and targeted regression tests.

## Detailed Findings

### Partial: change-scope

# Spec Compliance Partial — decouple-composition-factories

## Mode

- Change audit: `decouple-composition-factories`
- Scope size: 56 change specs
- Project/global context applied: graph-first, spec-driven workflow, hexagonal architecture, explicit public API, JSDoc, Vitest

## Requirements Summary

- Core contract shift verified: composition factories now support canonical `createX(deps)` plus convenience `createX(config, options?)`.
- Shared normalization path verified: `normalizeCompositionFactoryArgs` is the common entry across the affected composition factories.
- Shared resolver path verified: `createCompositionResolver` is reused across the affected composition factories and kernel assembly.
- Kernel/builder orchestration verified: kernel remains orchestration over composition factories; builder reuses the same composition semantics instead of defining an alternate model.
- Implementation-tracking CLI/core additions verified: update/review flow is wired, tracked, and covered by focused tests.
- Public surface constraints verified: curated root exports expose factories and port-level abstractions without leaking concrete infra adapters.

## Implementation Status

- Code graph freshness: `stale: false`
- Implementation tracking review:
  - `open: (none)`
  - no out-of-scope sidecars
  - confirmed links present for composition, kernel, kernel-builder, composition-resolver, implementation-tracking use cases, docs, and CLI implementation tracking commands
- Graph impact evidence:
  - `normalizeCompositionFactoryArgs` has 49 direct dependents and affects 59 files
  - `createCompositionResolver` has 53 direct dependents and affects 62 files
  - both symbols reach the expected `packages/core/src/composition/use-cases/*.ts` surface, which is consistent with the refactor intent

## Dynamic Verification And Coverage

- Focused Vitest run passed:
  - 14 test files
  - 71 tests
  - 0 failures
- Covered areas:
  - `packages/core/test/composition/composition-resolver.spec.ts`
  - `packages/core/test/composition/use-cases/get-implementation-review.spec.ts`
  - `packages/core/test/composition/use-cases/update-implementation-tracking.spec.ts`
  - `packages/core/test/composition/use-cases/get-status.spec.ts`
  - `packages/core/test/composition/use-cases/list-changes.spec.ts`
  - `packages/core/test/composition/use-cases/list-drafts.spec.ts`
  - `packages/core/test/composition/use-cases/list-discarded.spec.ts`
  - `packages/core/test/composition/use-cases/get-project-summary.spec.ts`
  - corresponding application-layer tests for `get-status`, `update-implementation-tracking`, `list-changes`, `list-drafts`, `list-discarded`, `get-project-summary`

## Public Surface Review

- Runtime export checks against built artifacts:
  - root exports `createKernel`
  - root exports `createChangeRepository`
  - root exports `createSpecRepository`
  - root does not export `FsSpecRepository`
  - root does not export `NodeHookRunner`
  - `./extensions` exports `createKernelBuilder`
- Type surface checks against `packages/core/dist/extensions.d.ts`:
  - `ChangeStorageFactory` exported
  - `KernelBuilder` exported
  - `createKernelBuilder` exported

## Discrepancies

- No material spec/implementation discrepancies found in the audited change scope.
- No public-surface leakage of concrete fs/node adapters found in the audited root exports.
- No implementation-tracking drift found after the change-scoped tracking cleanup.

## Residual Risks

- `changes context` emitted warnings about several specs lacking LLM-optimized metadata/context. This did not block functional verification or compliance review, but it remains metadata hygiene debt rather than a code/spec contract failure.
- The kernel and shared normalization/resolver symbols remain CRITICAL graph hotspots. The refactor is internally consistent, but future changes in these areas still require careful regression review.

## Summary Counts

- Audited change specs: 56
- Material discrepancies: 0
- Coverage gaps requiring follow-up: 0 critical, 0 high
- Residual hygiene observations: 1
