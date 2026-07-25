# Verification: SaveSpecMetadata

## Requirements

### Requirement: SaveSpecMetadata is removed

#### Scenario: SaveSpecMetadata is not exported

- **WHEN** `@specd/core` public exports are inspected
- **THEN** `SaveSpecMetadata` and `createSaveSpecMetadata` are not present

#### Scenario: Kernel does not mount SaveSpecMetadata

- **WHEN** `createKernel(config)` is called
- **THEN** the returned kernel has no `saveSpecMetadata` entry under `kernel.specs`

#### Scenario: PersistSpecMetadata is the only remaining metadata writer, and only for MaterializeSpecMetadata

- **GIVEN** the internal `PersistSpecMetadata` collaborator
- **WHEN** it is invoked
- **THEN** it is invoked only by `MaterializeSpecMetadata`
- **AND** it accepts only a complete generated projection plus an observed `revision` — never a caller-supplied partial or arbitrary JSON payload
