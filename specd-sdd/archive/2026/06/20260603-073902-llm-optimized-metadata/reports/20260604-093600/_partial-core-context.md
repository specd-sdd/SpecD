# Audit Report: core:context (Partial)

## Specs Audited

- `core:spec-metadata`
- `core:compile-context`
- `core:get-spec-context`
- `core:get-project-context`
- `core:project-metadata`

## Summary of Findings

The implementation of LLM-optimized metadata and project context aligns with the specified requirements. The core use cases correctly handle the new `optimizedDescription` and `optimizedContext` fields in `metadata.json`, and the project context compilation successfully leverages `project-metadata.json` for performance gains when `llmOptimizedContext` is enabled.

## Requirement Verification

### 1. Spec Metadata (core:spec-metadata)

- **Sidecar Separation**: Implementation in `FsSpecRepository` (and `StubSpecRepository`) correctly separates metadata storage from spec artifacts.
- **Write-time Structural Validation**: `SaveSpecMetadata` uses `strictSpecMetadataSchema` which includes `optimizedDescription` and `optimizedContext` as non-empty optional strings.
- **dependsOn Overwrite Protection**: `SaveSpecMetadata` implements the sorted comparison check and throws `DependsOnOverwriteError` if unauthorized changes are detected.
- **Deterministic Generation at Archive Time**: `ArchiveChange` triggers `GenerateSpecMetadata` post-publication and persists the result using `SaveSpecMetadata` with `force: true`.

### 2. Get Spec Context (core:get-spec-context)

- **Prefer LLM-optimized context**: `GetSpecContext._buildEntry` correctly checks for `llmOptimizedContext` input flag and prefers `metadata.optimizedContext` if available.
- **Optimized Description**: When enabled, the `description` field in the context entry is populated from `metadata.optimizedDescription` if present, falling back to `metadata.description`.
- **Stale Metadata Handling**: `checkMetadataFreshness` is used to detect staleness via SHA-256 hashes of artifacts recorded in `metadata.json`.

### 3. Get Project Context (core:get-project-context)

- **Optimization and Invalidation**: `GetProjectContext` uses `checkProjectMetadataFreshness` to verify if `project-metadata.json` is fresh against `specd.yaml`, context files, and included spec metadata hashes.
- **Structured Rendering**: When fresh metadata is available, rendering uses `_renderFromMetadata` which handles section filtering and optimization preference.
- **Fallback to Extraction**: When metadata is stale or absent, the use case correctly falls back to live extraction using the schema's `metadataExtraction` engine.

### 4. Project Metadata (core:project-metadata)

- **Persistence Location**: `project-metadata.json` is stored in the resolved `configPath`.
- **Freshness Tracking**: The schema and its usage in `GetProjectContext` track `specd.yaml` hash, `contextFiles` hashes, and spec metadata hashes.

## Test Coverage Assessment

- **SaveSpecMetadata**: Covered by `packages/core/test/application/use-cases/save-spec-metadata.spec.ts`. Includes validation and overwrite protection scenarios.
- **GetSpecContext**: Covered by `packages/core/test/application/use-cases/get-spec-context.spec.ts`. Covers single spec resolution, staleness detection, and traversal (though explicit tests for the new optimization fields should be added for 100% confidence).
- **GetProjectContext**: Covered by `packages/core/test/application/use-cases/get-project-context.spec.ts`. Includes extensive tests for the cache verification logic and freshness checks.

## Recommendations

- Add explicit unit tests for `optimizedDescription` and `optimizedContext` preference in `get-spec-context.spec.ts` to ensure full coverage of the conditional branches in `_buildEntry`.
