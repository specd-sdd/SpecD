# Verification: Preview Artifact Overrides

## Requirements

### Requirement: PreviewSpec input accepts artifactOverrides

#### Scenario: PreviewSpec input accepts artifactOverrides — primary path

- **WHEN** PreviewSpecInput MAY include artifactOverrides?: Readonly<Record<string, string>> mapping change-relative
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: PreviewSpec input accepts artifactOverrides — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

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

### Requirement: non-overridden files unchanged

#### Scenario: non-overridden files unchanged — primary path

- **WHEN** Files without an override MUST continue to load
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: non-overridden files unchanged — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: overrides do not mutate manifest or disk

#### Scenario: Preview with overrides is read-only

- **WHEN** preview executes with overrides
- **THEN** change manifest `updatedAt` is unchanged
- **AND** artifact files on disk are unchanged
