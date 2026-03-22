# Verification: Invalidate Spec Metadata

## Requirements

### Requirement: Removes contentHashes

#### Scenario: Existing metadata with contentHashes

- **GIVEN** a spec with metadata containing `title`, `description`, `contentHashes`, and `rules`
- **WHEN** `InvalidateSpecMetadata` is executed for that spec
- **THEN** the rewritten file has no `contentHashes` field
- **AND** the spec appears as `stale` in staleness detection

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
