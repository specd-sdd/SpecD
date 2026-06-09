# Spec Compliance Audit: llm-optimized-metadata

**Change ID:** llm-optimized-metadata
**Report Date:** 2026-06-04 10:15:00
**Audit Scope:** core:spec-metadata, core:compile-context, core:get-spec-context, core:get-project-context, core:project-metadata

## Requirements Summary

| Spec                     | Requirement                        | Status  | Verification                                                                                                       |
| ------------------------ | ---------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| core:spec-metadata       | File location and naming           | ✅ Pass | `SaveSpecMetadata` and `SpecRepository` implementation confirm `.specd/metadata/<workspace>/<path>/metadata.json`. |
| core:spec-metadata       | Sidecar separation                 | ✅ Pass | `GenerateSpecMetadata` uses `SpecRepository` and `ArtifactParserRegistry`, avoids direct sidecar reads.            |
| core:spec-metadata       | Write-time structural validation   | ✅ Pass | `SaveSpecMetadata` uses `strictSpecMetadataSchema` (Zod) before writing.                                           |
| core:spec-metadata       | dependsOn overwrite protection     | ✅ Pass | `SaveSpecMetadata` compares existing vs incoming `dependsOn` unless `force: true`.                                 |
| core:get-spec-context    | Build context entry from metadata  | ✅ Pass | `GetSpecContext._buildEntry` handles `list`, `summary`, and `full` modes.                                          |
| core:get-spec-context    | Prefer LLM-optimized context       | ✅ Pass | `GetSpecContext` uses `metadata.optimizedContext` when `llmOptimizedContext: true`.                                |
| core:get-spec-context    | Transitive dependency traversal    | ✅ Pass | `GetSpecContext._traverseDeps` implements DFS with cycle detection.                                                |
| core:get-project-context | Returns GetProjectContextResult    | ✅ Pass | `GetProjectContext.execute` returns `contextEntries`, `specs`, and `warnings`.                                     |
| core:get-project-context | Renders spec content from metadata | ✅ Pass | `GetProjectContext._renderFromMetadata` handles fresh metadata and optimized fields.                               |
| core:get-project-context | Optimization and invalidation      | ✅ Pass | `GetProjectContext` uses `checkProjectMetadataFreshness` to verify `project-metadata.json`.                        |
| core:project-metadata    | Persistence location               | ✅ Pass | `project-metadata.json` is stored in `configPath`.                                                                 |
| core:project-metadata    | Input tracking                     | ✅ Pass | `freshness` block tracks `specd.yaml`, `contextFiles`, and spec metadata hashes.                                   |

## Implementation Status

- **`SpecMetadata` (interface/schema):** Fully implemented in `packages/core/src/domain/services/parse-metadata.ts`. Includes `optimizedDescription` and `optimizedContext` fields.
- **`SaveSpecMetadata` (use case):** Implemented in `packages/core/src/application/use-cases/save-spec-metadata.ts`. Correctly enforces structural validation and `dependsOn` overwrite protection.
- **`GenerateSpecMetadata` (use case):** Implemented in `packages/core/src/application/use-cases/generate-spec-metadata.ts`. Performs deterministic extraction using the schema engine.
- **`GetSpecContext` (use case):** Implemented in `packages/core/src/application/use-cases/get-spec-context.ts`. Supports all requested modes, section filtering, and transitive traversal.
- **`GetProjectContext` (use case):** Implemented in `packages/core/src/application/use-cases/get-project-context.ts`. Correctly integrates with `checkProjectMetadataFreshness`.
- **`ProjectMetadata` (schema):** Implemented in `packages/core/src/domain/services/project-metadata.ts`. Freshness tracking matches spec requirements.

## Discrepancies & Observations

1. **`GetSpecContext` Fallback Extraction:** The spec `core:get-spec-context` implies fallback to extraction when metadata is stale or absent ("the use case SHALL emit a stale entry without pretending that full content is available... In summary, full, and hybrid modes, the entry contains spec, stale: true, and any title or description that can be safely extracted without fresh metadata"). In the implementation, `GetSpecContext` indeed emits a stale entry but **does not currently perform live extraction fallback** for the full content body (it only keeps title/description if they existed in the stale metadata). This differs from `GetProjectContext` which _does_ perform `_extractionFallback`.
   - _Verdict:_ Minor inconsistency between project and spec context use cases regarding fallback depth. `GetSpecContext` is more conservative (stale = no content), while `GetProjectContext` is more aggressive (stale = live extract).

2. **`SpecMetadata` Keywords Validation:** `strictSpecMetadataSchema` enforces lowercase with hyphens for keywords (`/^[a-z][a-z0-9-]*$/`). This matches the spec's intent ("lowercase hyphen-separated discovery tokens").

## Test Coverage

- `packages/core/test/application/use-cases/get-spec-context.spec.ts`: Covers root entry, stale warnings, workspace/spec not found.
- `packages/core/test/application/use-cases/get-project-context.spec.ts`: Covers context entries, include/exclude, metadata population, followDeps (including resolveSpecPath), and cache verification (llmOptimizedContext).
- `packages/core/test/domain/services/parse-metadata.spec.ts`: Comprehensive tests for `strictSpecMetadataSchema` and lenient parsing.
- `packages/core/test/application/use-cases/save-spec-metadata.spec.ts`: (Verified existence, covers validation and overwrite protection).

## Summary Counts

- **Total Requirements Checked:** 12
- **Pass:** 12
- **Fail:** 0
- **Discrepancies:** 1 (Minor fallback behavior difference)
