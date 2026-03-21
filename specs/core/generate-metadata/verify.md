# Verification: Generate Spec Metadata

## Requirements

### Requirement: Schema resolution

#### Scenario: Schema not found

- **WHEN** `SchemaProvider.get()` returns `null` for the configured schema reference
- **THEN** it throws `SchemaNotFoundError`

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

### Requirement: dependsOn resolution

#### Scenario: Relative spec path resolved to qualified spec ID

- **GIVEN** the current spec is in workspace `core` with capability path `core/change` and extraction yields `dependsOn: ['../storage/spec.md']`
- **WHEN** the use case resolves dependsOn via `SpecRepository.resolveFromPath`
- **THEN** the value is resolved to `core:core/storage`

#### Scenario: Path with anchor fragment

- **GIVEN** extraction yields `dependsOn: ['../storage/spec.md#some-section']`
- **WHEN** the use case resolves dependsOn via `SpecRepository.resolveFromPath`
- **THEN** the anchor is stripped and the value resolves to `core:core/storage`

#### Scenario: Non-matching pattern filtered out

- **GIVEN** extraction yields a `dependsOn` value like `https://example.com` or `./local-file.md`
- **WHEN** the use case resolves dependsOn via `SpecRepository.resolveFromPath`
- **THEN** the value is filtered out (repository returns null)

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
