# core:update-spec-metadata

## Purpose

Agents and external tools that generate LLM-optimized metadata need a safe way to save these fields without managing the entire machine-readable summary or risking overwriting deterministic fields. The `UpdateSpecMetadata` use case performs a fresh deterministic extraction of spec metadata and merges it with agent-provided optimized fields before persisting, ensuring the metadata file is always up-to-date and consistent.

## Requirements

### Requirement: Deterministic extraction before merge

The use case SHALL perform a fresh extraction of metadata using the schema's `metadataExtraction` rules from the current spec files.

### Requirement: Merging optimized fields

The use case SHALL merge the provided partial metadata payload into the freshly extracted deterministic metadata. The merge SHALL specifically target `optimizedDescription` and `optimizedContext`.

### Requirement: Persistence

The resulting merged metadata SHALL be validated against `strictSpecMetadataSchema` and persisted via `SaveSpecMetadata`.

### Requirement: Config-based factory delegates through resolveUpdateSpecMetadataDeps

The config-based `createUpdateSpecMetadata(config, options?)` form MUST derive `UpdateSpecMetadataDeps` through `resolveUpdateSpecMetadataDeps(resolver)` and then delegate to canonical `createUpdateSpecMetadata(deps)`.

`resolveUpdateSpecMetadataDeps(resolver)` MUST resolve:

- `generateMetadata: GenerateSpecMetadata`
- `saveMetadata: SaveSpecMetadata`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Spec Dependencies

- [`core:spec-metadata`](../spec-metadata/spec.md)
- [`core:save-spec-metadata`](../save-spec-metadata/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
