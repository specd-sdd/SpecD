# Verification: Invalidate Spec Metadata

## Requirements

### Requirement: Removes contentHashes

#### Scenario: Existing metadata with contentHashes

- **GIVEN** a spec with metadata containing `contentHashes`
- **WHEN** `InvalidateSpecMetadata` is called
- **THEN** the metadata is re-saved as JSON without the `contentHashes` field
- **AND** all other fields (title, description, rules, etc.) are preserved

#### Scenario: Existing metadata without contentHashes

- **GIVEN** a spec with metadata that has no `contentHashes` field
- **WHEN** `InvalidateSpecMetadata` is executed for that spec
- **THEN** the file is rewritten unchanged (no-op content-wise)
- **AND** the result is still returned (not null)

### Requirement: Preserves other fields

#### Scenario: Title, description, rules survive invalidation

- **GIVEN** a spec with metadata containing `title: 'Auth'`, `description: 'Handles auth'`, `rules`, and `contentHashes`
- **WHEN** `InvalidateSpecMetadata` is executed
- **THEN** the rewritten file contains `title: 'Auth'`, `description: 'Handles auth'`, and `rules` exactly as before

### Requirement: Error on unknown workspace or spec

#### Scenario: Unknown workspace

- **WHEN** `InvalidateSpecMetadata` is executed with a workspace that does not exist
- **THEN** it throws `WorkspaceNotFoundError`

#### Scenario: Unknown spec

- **WHEN** `InvalidateSpecMetadata` is executed for a spec path that does not exist
- **THEN** it throws `SpecNotFoundError`

### Requirement: Returns null when not applicable

#### Scenario: No metadata file

- **GIVEN** a spec that exists but has no metadata
- **WHEN** `InvalidateSpecMetadata` is executed for that spec
- **THEN** the result is `null` — no file is created

#### Scenario: Non-mapping content

- **GIVEN** a spec with metadata containing a scalar value (e.g. `"hello"`)
- **WHEN** `InvalidateSpecMetadata` is executed
- **THEN** the result is `null` — the file is not modified

### Requirement: No strict validation on write

#### Scenario: Metadata written without strict validation

- **GIVEN** a spec with metadata containing `contentHashes`
- **WHEN** `InvalidateSpecMetadata` is executed
- **THEN** the metadata is written directly via `SpecRepository.saveMetadata()` without going through `SaveSpecMetadata`
- **AND** the `force: true` option is used to bypass conflict detection

### Requirement: Config-based factory delegates through resolveInvalidateSpecMetadataDeps

#### Scenario: createInvalidateSpecMetadata config form derives InvalidateSpecMetadataDeps through resolveInvalidateSpecMetadataDeps

- **WHEN** `createInvalidateSpecMetadata(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `InvalidateSpecMetadataDeps` through `resolveInvalidateSpecMetadataDeps(resolver)`
- **AND** `resolveInvalidateSpecMetadataDeps(resolver)` resolves:
- `specRepos: ReadonlyMap<string, SpecRepository>`
- **AND** the factory delegates to canonical `createInvalidateSpecMetadata(deps)`
