# Verification: UpdateProjectMetadata

## Requirements

### Requirement: Hash computation

#### Scenario: Computes all hashes

- **WHEN** `UpdateProjectMetadata` is executed
- **THEN** it uses the `ContentHasher` to get fresh hashes for `specd.yaml` and context files
- **AND** it calls `GetSpecMetadata.execute({ specId })` for each spec included in the project context and records the returned `metadataFingerprint`

#### Scenario: Self-healing fingerprint computation regenerates missing or stale spec metadata

- **GIVEN** an included spec's persisted metadata is missing or stale
- **WHEN** `UpdateProjectMetadata` computes freshness hashes
- **THEN** `GetSpecMetadata` regenerates that spec's metadata as part of computing its `metadataFingerprint`
- **AND** the resulting fingerprint reflects the regenerated projection

### Requirement: Atomicity

#### Scenario: Atomic write

- **WHEN** saving `project-metadata.json`
- **THEN** the write operation is atomic (e.g., write to temp then rename)

### Requirement: Payload separation

#### Scenario: Caller cannot override hashes

- **WHEN** `UpdateProjectMetadata` is called with a payload containing internal fields like `freshness` or `version`
- **THEN** the use case ignores those fields and computes them itself, only using the provided `optimizedContext`

### Requirement: Config-based factory delegates through resolveUpdateProjectMetadataDeps

#### Scenario: createUpdateProjectMetadata config form derives UpdateProjectMetadataDeps through resolveUpdateProjectMetadataDeps

- **WHEN** `createUpdateProjectMetadata(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `UpdateProjectMetadataDeps` through `resolveUpdateProjectMetadataDeps(resolver)`
- **AND** `resolveUpdateProjectMetadataDeps(resolver)` resolves:
- `config: SpecdConfig`
- `listWorkspaces: ListWorkspaces`
- `specRepos: ReadonlyMap<string, SpecRepository>`
- `getMetadata: GetSpecMetadata`
- `files: FileReader`
- `fileWriter: FileWriter`
- `hasher: ContentHasher`
- **AND** the factory delegates to canonical `createUpdateProjectMetadata(deps)`

#### Scenario: resolveUpdateProjectMetadataDeps wires GetSpecMetadata for fingerprint computation

- **WHEN** `resolveUpdateProjectMetadataDeps(resolver)` runs
- **THEN** the resolved deps include `getMetadata: GetSpecMetadata`
- **AND** it is used to compute per-spec `metadataFingerprint` values instead of hashing raw metadata content
