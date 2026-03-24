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
- A transform map (see resolveSpecPath transform)

The extraction engine produces fields including `title`, `description`, `dependsOn`, `keywords`, `rules`, `constraints`, `scenarios`, and `context`.

### Requirement: dependsOn resolution

After extraction, if `dependsOn` contains raw relative paths (e.g. `../storage/spec.md`), the use case resolves each entry via `SpecRepository.resolveFromPath(rawPath, specPath)`. The repository handles anchor stripping, pattern matching, and workspace-qualified spec ID construction. Entries that the repository cannot resolve are filtered out.

### Requirement: Content hashes

After extraction, the use case computes a SHA-256 hash for each artifact file that was successfully loaded, using `ContentHasher.hash()`. The resulting `contentHashes` map is keyed by the resolved filename (e.g. `spec.md`, `verify.md`). Only artifacts with content on disk are included.

### Requirement: Assembled result

The final metadata object merges:

- All fields from `extractMetadata()` output
- `contentHashes` from the hashing step
- `generatedBy: 'core'`

The result is returned with `hasExtraction: true`.

## Constraints

- No LLM involvement — extraction is purely deterministic via the schema's `metadataExtraction` engine
- Delegates to `extractMetadata()` domain service for all extraction logic — the use case orchestrates but does not implement extraction
- Does not write to disk — writing is `SaveSpecMetadata`'s responsibility
- Content hashes only cover artifacts that were successfully loaded from disk

## Spec Dependencies

- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — metadata format, fields, validation
- [`specs/core/content-extraction/spec.md`](../content-extraction/spec.md) — the `extractMetadata()` domain service
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `metadataExtraction` declarations, artifact type definitions
- [`specs/core/spec-id-format/spec.md`](../spec-id-format/spec.md) — `parseSpecId()` resolution
