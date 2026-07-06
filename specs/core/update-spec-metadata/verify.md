# Verification: UpdateSpecMetadata

## Requirements

### Requirement: Deterministic extraction before merge

#### Scenario: Merges with latest deterministic data

- **GIVEN** a spec whose `title` was changed in `spec.md` but `metadata.json` is not yet updated
- **WHEN** `UpdateSpecMetadata` is called with an optimized payload
- **THEN** it performs a fresh extraction
- **AND** the resulting metadata contains the NEW title from `spec.md` merged with the optimized fields

### Requirement: Merging optimized fields

#### Scenario: Partial update preserves other fields

- **GIVEN** existing metadata with `dependsOn: ["core:config"]`
- **WHEN** `UpdateSpecMetadata` is called with `{ "optimizedDescription": "New desc" }`
- **THEN** the resulting metadata has the new `optimizedDescription`
- **AND** it still contains `dependsOn: ["core:config"]`

### Requirement: Persistence

#### Scenario: Merged metadata is saved

- **WHEN** `UpdateSpecMetadata` completes the merge
- **THEN** it calls `SaveSpecMetadata` with the complete merged object

### Requirement: Config-based factory delegates through resolveUpdateSpecMetadataDeps

#### Scenario: createUpdateSpecMetadata config form derives UpdateSpecMetadataDeps through resolveUpdateSpecMetadataDeps

- **WHEN** `createUpdateSpecMetadata(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `UpdateSpecMetadataDeps` through `resolveUpdateSpecMetadataDeps(resolver)`
- **AND** `resolveUpdateSpecMetadataDeps(resolver)` resolves:
- `generateMetadata: GenerateSpecMetadata`
- `saveMetadata: SaveSpecMetadata`
- **AND** the factory delegates to canonical `createUpdateSpecMetadata(deps)`
