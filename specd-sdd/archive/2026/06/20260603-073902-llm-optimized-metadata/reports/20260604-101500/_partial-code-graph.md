# Spec Compliance Audit: code-graph:indexer

Audit of spec `code-graph:indexer` against implementation in `packages/code-graph` for the `llm-optimized-metadata` change.

## Requirements Summary

| Requirement                                 | Status     | Notes                                                  |
| ------------------------------------------- | ---------- | ------------------------------------------------------ |
| IndexCodeGraph use case                     | ✅ Met     | Primary entry point for building/updating the graph.   |
| Incremental indexing                        | ✅ Met     | Hashing and fingerprinting logic implemented.          |
| Discovery fingerprint uses effective config | ✅ Met     | Synthetic exclusions for `specsPath` are included.     |
| Multi-workspace file discovery              | ✅ Met     | Prefixing and document/file discovery logic exists.    |
| Two-pass extraction with in-memory index    | ✅ Met     | Symbols extracted in Pass 1, relations in Pass 2.      |
| Scoped binding environment resolution       | ✅ Met     | Shared logic for CALLS, USES_TYPE, etc.                |
| Chunked processing                          | ✅ Met     | Sequentially processes file chunks within byte budget. |
| Progress reporting                          | ✅ Met     | Reports percentage and phase-specific details.         |
| Cross-workspace package resolution          | ✅ Met     | Uses `getPackageIdentity` for workspace mapping.       |
| Error isolation                             | ✅ Met     | Catch errors per file, continue processing.            |
| Spec dependency indexing                    | 🟡 Partial | Discrepancy in `contentHash` implementation.           |
| Prefer LLM-optimized description            | ✅ Met     | Correctly prioritizes `optimizedDescription`.          |

## Implementation Status Comparison

### Requirement: Prefer LLM-optimized description

- **Spec**: `optimizedDescription` (if present) SHALL be used for `SpecNode` description.
- **Code**: `IndexCodeGraph.ts:875-885` correctly maps `metadata?.optimizedDescription || metadata?.description || ''` to the node's description.
- **Verdict**: ✅ **Met**

### Requirement: Spec contentHash implementation

- **Spec**: `contentHash` SHALL be computed from all artifacts EXCEPT `.specd-metadata.yaml`, with `spec.md` ordered first, then others alphabetically.
- **Code**:
  - `IndexCodeGraph.ts:854` uses `specHash = await ws.specRepo.specHash(repoSpec)`.
  - `FsSpecRepository.ts:511` implements `specHash` by hashing `spec-lock.json` only.
- **Verdict**: 🔴 **Discrepancy**. The implementation uses a metadata sidecar hash instead of the content artifact hash specified in the requirements.

### Requirement: Spec artifact ordering

- **Spec**: Concatenated artifact content for `SpecNode` MUST order `spec.md` first, then others alphabetically.
- **Code**: `IndexCodeGraph.ts:861-869` uses `repoSpec.filenames` order, which depends on `fs.readdir` (via `SpecRepository.list()`) and does not enforce the specific requirement.
- **Verdict**: 🔴 **Discrepancy**. Implementation does not guarantee the required artifact ordering.

## Discrepancies

### 1. Spec contentHash Mismatch

The indexer spec defines a specific algorithm for computing `contentHash` from content artifacts (`spec.md`, `verify.md`, etc.) to enable incremental skipping. The implementation instead uses `SpecRepository.specHash()`, which hashes the `spec-lock.json` sidecar. This causes a drift between the intended semantic hash and the one used for graph indexing.

### 2. Spec Content Concatenation Ordering

The indexer fails to ensure that `spec.md` is ordered first in the concatenated content of a `SpecNode`. It relies on the order provided by the `SpecRepository`, which is typically alphabetical based on filesystem traversal but does not explicitly prioritize `spec.md`.

## Test Coverage Assessment

### Coverage for `code-graph:indexer`

- **Tests found**: `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`
- **Met requirements coverage**:
  - `optimizedDescription` prioritization is covered by a dedicated test case.
  - Multi-workspace and package identity resolution are well-covered.
  - Document indexing (textual fallback) is well-covered.
- **Missing coverage**:
  - No test verifies the specific `contentHash` algorithm for specs (ordering, exclusion of metadata).
  - No test verifies the concatenated content ordering of `SpecNode` artifacts.
  - No test verifies that spec indexing actually skips unchanged specs based on the hash.

## Spec Dependency Chain

- `code-graph:indexer` depends on:
  - `code-graph:graph-store`
  - `code-graph:language-adapter`
  - `code-graph:symbol-model`
  - `core:config`
  - `core:spec-repository-port`

## Summary Counts

- **Requirements**: 12
- **Met**: 9
- **Partial**: 1
- **Discrepancies**: 2
- **Missing Tests**: 3
