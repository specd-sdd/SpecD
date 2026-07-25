# Verification: Search Specs

## Requirements

### Requirement: Multi-workspace search orchestration

#### Scenario: Results merged and sorted by score

- **GIVEN** workspace `alpha` has a spec scoring 0.8 and workspace `beta` has a spec scoring 0.9 for the same query
- **WHEN** `execute("test")` is called
- **THEN** the result array has two entries sorted with the `beta` entry first (higher score)

#### Scenario: Empty result when nothing matches

- **GIVEN** no spec in any workspace matches the query
- **WHEN** `execute("zzzznonexistent")` is called
- **THEN** the result array is empty

#### Scenario: SearchSpecs uses orchestrated project structure

- **WHEN** `SearchSpecs.execute()` is called
- **THEN** it obtains the list of workspaces via the `ListWorkspaces` orchestrator
- **AND** it performs the content search through the provided repository instances

### Requirement: Optional workspace filter

#### Scenario: Filter to single workspace

- **GIVEN** specs matching the query exist in both `alpha` and `beta` workspaces
- **WHEN** `execute("test", { workspaces: ["alpha"] })` is called
- **THEN** only entries from workspace `alpha` appear in results

#### Scenario: Unknown workspace name silently ignored

- **GIVEN** no workspace named `nonexistent` is configured
- **WHEN** `execute("test", { workspaces: ["nonexistent"] })` is called
- **THEN** the result array is empty and no error is thrown

### Requirement: Optional summary resolution

#### Scenario: Summary included when requested

- **GIVEN** a matching spec's metadata materializes successfully with `description: "Handles auth"`
- **WHEN** `execute("auth", { includeSummary: true })` is called
- **THEN** the result entry includes `summary: "Handles auth"`

#### Scenario: Summary absent when not requested

- **GIVEN** a matching spec's metadata would materialize with a description
- **WHEN** `execute("auth")` is called without `includeSummary`
- **THEN** the result entry has no `summary` property
- **AND** `SearchSpecs` does not materialize metadata for that result

#### Scenario: Materialization failure omits summary without failing the search

- **GIVEN** materialization cannot produce a projection for a matched spec
- **WHEN** `execute("auth", { includeSummary: true })` is called
- **THEN** that result's `summary` is omitted
- **AND** the search still returns the result with its other fields

### Requirement: Result shape

#### Scenario: Entry contains required fields

- **GIVEN** a spec at path `auth/login` in workspace `default` matches with score 0.75
- **WHEN** `execute("login")` is called
- **THEN** the entry has `workspace: "default"`, `path: "auth/login"`, `title` (string), `score: 0.75`, and `matches` (array)

### Requirement: Silent error handling

#### Scenario: One workspace fails, others still returned

- **GIVEN** workspace `alpha` search throws an I/O error and workspace `beta` returns results
- **WHEN** `execute("test")` is called
- **THEN** results from `beta` are returned
- **AND** no error propagates to the caller

### Requirement: Empty results

#### Scenario: No matches returns empty array

- **GIVEN** no spec in any workspace matches the query
- **WHEN** `execute("zzzznonexistent")` is called
- **THEN** the result is an empty array (not an error)

### Requirement: Config-based factory delegates through resolveSearchSpecsDeps

#### Scenario: createSearchSpecs config form derives SearchSpecsDeps through resolveSearchSpecsDeps

- **WHEN** `createSearchSpecs(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `SearchSpecsDeps` through `resolveSearchSpecsDeps(resolver)`
- **AND** `resolveSearchSpecsDeps(resolver)` resolves:
- `listWorkspaces: ListWorkspaces`
- `getMetadata: GetSpecMetadata`
- **AND** the factory delegates to canonical `createSearchSpecs(deps)`

#### Scenario: resolveSearchSpecsDeps does not resolve hasher or yaml serializer

- **WHEN** `resolveSearchSpecsDeps(resolver)` runs
- **THEN** it does not resolve `hasher: ContentHasher` or `yaml: YamlSerializer`
- **AND** normalized result fields are obtained through metadata materialization, not through direct repository snapshot reads
