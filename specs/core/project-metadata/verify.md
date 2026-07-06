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
- **THEN** they include `specd.yaml`, all context files, and metadata hashes of all resolved project context specs

### Requirement: Config-based factory delegates through resolveGetProjectMetadataDeps

#### Scenario: createGetProjectMetadata config form derives GetProjectMetadataDeps through resolveGetProjectMetadataDeps

- **WHEN** `createGetProjectMetadata(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `GetProjectMetadataDeps` through `resolveGetProjectMetadataDeps(resolver)`
- **AND** `resolveGetProjectMetadataDeps(resolver)` resolves:
- `config: SpecdConfig`
- `files: FileReader`
- **AND** the factory delegates to canonical `createGetProjectMetadata(deps)`
