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

### Requirement: dependsOn resolution

#### Scenario: Relative spec path resolved during extraction

- **GIVEN** the current spec origin is workspace `core` and capability path `core/change`
- **AND** extraction yields the relative link `../storage/spec.md`
- **AND** the schema declares `transform: resolveSpecPath`
- **WHEN** `GenerateSpecMetadata` executes extraction
- **THEN** the transformed `dependsOn` value is `core:core/storage`
- **AND** no separate post-extraction repair step runs afterward

#### Scenario: Unresolvable dependency value fails extraction instead of being omitted

- **GIVEN** extraction yields a `dependsOn` value like `https://example.com`
- **AND** the registered transform cannot normalize that value
- **WHEN** `GenerateSpecMetadata` executes extraction
- **THEN** extraction fails explicitly instead of silently omitting that dependency

#### Scenario: Canonical spec ID may pass through resolveSpecPath when enabled by args

- **GIVEN** extraction yields the canonical spec ID `core:core/storage`
- **AND** the schema declares `transform: { name: "resolveSpecPath", args: ["true"] }`
- **WHEN** `GenerateSpecMetadata` executes extraction
- **THEN** the final `dependsOn` value remains `core:core/storage`

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

- **WHEN** `GenerateSpecMetadata` completes successfully with extraction
- **THEN** `metadata.generatedBy` is `'core'`

#### Scenario: Result merges extracted fields and hashes

- **WHEN** `GenerateSpecMetadata` completes successfully
- **THEN** the returned metadata contains both the `extractMetadata()` output fields and `contentHashes`
- **AND** `hasExtraction` is `true`
