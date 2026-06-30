# Spec Compliance Audit: Batch 3 - CLI & Core

Change: llm-optimized-metadata

## Audit Status

- **cli:spec-context**: Partially Compliant. Implementation present but override logic needs verification.
- **core:compile-context**: Compliant. Optimization and fingerprinting logic present.
- **core:get-project-context**: Compliant.
- **cli:project-context**: Compliant.
- **cli:spec-list**: Partially Compliant. Ordering might be inconsistent due to lack of explicit sorting.
- **cli:project-status**: Compliant. Consolidates project info correctly.
- **cli:change-context**: Compliant. Handles refresh and fingerprinting.

## Discrepancies & Observations

- **Spec List Ordering**: `FsSpecRepository` and `ListSpecs` may lack explicit lexicographical sorting, leading to platform-dependent ordering.
- **Optimization Override Logic**: Strict boolean enforcement for `llmOptimizedContext` when sections are excluded needs verification in the core layer.
- **Test Coverage**: Lack of explicit tests for the interaction between section flags and optimization bypass.

## Findings

Core logic for optimization and fingerprinting is well-implemented. Stale-optimization warnings include specific remediation instructions.
