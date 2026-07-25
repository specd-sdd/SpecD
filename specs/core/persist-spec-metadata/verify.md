# Verification: core:persist-spec-metadata

## Requirements

### Requirement: Internal collaborator, not a public use case

#### Scenario: PersistSpecMetadata is absent from Kernel and public exports

- **GIVEN** the Core public export surface and the constructed `Kernel`
- **WHEN** they are inspected
- **THEN** `PersistSpecMetadata` is not present on `Kernel`
- **AND** it is not exported by Core, the SDK, the CLI, or MCP

#### Scenario: Only MaterializeSpecMetadata calls PersistSpecMetadata

- **GIVEN** the composition wiring for `MaterializeSpecMetadata`
- **WHEN** `PersistSpecMetadata` is constructed
- **THEN** it is instantiated only as an internal collaborator of `MaterializeSpecMetadata`
- **AND** no other use case or host holds a reference to it as a general-purpose metadata write API

### Requirement: Input is one complete projection plus observed revision

#### Scenario: expectedRevision null means create

- **GIVEN** a caller that observed no persisted metadata for a spec
- **WHEN** it calls `PersistSpecMetadata` with `expectedRevision: null`
- **THEN** the operation is treated as a creation attempt

#### Scenario: Partial metadata patch is rejected

- **GIVEN** a caller that supplies a metadata object missing required fields of a complete `SpecMetadata` projection
- **WHEN** `PersistSpecMetadata` is invoked
- **THEN** it does not accept the partial patch as valid input
- **AND** it does not attempt to merge it with an existing projection

### Requirement: Structural validation before write

#### Scenario: Validation failure prevents any repository write

- **GIVEN** a generated metadata projection that fails structural validation
- **WHEN** `PersistSpecMetadata` is invoked
- **THEN** it rejects with a typed validation error
- **AND** `SpecRepository.writeMetadataSnapshot` is never called

### Requirement: Delegates conditional persistence to the repository

#### Scenario: No independent file I/O or conflict detection is implemented

- **GIVEN** a structurally valid projection and an `expectedRevision`
- **WHEN** `PersistSpecMetadata` persists it
- **THEN** it delegates the write to `SpecRepository.writeMetadataSnapshot(spec, metadata, { expectedRevision })`
- **AND** it performs no direct file I/O, serialization, or storage-specific conflict detection of its own

#### Scenario: Repository-reported revision conflict is propagated, not retried

- **GIVEN** the repository reports that the observed `expectedRevision` no longer matches the current persisted revision
- **WHEN** `PersistSpecMetadata` receives that outcome
- **THEN** it propagates a typed conflict error
- **AND** it does not retry or silently merge with the concurrent write

### Requirement: No dependsOn or optimization authority

#### Scenario: PersistSpecMetadata stores the projection as-is

- **GIVEN** a complete projection assembled by `MaterializeSpecMetadata`, including its `dependsOn` and optimization fields
- **WHEN** `PersistSpecMetadata` validates and writes it
- **THEN** it does not recompute, override, or filter `dependsOn`, optimization freshness, or field membership
- **AND** it stores exactly the projection it received

### Requirement: Construction and dependency injection

#### Scenario: No public composition wrapper is required

- **GIVEN** `PersistSpecMetadata` is not Kernel-mounted
- **WHEN** Core composition is inspected
- **THEN** there is no requirement for a public `createPersistSpecMetadata(config, options?)` wrapper
- **AND** `MaterializeSpecMetadata`'s own composition wiring may instantiate `PersistSpecMetadata` directly using the shared `CompositionResolver`
