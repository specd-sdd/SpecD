# Verification: UpdateProjectMetadata

## Requirements

### Requirement: Hash computation

#### Scenario: Computes all hashes

- **WHEN** `UpdateProjectMetadata` is executed
- **THEN** it uses the `ContentHasher` to get fresh hashes for `specd.yaml`, context files, and included spec metadata

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
- `files: FileReader`
- `fileWriter: FileWriter`
- `hasher: ContentHasher`
- **AND** the factory delegates to canonical `createUpdateProjectMetadata(deps)`
