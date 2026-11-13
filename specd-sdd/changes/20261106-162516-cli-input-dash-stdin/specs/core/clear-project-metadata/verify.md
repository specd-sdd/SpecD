# Verification: ClearProjectMetadata

## Requirements

### Requirement: Delete project-metadata.json

#### Scenario: Deletes existing cache file

- **GIVEN** `{configPath}/project-metadata.json` exists
- **WHEN** `ClearProjectMetadata.execute` runs
- **THEN** the file is deleted atomically
- **AND** the result reports `cleared: true` with the resolved path

### Requirement: Idempotent when absent

#### Scenario: Succeeds when file is missing

- **GIVEN** `{configPath}/project-metadata.json` does not exist
- **WHEN** `ClearProjectMetadata.execute` runs
- **THEN** it succeeds without creating the file
- **AND** the result reports `cleared: false`

### Requirement: Result contract

#### Scenario: Returns path and cleared flag

- **WHEN** `ClearProjectMetadata.execute` completes successfully
- **THEN** the result includes `path` and `cleared`

### Requirement: Config-based factory through composition resolver

#### Scenario: Config factory resolves deps through dedicated helper

- **WHEN** `createClearProjectMetadata(config, options?)` is invoked
- **THEN** it derives deps through `resolveClearProjectMetadataDeps(resolver)`
- **AND** it delegates to the canonical deps-based factory
- **AND** it does not reconstruct filesystem wiring inline
