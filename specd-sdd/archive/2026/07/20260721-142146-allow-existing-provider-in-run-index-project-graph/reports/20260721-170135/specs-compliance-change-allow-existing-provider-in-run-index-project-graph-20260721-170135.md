# Spec Compliance Report: allow-existing-provider-in-run-index-project-graph

- **Change**: `allow-existing-provider-in-run-index-project-graph`
- **Timestamp**: 2026-07-21 17:01:35
- **Audit Mode**: Specific Change (`--change`)

## Summary

- **Total Specs Audited**: 1 (`sdk:run-index-project-graph`)
- **Total Requirements**: 4
- **Conformant Requirements**: 4 (100%)
- **Non-Conformant Requirements**: 0 (0%)
- **Test Coverage**: 100% (7 unit tests passing)
- **Global Specs Compliance**: 100%

---

## Detailed Findings

### sdk:run-index-project-graph

- **Status**: CONFORMANT
- **Spec Path**: `specs/sdk/run-index-project-graph/spec.md`
- **Delta Path**: `deltas/sdk/run-index-project-graph/spec.md.delta.yaml`
- **Implementation**:
  - `packages/sdk/src/orchestration/run-index-project-graph.ts`
  - `packages/sdk/src/domain/errors/invalid-provider-lifecycle-error.ts`
- **Tests**: `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`

#### Requirement Audit

1. **`Requirement: runIndexProjectGraph orchestration`**
   - **Status**: PASS
   - **Verification**:
     - `input.provider` support implemented without wrapping in `withOpenGraphProvider` or closing the provider.
     - `InvalidProviderLifecycleError` validation guard implemented when `provider` is passed alongside `beforeOpen` or `afterClose`.
     - `beforeOpen` and `afterClose` forwarded to `withOpenGraphProvider` in transient mode.
2. **`Requirement: Lock acquisition out of scope`**
   - **Status**: PASS
3. **`Requirement: Progress callback passthrough`**
   - **Status**: PASS
4. **`Requirement: Result passthrough`**
   - **Status**: PASS
