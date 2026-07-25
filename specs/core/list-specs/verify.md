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

#### Scenario: ListSpecs forwards includeSummary and other list options to each repository

- **WHEN** `execute({ includeSummary: true, limit: 50 })` is called
- **THEN** each workspace `SpecRepository.list()` receives the same forwarded options
- **AND** the use case does not re-sort or re-paginate per-workspace results
- **AND** it does not forward a metadata-status flag

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

#### Scenario: Summary resolved via repository list/index materialization when requested

- **GIVEN** a spec whose metadata materializes successfully at the repository/index boundary
- **WHEN** `execute({ includeSummary: true })` is called
- **THEN** the entry's `summary` is the materialized metadata's normalized `description`
- **AND** `ListSpecs` does not call `GetSpecMetadata` or `MaterializeSpecMetadata` directly

#### Scenario: Optimized description used only when fresh

- **GIVEN** `llmOptimizedContext` is active and a spec's materialized metadata reports `optimizedDescription` as fresh
- **WHEN** `execute({ includeSummary: true })` is called
- **THEN** the entry's `summary` uses the optimized value

#### Scenario: Stale or missing optimized description falls back to normalized description

- **GIVEN** a spec's materialized metadata reports `optimizedDescription` as stale or missing
- **WHEN** `execute({ includeSummary: true })` is called
- **THEN** the entry's `summary` uses the normalized `description` instead

#### Scenario: Materialization failure omits summary without failing the listing

- **GIVEN** index materialization cannot produce a projection for a spec at all
- **WHEN** `execute({ includeSummary: true })` is called
- **THEN** that entry's `summary` is omitted
- **AND** the overall listing still succeeds

#### Scenario: Summary omitted when not requested

- **WHEN** `execute()` is called without `includeSummary`
- **THEN** no entry has a `summary` property
- **AND** repository listing does not trigger summary materialization for that call

### Requirement: Silent error handling for metadata and summary reads

#### Scenario: Repository swallows per-spec resolution errors at index time

- **GIVEN** a spec whose title resolution fails during index materialization
- **WHEN** `execute()` is called
- **THEN** the entry still appears with repository-provided fallback fields
- **AND** no error is thrown to the caller

#### Scenario: Summary materialization errors are caught and omitted

- **GIVEN** repository/index summary materialization throws or fails for a spec
- **WHEN** `execute({ includeSummary: true })` is called
- **THEN** that entry's `summary` is omitted
- **AND** the error does not abort the listing or propagate to the caller

### Requirement: SpecListEntry shape

#### Scenario: Entry contains required fields from repository

- **WHEN** `execute()` is called
- **THEN** each entry contains `workspace`, `path`, and `title` as returned by `SpecRepository.list()`

#### Scenario: Optional summary field appears only when requested and materialized

- **WHEN** `execute({ includeSummary: true })` is called
- **THEN** entries may contain `summary` only when repository/index materialization succeeded for that spec
- **AND** no entry contains a `metadataStatus` field

#### Scenario: Workspace filter limits merged results

- **WHEN** `execute({ workspaces: ["alpha"] })` is called
- **THEN** the result array contains entries only from workspace `alpha`

### Requirement: Config-based factory delegates through resolveListSpecsDeps

#### Scenario: createListSpecs config form derives ListSpecsDeps through resolveListSpecsDeps

- **WHEN** `createListSpecs(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `ListSpecsDeps` through `resolveListSpecsDeps(resolver)`
- **AND** `resolveListSpecsDeps(resolver)` resolves `listWorkspaces: ListWorkspaces`
- **AND** the factory delegates to canonical `createListSpecs(deps)`

#### Scenario: resolveListSpecsDeps does not resolve metadata, hasher, or yaml serializer

- **WHEN** `resolveListSpecsDeps(resolver)` runs
- **THEN** it does not resolve `getMetadata`, `materializeMetadata`, `hasher: ContentHasher`, or `yaml: YamlSerializer`
- **AND** summary projection occurs inside `SpecRepository.list()` / `FsSpecIndexCache` when `includeSummary` is requested
