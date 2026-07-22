# Verification: Repository Base

## Requirements

### Requirement: Abstract class, not interface

#### Scenario: Repository cannot be instantiated directly

- **WHEN** code attempts to instantiate `Repository` directly
- **THEN** it fails because `Repository` is abstract

#### Scenario: Subclasses extend Repository

- **GIVEN** a concrete class extending `Repository`
- **WHEN** the subclass is instantiated with `RepositoryConfig`
- **THEN** it compiles and can be instantiated as a concrete repository

### Requirement: Immutable accessors

#### Scenario: Accessors return construction-time values

- **GIVEN** a `Repository` subclass constructed with `{ workspace: "billing", ownership: "shared", isExternal: true, configPath: "/project/.specd/config" }`
- **THEN** `workspace()` returns `"billing"`
- **AND** `ownership()` returns `"shared"`
- **AND** `isExternal()` returns `true`
- **AND** `configPath()` returns `"/project/.specd/config"`

### Requirement: Subclass contract

#### Scenario: Subclass inherits accessors without redeclaring them

- **GIVEN** a `ChangeRepository` subclass that does not override `workspace()`, `ownership()`, `isExternal()`, or `configPath()`
- **WHEN** the subclass is constructed with `{ workspace: "default", ownership: "owned", isExternal: false, configPath: "/project/.specd/config" }`
- **THEN** all four accessors return the values from `RepositoryConfig`

### Requirement: ReadOnlyWorkspaceError

#### Scenario: Error extends DomainError

- **WHEN** a `ReadOnlyWorkspaceError` is constructed
- **THEN** it is an instance of `DomainError`
- **AND** it is an instance of `Error`

#### Scenario: Error preserves message

- **GIVEN** a message `'Cannot write to spec "platform:auth/tokens" — workspace "platform" is readOnly.'`
- **WHEN** `ReadOnlyWorkspaceError` is constructed with that message
- **THEN** `error.message` equals the provided message

### Requirement: Shared list pagination types

#### Scenario: Default limit is 100

- **WHEN** a listable repository `list()` method is called without `limit`
- **THEN** `meta.limit` is 100
- **AND** at most 100 items are returned unless fewer exist

#### Scenario: Page and after are mutually exclusive

- **WHEN** list options include both `page` and `after`
- **THEN** the repository rejects the request or normalizes to one pagination mode without applying both

#### Scenario: After cursor returns the next page in canonical order

- **GIVEN** a bucket with at least three entries in canonical sort order
- **WHEN** `list({ limit: 1, after: { key: <first-key>, id: <first-id> } })` is called for a change bucket
- **THEN** the first returned item is strictly after that cursor position
- **AND** `meta.after` reflects the last returned position when more items remain

### Requirement: invalidateCache resets adapter caches

#### Scenario: Base implementation is a no-op

- **GIVEN** a concrete repository subclass that does not override cache invalidation
- **WHEN** `invalidateCache()` is called
- **THEN** it resolves without throwing
- **AND** it performs no adapter-specific side effects beyond the default no-op

#### Scenario: Filesystem subclass may mark caches invalidated

- **GIVEN** a filesystem-backed repository that overrides `invalidateCache()`
- **WHEN** `invalidateCache()` is called after external storage changes
- **THEN** subsequent list or count operations observe invalidated index state and rebuild as required

### Requirement: RepositoryConfig shape

#### Scenario: RepositoryConfig includes configPath

- **GIVEN** a repository constructed with `{ workspace: "default", ownership: "owned", isExternal: false, configPath: "/project/.specd/config" }`
- **WHEN** the repository is instantiated
- **THEN** construction succeeds without error

#### Scenario: RepositoryConfig requires configPath for runtime-owned storage

- **GIVEN** a repository implementation derives change locks or graph persistence paths
- **WHEN** it is constructed from `RepositoryConfig`
- **THEN** `configPath` is available as the absolute config-directory root for those derived paths
