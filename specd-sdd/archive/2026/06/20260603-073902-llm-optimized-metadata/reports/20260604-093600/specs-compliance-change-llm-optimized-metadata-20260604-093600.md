# Specs Compliance Report: llm-optimized-metadata

Date: 2026-06-04
Change: 20260603-073902-llm-optimized-metadata

## Executive Summary

The audit for the `llm-optimized-metadata` change is complete. The implementation robustly handles the introduction of LLM-optimized fields (`optimizedDescription`, `optimizedContext`) across the core domain, use cases, and the code graph indexer. The project-level optimization cache and invalidation logic are correctly implemented and verified by extensive unit tests.

However, three compliance discrepancies were identified in the CLI layer regarding flag naming and the placement of optimization warnings.

## Audit Findings

### 1. Core Implementation (`@specd/core`)

- **Status**: ✅ FULL COMPLIANCE
- **Key Successes**:
  - `SpecMetadata` schema successfully updated with non-empty optional optimized fields.
  - `UpdateSpecMetadata` and `UpdateProjectMetadata` implement the correct merge and hashing logic.
  - `CompileContext` and `GetSpecContext` correctly prioritize optimized fields.
  - `GetProjectContext` successfully implements the freshness verification for `project-metadata.json`.

### 2. Code Graph Indexing (`@specd/code-graph`)

- **Status**: ✅ FULL COMPLIANCE
- **Key Successes**:
  - `IndexCodeGraph` now prefers `optimizedDescription` for the primary description field and stores it explicitly.
  - Test coverage confirms that search and summary operations benefit from optimized content.

### 3. CLI Commands (`@specd/cli`)

- **Status**: 🟡 PARTIAL COMPLIANCE
- **Identified Discrepancies**:
  - **Optimization Warnings**: `change context` and `project context` commands send optimization warnings to `stderr` instead of displaying them at the top of the `text` output on `stdout`. They also lack mandatory remediation instructions (e.g., "Run the optimization skill").
  - **Flag Naming**: `specd project update-metadata` (and `specd spec update-metadata`) use the `--input` flag to read from a file, while the specifications required the `--file` flag.

## Detailed Reports

### [core:context (Partial Audit)](./_partial-core-context.md)

The implementation of LLM-optimized metadata and project context aligns with the specified requirements. The core use cases correctly handle the new fields.

### [core:update (Partial Audit)](./_partial-core-update.md)

`UpdateSpecMetadata` and `UpdateProjectMetadata` use cases correctly fulfill requirements for deterministic extraction, merging, hash computation, and atomic persistence.

### [cli:commands (Partial Audit)](./_partial-cli-commands.md)

CLI metadata commands are largely functional but fail the specific layout and naming requirements for warnings and flags.

### [code-graph:indexer (Partial Audit)](./_partial-code-graph.md)

The indexer is fully compliant and correctly prioritizes optimized descriptions.

## Test Coverage Summary

- **Core**: 13/13 unit tests passed across all optimization use cases.
- **CLI**: Integration tests confirm basic command registration and delegation, but specific discrepancy scenarios were caught during manual/audit inspection.

## Recommendations

1. **Fix CLI Warning Placement**: Update `change context` and `project context` commands to display optimization warnings at the top of the text output block on `stdout` when `--format text` is used.
2. **Standardize Flags**: Rename `--input` to `--file` in `spec update-metadata` and `project update-metadata` commands to match the specifications.
3. **Enhance Warning Messages**: Include explicit remediation instructions in the optimization warnings as required by the CLI specifications.
