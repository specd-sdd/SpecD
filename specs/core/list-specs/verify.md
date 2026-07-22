# Verification: List Specs

## Requirements

### Requirement: Enumerate specs across all workspaces

#### Scenario: Multiple workspaces returned in declaration order

- **GIVEN** two workspaces `alpha` and `beta` configured in that order, each containing specs
- **WHEN** `execute()` is called with no options
- **THEN** all entries from `alpha` appear before all entries from `beta`
- **AND** each workspace's items remain in repository canonical path order

#### Scenario: Empty workspace included without error

- **GIVEN** a workspace with no specs
- **WHEN** `execute()` is called
- **THEN** the result array contains no entries for that workspace and no error is thrown

#### Scenario: Workspace filter limits results

- **GIVEN** specs exist in workspaces `alpha` and `beta`
- **WHEN** `execute({ workspaces: ["alpha"] })` is called
- **THEN** only entries from workspace `alpha` are returned

#### Scenario: ListSpecs forwards include flags to each repository

- **WHEN** `execute({ includeSummary: true, includeMetadataStatus: true, limit: 50 })` is called
- **THEN** each workspace `SpecRepository.list()` receives the same forwarded options
- **AND** the use case does not re-sort or re-paginate per-workspace results

#### Scenario: Omitted limit is forwarded without inventing a default

- **GIVEN** a workspace repository with more than 100 specs
- **WHEN** `execute()` is called without `limit`
- **THEN** each workspace `SpecRepository.list()` is called without a `limit` option
- **AND** the merged per-workspace results include the full repository catalogs

### Requirement: Always resolve a title for each entry

#### Scenario: Title supplied by repository list

- **GIVEN** `SpecRepository.list()` returns entries with resolved titles
- **WHEN** `execute()` is called
- **THEN** each entry's `title` matches the repository-provided value
- **AND** the use case does not perform additional metadata or file reads to resolve titles

#### Scenario: Title fallback comes from repository index materialization

- **GIVEN** a spec at path `auth/login` indexed without metadata title
- **WHEN** `execute()` is called
- **THEN** the entry's `title` is `"login"` as returned by `SpecRepository.list()`
- **AND** `ListSpecs` does not read metadata or spec files to derive the title

#### Scenario: Empty metadata title fallback comes from repository

- **GIVEN** a spec indexed with empty trimmed metadata title and path `auth/login`
- **WHEN** `execute()` is called
- **THEN** the entry's `title` is `"login"` from the repository result

### Requirement: Optional summary resolution

#### Scenario: Summary forwarded from repository when requested

- **GIVEN** `SpecRepository.list({ includeSummary: true })` returns entries with cached `summary`
- **WHEN** `execute({ includeSummary: true })` is called
- **THEN** merged entries include the repository-provided `summary`

#### Scenario: Summary omitted when not requested

- **WHEN** `execute()` is called without `includeSummary`
- **THEN** no entry has a `summary` property

#### Scenario: Use case does not re-resolve summary with extra I/O

- **GIVEN** the repository already returned a cached summary for a spec entry
- **WHEN** `execute({ includeSummary: true })` is called
- **THEN** the use case does not call `metadata()`, read `spec.md`, or invoke summary extraction helpers for that entry

### Requirement: Optional metadata freshness status

#### Scenario: metadataStatus forwarded from repository when requested

- **GIVEN** `SpecRepository.list({ includeMetadataStatus: true })` returns entries with cached `metadataStatus`
- **WHEN** `execute({ includeMetadataStatus: true })` is called
- **THEN** merged entries include the repository-provided `metadataStatus`

#### Scenario: Status not present when not requested

- **WHEN** `execute()` is called without `includeMetadataStatus`
- **THEN** no entry has a `metadataStatus` property

#### Scenario: Use case does not re-compute freshness with extra I/O

- **GIVEN** the repository already returned `metadataStatus` for a spec entry
- **WHEN** `execute({ includeMetadataStatus: true })` is called
- **THEN** the use case does not call `metadata()`, content hashing, or schema validation for that entry

### Requirement: Silent error handling for metadata and summary reads

#### Scenario: Repository swallows per-spec resolution errors at index time

- **GIVEN** a spec whose title/summary/status resolution fails during index materialization
- **WHEN** `execute()` is called
- **THEN** the entry still appears with repository-provided fallback fields
- **AND** no error is thrown to the caller

#### Scenario: ListSpecs does not perform supplementary I/O for optional fields

- **WHEN** `execute({ includeSummary: true, includeMetadataStatus: true })` is called
- **THEN** the use case merges repository list results without additional per-spec file reads beyond repository delegation

### Requirement: SpecListEntry shape

#### Scenario: Entry contains required fields from repository

- **WHEN** `execute()` is called
- **THEN** each entry contains `workspace`, `path`, and `title` as returned by `SpecRepository.list()`

#### Scenario: Optional fields appear only when requested and projected

- **WHEN** `execute({ includeSummary: true, includeMetadataStatus: true })` is called
- **THEN** entries may contain `summary` and `metadataStatus` only when the repository projected them

#### Scenario: Workspace filter limits merged results

- **WHEN** `execute({ workspaces: ["alpha"] })` is called
- **THEN** the result array contains entries only from workspace `alpha`

### Requirement: Config-based factory delegates through resolveListSpecsDeps

#### Scenario: createListSpecs config form derives ListSpecsDeps through resolveListSpecsDeps

- **WHEN** `createListSpecs(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `ListSpecsDeps` through `resolveListSpecsDeps(resolver)`
- **AND** `resolveListSpecsDeps(resolver)` resolves `listWorkspaces: ListWorkspaces`
- **AND** it MUST NOT resolve `hasher: ContentHasher` or `yaml: YamlSerializer`
- **AND** the factory delegates to canonical `createListSpecs(deps)`
