# Verification: Generate Spec Metadata

## Requirements

### Requirement: Schema resolution

#### Scenario: Schema resolution failure propagates

- **WHEN** `SchemaProvider.get()` throws `SchemaNotFoundError`
- **THEN** the error propagates — the use case does not catch it

#### Scenario: Schema has no metadataExtraction

- **WHEN** the resolved schema has no `metadataExtraction` declarations
- **THEN** the use case returns `{ metadata: {}, hasExtraction: false }`

### Requirement: Spec resolution

#### Scenario: Unknown workspace

- **GIVEN** the `specId` references a workspace not present in the injected spec repositories
- **WHEN** `GenerateSpecMetadata` is executed
- **THEN** it throws `WorkspaceNotFoundError`

#### Scenario: Spec not found

- **GIVEN** the workspace exists but the spec path does not resolve to a spec
- **WHEN** `GenerateSpecMetadata` is executed
- **THEN** it throws `SpecNotFoundError`

### Requirement: Artifact loading and parsing

#### Scenario: Artifact with unknown parser format skipped

- **GIVEN** a `scope: 'spec'` artifact has a format with no registered parser
- **WHEN** `GenerateSpecMetadata` is executed
- **THEN** that artifact is silently skipped and extraction proceeds with the remaining artifacts

#### Scenario: Artifact not on disk skipped

- **GIVEN** a `scope: 'spec'` artifact is declared in the schema but has no content on disk
- **WHEN** `GenerateSpecMetadata` is executed
- **THEN** that artifact is silently skipped and extraction proceeds with the remaining artifacts

### Requirement: Metadata extraction

#### Scenario: Fields extracted from valid spec

- **GIVEN** a spec with artifacts that conform to the schema's `metadataExtraction` declarations
- **WHEN** `GenerateSpecMetadata` is executed
- **THEN** the result metadata contains extracted fields such as `title`, `description`, `dependsOn`, `keywords`, `rules`, `constraints`, and `scenarios`

#### Scenario: Extraction uses shared transform registry with origin context

- **GIVEN** a metadata extractor declares `transform: resolveSpecPath`
- **AND** the current spec origin is available to the use case
- **WHEN** `GenerateSpecMetadata` executes extraction
- **THEN** it supplies the shared extractor-transform registry and origin context to `extractMetadata`

#### Scenario: Extraction awaits async transform resolution

- **GIVEN** a metadata extractor declares a transform whose runtime implementation returns a promise
- **WHEN** `GenerateSpecMetadata` executes extraction
- **THEN** it awaits that promise before assembling the final metadata object

### Requirement: dependsOn resolution

#### Scenario: Relative spec path resolved during extraction

- **GIVEN** the current spec origin is workspace `core` and capability path `core/change`
- **AND** extraction yields the relative link `../storage/spec.md`
- **AND** the schema declares `transform: resolveSpecPath`
- **WHEN** `GenerateSpecMetadata` executes extraction
- **THEN** the transformed `dependsOn` value is `core:storage`
- **AND** no separate post-extraction repair step runs afterward

#### Scenario: Cross-workspace relative spec path resolves through repository-backed normalization

- **GIVEN** the current spec origin is workspace `core` and capability path `core/actor-resolver-port`
- **AND** extraction yields the relative link `../../_global/architecture/spec.md`
- **AND** the registered `resolveSpecPath` runtime uses repository-backed resolution across configured workspaces
- **WHEN** `GenerateSpecMetadata` executes extraction
- **THEN** the transformed `dependsOn` value is `default:_global/architecture`
- **AND** it is not normalized to `core:_global/architecture`

#### Scenario: Persisted state overrides omitted extracted dependsOn

- **GIVEN** extraction does not yield `dependsOn`
- **AND** `SpecRepository.readPersistedState(spec)` returns a snapshot with `dependsOn: ['core:storage']`
- **WHEN** `GenerateSpecMetadata` assembles metadata
- **THEN** the returned `metadata.dependsOn` is `['core:storage']`

#### Scenario: Mismatched extracted and persisted dependencies fail generation

- **GIVEN** extraction yields `dependsOn: ['core:config']`
- **AND** `SpecRepository.readPersistedState(spec)` returns a snapshot with `dependsOn: ['core:storage']`
- **WHEN** `GenerateSpecMetadata` executes
- **THEN** metadata generation fails explicitly instead of silently choosing one set

#### Scenario: Lock-less spec derives dependsOn as a live projection of current artifacts

- **GIVEN** `SpecRepository.readPersistedState(spec)` returns `null` for a lock-less spec
- **WHEN** `GenerateSpecMetadata` assembles metadata
- **THEN** `metadata.dependsOn` is derived from the current canonical artifacts — the extracted value when extraction yields one, otherwise `[]`
- **AND** it is not read from any cached or previously observed value

#### Scenario: Unresolvable dependency value fails extraction instead of being omitted

- **GIVEN** extraction yields a `dependsOn` value like `https://example.com`
- **AND** the registered transform cannot normalize that value
- **WHEN** `GenerateSpecMetadata` executes extraction
- **THEN** extraction fails explicitly instead of silently omitting that dependency

#### Scenario: Canonical spec ID may pass through resolveSpecPath when enabled by args

- **GIVEN** extraction yields the canonical spec ID `core:storage`
- **AND** the schema declares `transform: { name: "resolveSpecPath", args: ["true"] }`
- **WHEN** `GenerateSpecMetadata` executes extraction
- **THEN** the final `dependsOn` value remains `core:storage`

### Requirement: One consistent lock snapshot or explicit absence

#### Scenario: Single persisted-state read is reused across all dependent fields

