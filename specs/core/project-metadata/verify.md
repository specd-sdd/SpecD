# Verification: ProjectMetadata

## Requirements

### Requirement: Persistence location

#### Scenario: Saved in configPath

- **WHEN** project metadata is saved
- **THEN** it is written to `{resolvedConfigPath}/project-metadata.json`

### Requirement: Data schema

#### Scenario: Schema validation

- **GIVEN** a project metadata file
- **THEN** it MUST match the versioned schema with `optimized`, `freshness`, and `generated` blocks

### Requirement: Input tracking

#### Scenario: Tracks all dependencies

- **WHEN** freshness hashes are computed
- **THEN** they include `specd.yaml`, all context files, and the materialized `metadataFingerprint` of all resolved project context specs

#### Scenario: Per-spec fingerprint is semantic, not a raw cache hash or storage revision

- **GIVEN** a spec's metadata-cache file bytes or repository storage revision changes without any change to its semantically meaningful metadata content
- **WHEN** its `metadataFingerprint` is recorded in `freshness`
- **THEN** the fingerprint value does not change
- **AND** freshness comparisons remain storage-adapter-independent

### Requirement: Config-based factory delegates through resolveGetProjectMetadataDeps

#### Scenario: createGetProjectMetadata config form derives GetProjectMetadataDeps through resolveGetProjectMetadataDeps

- **WHEN** `createGetProjectMetadata(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `GetProjectMetadataDeps` through `resolveGetProjectMetadataDeps(resolver)`
- **AND** `resolveGetProjectMetadataDeps(resolver)` resolves:
- `config: SpecdConfig`
- `files: FileReader`
- **AND** the factory delegates to canonical `createGetProjectMetadata(deps)`
