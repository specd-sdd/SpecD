# Generate Spec Metadata

## Purpose

Metadata must be producible deterministically from spec content so that every project gets a consistent baseline without requiring LLM involvement. The `GenerateSpecMetadata` use case achieves this by resolving a spec ID, loading its artifacts, parsing them into ASTs, running the schema's `metadataExtraction` engine, computing content hashes, and returning the assembled `.specd-metadata.yaml` content.

## Requirements

### Requirement: Input and output

The use case takes a `specId` string (e.g. `'core/change'` or
`'billing:invoices/create'`). It returns `{ metadata: SpecMetadata,
hasExtraction: boolean }`. `metadata` contains the extracted fields, content
hashes, canonical `dependsOn`, and a `provenance` record capturing the exact
artifact hashes/lastModified, `persistedStateHash`, schema identity, projection
version, and projection fingerprint used to produce this result. `hasExtraction`
indicates whether the active schema declares any `metadataExtraction` rules.

The returned `provenance` MUST reflect the exact loaded artifact set and lock
snapshot used during this call — not a subsequently re-read state — so that
callers such as `MaterializeSpecMetadata` can reuse it without re-hashing
artifact content.

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

`GenerateSpecMetadata` MUST canonicalize `dependsOn` from persisted spec
semantics before returning metadata.

Resolution rules:

1. Run schema extraction normally. If extraction yields `dependsOn`, treat that
   as the candidate extracted dependency set.
2. Read the repository's aggregate persisted state through
   `SpecRepository.readPersistedState(spec)`.
3. If persisted state exists, the returned `metadata.dependsOn` MUST use its
   `dependsOn` value, regardless of what extraction yielded.
4. If persisted state does not exist (a lock-less spec), the returned
   `metadata.dependsOn` MUST be derived from the current canonical artifacts:
   use the extracted value when extraction yields one, otherwise `[]`. This is a
   live projection of current artifacts, not a cached or previously observed
   value.
5. If persisted state exists and its `dependsOn` differs from a non-empty
   extracted value, metadata generation MUST fail explicitly instead of
   silently choosing one.

If `dependsOn` entries require normalization from artifact-local strings (for
example relative spec links) to canonical spec IDs, that behavior must be
declared through the schema's extractor transform model and executed during
`extractMetadata()`.

The use case supplies the origin context and repository-backed transform
runtime needed by those registered transforms, awaits the transformed
extraction output, and accepts that output as final before comparing it against
persisted state.

If extraction finds dependency values but transform execution cannot normalize
them, metadata generation fails explicitly. It does not silently drop those
found values and continue with an incomplete `dependsOn` set.

### Requirement: One consistent lock snapshot or explicit absence

`GenerateSpecMetadata` MUST read persisted state at most once per generation
attempt and use that single observation — the complete
`PersistedSpecStateSnapshot` or explicit absence (`null`) — consistently for
`dependsOn`, `implementation`, `optimizations`, and
`provenance.persistedStateHash`.

When a hash is needed for `provenance.persistedStateHash` (or equivalent
fingerprint inputs), it MUST obtain that hash via
`SpecRepository.persistedStateMeta(spec, { includeHash: true })?.hash ?? null`
(or from the same single observation's `originalHash` when that is already part
of the read snapshot). It MUST NOT call a removed `persistedStateHash(spec)`
method.

It MUST NOT mix fields read from two different persisted-state observations
within one generation attempt, and MUST NOT re-read persisted state partway
through assembling the result.

### Requirement: Fresh lock-owned optimizations only

When the persisted state snapshot includes an `optimizations` block,
`GenerateSpecMetadata` MUST include `optimizedDescription` and/or
`optimizedContext` in the generated metadata only for fields whose persisted
artifact and schema baseline is fresh against the artifacts and schema identity
loaded during this same generation attempt.

A stale or absent optimization field MUST be omitted from the generated
metadata rather than included with a stale value or a placeholder.
`GenerateSpecMetadata` MUST NOT regenerate, invalidate, or otherwise mutate
persisted optimization state — it only decides whether to project an existing
value.

### Requirement: Content hashes

After extraction, the use case computes a SHA-256 hash for each artifact file that was successfully loaded, using `ContentHasher.hash()`. The resulting `contentHashes` map is keyed by the resolved filename (e.g. `spec.md`, `verify.md`). Only artifacts with content on disk are included.

### Requirement: Assembled result

The final metadata object merges:

- all fields from `extractMetadata()` output
- canonical `dependsOn` determined by the dependency-resolution rules above
- implementation projection from persisted repository semantics
- fresh lock-owned optimization fields, per Requirement: Fresh lock-owned
  optimizations only
- `contentHashes` from the hashing step
- `provenance` — the exact artifact hashes/lastModified, `persistedStateHash`
  (or `null` for a lock-less spec), schema identity, projection version, and
  projection fingerprint used during this generation attempt
- `generatedBy: 'core'`

The result is returned with `hasExtraction: true`.

### Requirement: Config-based factory delegates through resolveGenerateSpecMetadataDeps

The config-based `createGenerateSpecMetadata(config, options?)` form MUST derive `GenerateSpecMetadataDeps` through `resolveGenerateSpecMetadataDeps(resolver)` and then delegate to canonical `createGenerateSpecMetadata(deps)`.

`resolveGenerateSpecMetadataDeps(resolver)` MUST resolve:

- `listWorkspaces: ListWorkspaces`
- `schemaProvider: SchemaProvider`
- `parsers: ArtifactParserRegistry`
- `hasher: ContentHasher`
- `extractorTransforms: ExtractorTransformRegistry`
- `workspaceRoutes: readonly SpecWorkspaceRoute[]`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- No LLM involvement — extraction is purely deterministic via the schema's
  `metadataExtraction` engine
- Delegates to async `extractMetadata()` domain service for all extraction
  logic — the use case orchestrates but does not implement extraction
- `GenerateSpecMetadata` MUST NOT write to disk, mutate persisted state, or call
  `SpecRepository.writeMetadataSnapshot()` / `writePersistedState()` under any
  circumstance — persistence is exclusively `MaterializeSpecMetadata` and its
  internal `PersistSpecMetadata` collaborator's responsibility
- Content hashes only cover artifacts that were successfully loaded from disk
- `GenerateSpecMetadata` never decides whether a persisted optimization is
  fresh independently of the artifacts and schema loaded during the same call —
  freshness for optimization projection uses only that same-call state, not a
  separately re-read observation

## Spec Dependencies

- [`core:spec-metadata`](../spec-metadata/spec.md)
- [`core:content-extraction`](../content-extraction/spec.md)
- [`core:schema-format`](../schema-format/spec.md)
- [`core:spec-id-format`](../spec-id-format/spec.md)
- [`core:spec-repository-port`](../spec-repository-port/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
- [`core:spec-optimization`](../spec-optimization/spec.md) — per-field
  optimization record and freshness reasons used to decide which optimized
  fields to project