- **GIVEN** a generation attempt that reads persisted state once
- **WHEN** `GenerateSpecMetadata` assembles `dependsOn`, `implementation`, `optimizations`, and `provenance.persistedStateHash`
- **THEN** all four use that same single `PersistedSpecStateSnapshot` observation (or explicit `null`)

#### Scenario: Persisted state is not re-read partway through assembly

- **WHEN** `GenerateSpecMetadata` is executing a single generation attempt
- **THEN** it does not call `SpecRepository.readPersistedState(spec)` more than once for that attempt

#### Scenario: Explicit absence is treated as one consistent observation

- **GIVEN** `SpecRepository.readPersistedState(spec)` returns `null`
- **WHEN** `GenerateSpecMetadata` assembles the result
- **THEN** `dependsOn`, `implementation`, and `provenance.persistedStateHash` all reflect that same absence rather than a mix of observations

#### Scenario: provenance.persistedStateHash uses persistedStateMeta includeHash or snapshot originalHash

- **GIVEN** a generation attempt with present persisted state
- **WHEN** `GenerateSpecMetadata` assembles `provenance.persistedStateHash`
- **THEN** the hash is obtained via `persistedStateMeta(..., { includeHash: true })`
  or the single observation's `originalHash`
- **AND** the use case does not call a `persistedStateHash` repository method

### Requirement: Fresh lock-owned optimizations only

#### Scenario: Fresh optimization field is projected

- **GIVEN** the persisted `optimizations.optimizedDescription` baseline is fresh against the artifacts and schema loaded during this generation attempt
- **WHEN** `GenerateSpecMetadata` assembles metadata
- **THEN** `optimizedDescription` is included with its persisted value

#### Scenario: Stale optimization field is omitted, not fabricated

- **GIVEN** the persisted `optimizations.optimizedContext` baseline is stale against the artifacts or schema loaded during this generation attempt
- **WHEN** `GenerateSpecMetadata` assembles metadata
- **THEN** `optimizedContext` is omitted from the generated metadata rather than included with a stale value or placeholder

#### Scenario: Generation never mutates persisted optimization state

- **WHEN** `GenerateSpecMetadata` evaluates optimization freshness
- **THEN** it does not regenerate, invalidate, or otherwise mutate the persisted `optimizations` block
- **AND** it only decides whether to project an existing value

### Requirement: Content hashes

#### Scenario: Hashes computed for loaded artifacts

- **GIVEN** two artifacts (`spec.md` and `verify.md`) were loaded successfully
- **WHEN** `GenerateSpecMetadata` is executed
- **THEN** `contentHashes` contains SHA-256 entries for both `spec.md` and `verify.md`

#### Scenario: Missing artifacts excluded from hashes

- **GIVEN** `spec.md` exists on disk but `verify.md` does not
- **WHEN** `GenerateSpecMetadata` is executed
- **THEN** `contentHashes` contains only the entry for `spec.md`

### Requirement: Assembled result

#### Scenario: Result includes generatedBy marker

- **WHEN** `GenerateSpecMetadata.execute` produces a result
- **THEN** `result.metadata.generatedBy` is `'core'`

#### Scenario: Result merges extracted fields and hashes

- **WHEN** `GenerateSpecMetadata.execute` runs for a spec
- **THEN** the returned metadata includes all extracted fields, hashes, and canonical dependsOn

#### Scenario: Result includes fresh optimization fields and provenance

- **GIVEN** a spec with or without a persisted lockfile
- **WHEN** `GenerateSpecMetadata.execute` produces metadata
- **THEN** `provenance.schema` reflects the persisted schema identity or falls back to `schema.canonicalSpecSchema()`

### Requirement: Input and output

#### Scenario: execute accepts specId string

- **WHEN** `GenerateSpecMetadata.execute` is called
- **THEN** it accepts a `specId` string parameter (e.g. `'core/change'` or `'billing:invoices/create'`)

#### Scenario: Returns metadata and hasExtraction flag

- **WHEN** `GenerateSpecMetadata.execute` completes successfully
- **THEN** it returns `{ metadata: SpecMetadata, hasExtraction: boolean }`

#### Scenario: metadata contains extracted fields and hashes

- **WHEN** `GenerateSpecMetadata.execute` completes with extraction
- **THEN** the returned `metadata` contains fields from `extractMetadata()` plus `contentHashes` and `generatedBy: 'core'`

#### Scenario: Result includes a provenance record reflecting the exact call state

- **WHEN** `GenerateSpecMetadata` completes successfully
- **THEN** the returned `metadata.provenance` reflects the exact artifact hashes/lastModified, `persistedStateHash`, schema identity, projection version, and projection fingerprint loaded during this call
- **AND** `MaterializeSpecMetadata` can reuse it without re-hashing artifact content

### Requirement: Config-based factory delegates through resolveGenerateSpecMetadataDeps

#### Scenario: createGenerateSpecMetadata config form derives GenerateSpecMetadataDeps through resolveGenerateSpecMetadataDeps

- **WHEN** `createGenerateSpecMetadata(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `GenerateSpecMetadataDeps` through `resolveGenerateSpecMetadataDeps(resolver)`
- **AND** `resolveGenerateSpecMetadataDeps(resolver)` resolves:
- `listWorkspaces: ListWorkspaces`
- `schemaProvider: SchemaProvider`
- `parsers: ArtifactParserRegistry`
- `hasher: ContentHasher`
- `extractorTransforms: ExtractorTransformRegistry`
- `workspaceRoutes: readonly SpecWorkspaceRoute[]`
- **AND** the factory delegates to canonical `createGenerateSpecMetadata(deps)`
