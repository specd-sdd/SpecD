# Verification: Invalidate Spec Metadata

## Requirements

### Requirement: InvalidateSpecMetadata is removed

#### Scenario: InvalidateSpecMetadata is not exported

- **WHEN** `@specd/core` public exports are inspected
- **THEN** `InvalidateSpecMetadata` and `createInvalidateSpecMetadata` are not present

#### Scenario: Kernel does not mount InvalidateSpecMetadata

- **WHEN** `createKernel(config)` is called
- **THEN** the returned kernel has no `invalidateSpecMetadata` entry under `kernel.specs`

#### Scenario: Guaranteed rebuilds use RegenerateSpecMetadata instead

- **GIVEN** a caller needs a guaranteed metadata rebuild
- **WHEN** the caller looks for a supported path
- **THEN** it uses `RegenerateSpecMetadata` with a forced policy
- **AND** it does not call `InvalidateSpecMetadata`
