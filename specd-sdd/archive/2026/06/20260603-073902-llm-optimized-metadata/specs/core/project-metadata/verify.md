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
