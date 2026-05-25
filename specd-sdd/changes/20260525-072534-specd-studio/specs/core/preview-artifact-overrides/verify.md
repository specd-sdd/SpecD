# Verification: Preview Artifact Overrides

## Requirements

### Requirement: override replaces disk read for matching files

#### Scenario: Draft delta changes merged output

- **GIVEN** saved delta on disk would merge to A
- **AND** override content would merge to B
- **WHEN** `PreviewSpec` runs with override for that delta filename
- **THEN** `files[].merged` reflects B
- **AND** disk delta was not read

#### Scenario: Override for new spec path

- **GIVEN** `specs/ws/path/spec.md` override with markdown body
- **WHEN** preview runs for that specId
- **THEN** merged entry uses override as full content
- **AND** base is null for new spec

### Requirement: overrides do not mutate manifest or disk

#### Scenario: Preview with overrides is read-only

- **WHEN** preview executes with overrides
- **THEN** change manifest `updatedAt` is unchanged
- **AND** artifact files on disk are unchanged
