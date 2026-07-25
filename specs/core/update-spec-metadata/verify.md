# Verification: UpdateSpecMetadata

## Requirements

### Requirement: UpdateSpecMetadata is removed

#### Scenario: UpdateSpecMetadata is not exported

- **WHEN** `@specd/core` public exports are inspected
- **THEN** `UpdateSpecMetadata` and `createUpdateSpecMetadata` are not present

#### Scenario: Kernel does not mount UpdateSpecMetadata

- **WHEN** `createKernel(config)` is called
- **THEN** the returned kernel has no `updateSpecMetadata` entry under `kernel.specs`

#### Scenario: Callers persist optimized fields through UpdatePersistedSpecOptimizations instead

- **GIVEN** a caller needs to persist an LLM-optimized description or context field
- **WHEN** the caller looks for a supported write path
- **THEN** it uses `UpdatePersistedSpecOptimizations` (`specs optimizations set`/`clear`)
- **AND** it does not call `UpdateSpecMetadata`
