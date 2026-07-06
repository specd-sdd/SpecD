# Generate Spec Metadata

## Purpose

Metadata must be producible deterministically from spec content so that every project gets a consistent baseline without requiring LLM involvement. The `GenerateSpecMetadata` use case achieves this by resolving a spec ID, loading its artifacts, parsing them into ASTs, running the schema's `metadataExtraction` engine, computing content hashes, and returning the assembled `.specd-metadata.yaml` content.

## Requirements

### Requirement: Input and output

The use case takes a `specId` string (e.g. `'core/change'` or `'billing:invoices/create'`). It returns `{ metadata: SpecMetadata, hasExtraction: boolean }`. `metadata` contains the extracted fields plus content hashes and a `generatedBy` marker. `hasExtraction` indicates whether the active schema declares any `metadataExtraction` rules.

### Requirement: Schema resolution

The use case obtains the active schema via `SchemaProvider.get()`. If the schema cannot be resolved, `get()` throws `SchemaNotFoundError` or `SchemaValidationError` — the use case does not catch these. If the resolved schema has no `metadataExtraction` declarations, the use case returns `{ metadata: {}, hasExtraction: false }` immediately — there is nothing to extract.

### Requirement: Spec resolution

The use case parses `specId` via `parseSpecId()` to obtain a workspace name and capability path. It looks up the workspace's `SpecRepository` from the injected map. If the workspace is unknown, it throws `WorkspaceNotFoundError`. If the spec is not found via `SpecRepository.get()`, it throws `SpecNotFoundError`.

### Requirement: Artifact loading and parsing

The use case iterates over the schema's artifact type declarations, filtering to `scope: 'spec'` artifacts. For each artifact:

1. Resolves the filename from the artifact's `output` field (last path segment)
2. Infers the format via `inferFormat()`, falling back to `'plaintext'` if no format is declared or inferred
3. Looks up a parser from `ArtifactParserRegistry` for the format
4. Loads the artifact content via `SpecRepository.artifact()`

Artifacts with no matching parser or no content on disk are silently skipped.

### Requirement: Metadata extraction

The use case calls `extractMetadata()` with:

- The schema's `metadataExtraction` declarations
- Parsed ASTs keyed by artifact type ID
- Renderers from the artifact parsers
- The shared extractor-transform registry assembled by kernel composition
- Caller-owned origin context for each extracted artifact, including the values needed by transforms such as `resolveSpecPath`

The extraction engine produces fields including `title`, `description`, `dependsOn`, `keywords`, `rules`, `constraints`, `scenarios`, and `context`.

When the schema declares transforms for those fields, the use case awaits the extraction runtime and the extracted metadata returned from `extractMetadata()` is already normalized by that runtime transform path.

The use case may satisfy that normalization through repository-backed transform execution assembled by the caller, rather than through filesystem-specific path inference embedded in the extraction engine.

### Requirement: dependsOn resolution

`GenerateSpecMetadata` MUST canonicalize `dependsOn` from persisted spec semantics before returning metadata.

Resolution rules:

1. Run schema extraction normally. If extraction yields `dependsOn`, treat that as the candidate extracted dependency set.
2. Read the repository's persisted dependency state through `SpecRepository.readPersistedDependsOn(spec)`.
3. If persisted dependency state exists, the returned `metadata.dependsOn` MUST use that persisted value.
4. If persisted dependency state does not exist and extraction yields `dependsOn`, the returned `metadata.dependsOn` MAY use the extracted value.
5. If both extraction and persisted state exist and they differ, metadata generation MUST fail explicitly instead of silently choosing one.

If `dependsOn` entries require normalization from artifact-local strings (for example relative spec links) to canonical spec IDs, that behavior must be declared through the schema's extractor transform model and executed during `extractMetadata()`.

The use case supplies the origin context and repository-backed transform runtime needed by those registered transforms, awaits the transformed extraction output, and accepts that output as final before comparing it against persisted dependency state.

If extraction finds dependency values but transform execution cannot normalize them, metadata generation fails explicitly. It does not silently drop those found values and continue with an incomplete `dependsOn` set.

### Requirement: Content hashes

After extraction, the use case computes a SHA-256 hash for each artifact file that was successfully loaded, using `ContentHasher.hash()`. The resulting `contentHashes` map is keyed by the resolved filename (e.g. `spec.md`, `verify.md`). Only artifacts with content on disk are included.

### Requirement: Assembled result

The final metadata object merges:

- all fields from `extractMetadata()` output
- canonical `dependsOn` determined by the dependency-resolution rules above
- implementation projection from persisted repository semantics
- `contentHashes` from the hashing step
- `generatedBy: 'core'`

The result is returned with `hasExtraction: true`.

## Constraints

- No LLM involvement — extraction is purely deterministic via the schema's `metadataExtraction` engine
- Delegates to async `extractMetadata()` domain service for all extraction logic — the use case orchestrates but does not implement extraction
- Does not write to disk — writing is `SaveSpecMetadata`'s responsibility
- Content hashes only cover artifacts that were successfully loaded from disk

## Spec Dependencies

- [`core:spec-metadata`](../spec-metadata/spec.md) — metadata format, fields, validation
- [`core:content-extraction`](../content-extraction/spec.md) — the `extractMetadata()` domain service
- [`core:schema-format`](../schema-format/spec.md) — `metadataExtraction` declarations and artifact type definitions
- [`core:spec-id-format`](../spec-id-format/spec.md) — `parseSpecId()` resolution
- [`core:spec-repository-port`](../spec-repository-port/spec.md) — repository-backed path resolution used by dependency-normalizing transforms
