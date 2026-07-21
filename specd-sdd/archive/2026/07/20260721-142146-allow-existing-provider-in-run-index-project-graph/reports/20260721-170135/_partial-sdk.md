# Spec Compliance Audit: sdk:run-index-project-graph

## Requirements Summary

- Total Requirements: 4
- Fully Implemented: 4
- Discrepancies / Gaps: 0
- Test Coverage: 100%

## Detailed Findings

### Requirement: runIndexProjectGraph orchestration

- **Status**: Implemented & Verified
- **Code Locations**: `packages/sdk/src/orchestration/run-index-project-graph.ts`, `packages/sdk/src/domain/errors/invalid-provider-lifecycle-error.ts`
- **Tests**: `packages/sdk/test/orchestration/run-index-project-graph.spec.ts` (7 passing tests)
- **Scenarios Verified**:
  1. Full workspace index with transient provider and lifecycle hooks: PASS
  2. Existing open provider bypasses withOpenGraphProvider and hooks: PASS
  3. Conflicting lifecycle hooks with existing provider throws `InvalidProviderLifecycleError`: PASS
  4. Subset workspace index: PASS

### Requirement: Lock acquisition out of scope

- **Status**: Implemented & Verified
- **Details**: `runIndexProjectGraph` does not acquire locks directly; locks are handled via `beforeOpen` hook.

### Requirement: Progress callback passthrough

- **Status**: Implemented & Verified
- **Details**: `input.onProgress` is forwarded directly to `IndexProjectGraph`.

### Requirement: Result passthrough

- **Status**: Implemented & Verified
- **Details**: `RunIndexProjectGraphResult` passes `IndexResult` fields without mapping loss.

## Compliance with Global Specs

- `default:_global/architecture`: PASS. Hexagonal architecture respected; orchestration delegates to application use cases.
- `default:_global/conventions`: PASS. ESM-only, getter for error code, explicit types, full JSDoc.
- `default:_global/testing`: PASS. Unit tests isolate orchestration logic and verify error conditions.
