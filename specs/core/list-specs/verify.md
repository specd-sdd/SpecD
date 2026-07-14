# Verification: List Specs

## Requirements

### Requirement: Enumerate specs across all workspaces

#### Scenario: Multiple workspaces returned in declaration order

- **GIVEN** two workspaces `alpha` and `beta` configured in that order, each containing specs
- **WHEN** `execute()` is called with no options
- **THEN** all entries from `alpha` appear before all entries from `beta`

#### Scenario: Empty workspace included without error

- **GIVEN** a workspace with no specs
- **WHEN** `execute()` is called
- **THEN** the result array contains no entries for that workspace and no error is thrown

#### Scenario: Workspace filter limits results

- **GIVEN** specs exist in workspaces `alpha` and `beta`
- **WHEN** `execute({ workspaces: ["alpha"] })` is called
- **THEN** only entries from workspace `alpha` are returned

#### Scenario: Unknown workspace name in filter silently ignored

- **GIVEN** no workspace named `nonexistent` is configured
- **WHEN** `execute({ workspaces: ["nonexistent"] })` is called
- **THEN** the result array is empty and no error is thrown

#### Scenario: Empty workspaces array includes all

- **GIVEN** specs exist in workspaces `alpha` and `beta`
- **WHEN** `execute({ workspaces: [] })` is called
- **THEN** entries from both workspaces are returned

#### Scenario: ListSpecs uses orchestrated project structure

- **WHEN** `ListSpecs.execute()` is called
- **THEN** it obtains the list of workspaces via the `ListWorkspaces` orchestrator
- **AND** it enumerates all specs through the provided repository instances

### Requirement: Always resolve a title for each entry

#### Scenario: Title from metadata

- **GIVEN** a spec with metadata containing `title: "OAuth Login"`
- **WHEN** `execute()` is called
- **THEN** the entry's `title` is `"OAuth Login"`

#### Scenario: Title fallback to path segment

- **GIVEN** a spec at path `auth/login` with no metadata
- **WHEN** `execute()` is called
- **THEN** the entry's `title` is `"login"`

#### Scenario: Empty metadata title triggers fallback

- **GIVEN** a spec at path `auth/login` with metadata containing `title: "  "`
- **WHEN** `execute()` is called
- **THEN** the entry's `title` is `"login"` (fallback applied)

### Requirement: Optional summary resolution

#### Scenario: Summary from metadata description

- **GIVEN** a spec with metadata containing `description: "Handles OAuth flows"`
- **WHEN** `execute({ includeSummary: true })` is called
- **THEN** the entry's `summary` is `"Handles OAuth flows"`

#### Scenario: Summary extracted from spec.md when no description in metadata

- **GIVEN** a spec with no `description` in metadata but a `spec.md` with an extractable overview
- **WHEN** `execute({ includeSummary: true })` is called
- **THEN** the entry's `summary` is the extracted overview text

#### Scenario: Summary omitted when no source available

- **GIVEN** a spec with no metadata description and no `spec.md`
- **WHEN** `execute({ includeSummary: true })` is called
- **THEN** the entry has no `summary` property

#### Scenario: Summary not present when not requested

- **WHEN** `execute()` is called without `includeSummary`
- **THEN** no entry has a `summary` property

### Requirement: Optional metadata freshness status

#### Scenario: Status is missing when no metadata

- **GIVEN** a spec with no metadata
- **WHEN** `execute({ includeMetadataStatus: true })` is called
- **THEN** the entry's `metadataStatus` is `'missing'`

#### Scenario: Status is invalid when metadata fails structural validation

- **GIVEN** a spec with metadata that fails `strictSpecMetadataSchema` parsing
- **WHEN** `execute({ includeMetadataStatus: true })` is called
- **THEN** the entry's `metadataStatus` is `'invalid'`

#### Scenario: Status is stale when hashes do not match

- **GIVEN** a spec with valid metadata whose `contentHashes` do not match current file contents
- **WHEN** `execute({ includeMetadataStatus: true })` is called
- **THEN** the entry's `metadataStatus` is `'stale'`

#### Scenario: Status is fresh when all hashes match

- **GIVEN** a spec with valid metadata whose `contentHashes` all match current file contents
- **WHEN** `execute({ includeMetadataStatus: true })` is called
- **THEN** the entry's `metadataStatus` is `'fresh'`

#### Scenario: Status not present when not requested

- **WHEN** `execute()` is called without `includeMetadataStatus`
- **THEN** no entry has a `metadataStatus` property

### Requirement: Silent error handling for metadata and summary reads

#### Scenario: Metadata read error does not propagate

- **GIVEN** `repo.metadata(spec)` throws an I/O error
- **WHEN** `execute()` is called
- **THEN** the entry still appears with the path-segment fallback title and no error is thrown

#### Scenario: spec.md read error does not propagate

- **GIVEN** `repo.artifact(spec, 'spec.md')` throws an I/O error during summary resolution
- **WHEN** `execute({ includeSummary: true })` is called
- **THEN** the entry still appears without a `summary` and no error is thrown

### Requirement: SpecListEntry shape

#### Scenario: Entry contains required fields

- **WHEN** `execute()` is called
- **THEN** each entry contains `workspace` (string), `path` (string), and `title` (string)

#### Scenario: Entry may contain optional fields when requested

- **WHEN** `execute({ includeSummary: true, includeMetadataStatus: true })` is called
- **THEN** entries may contain `summary` and `metadataStatus` in addition to required fields

### Requirement: Config-based factory delegates through resolveListSpecsDeps

#### Scenario: createListSpecs config form derives ListSpecsDeps through resolveListSpecsDeps

- **WHEN** `createListSpecs(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `ListSpecsDeps` through `resolveListSpecsDeps(resolver)`
- **AND** `resolveListSpecsDeps(resolver)` resolves:
- `listWorkspaces: ListWorkspaces`
- `hasher: ContentHasher`
- `yaml: YamlSerializer`
- **AND** the factory delegates to canonical `createListSpecs(deps)`
