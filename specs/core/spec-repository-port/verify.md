# Verification: SpecRepository Port

## Requirements

### Requirement: Inheritance from Repository base

#### Scenario: Extends Repository with immutable accessors

- **GIVEN** a concrete `SpecRepository` implementation
- **WHEN** it is instantiated with workspace, ownership, and isExternal values
- **THEN** it extends `Repository`
- **AND** `workspace()`, `ownership()`, and `isExternal()` return the constructor-provided values
- **AND** these values are immutable for the lifetime of the instance

### Requirement: Spec counting

#### Scenario: Count matches list meta.total from index source

- **GIVEN** a workspace with a known number of specs indexed for listing
- **WHEN** `count()` and `list().meta.total` are queried
- **THEN** both return the same total
- **AND** `count()` does not load metadata for every spec via repeated full list materialization

### Requirement: Spec list reindex

#### Scenario: reindex rebuilds workspace spec list cache

- **GIVEN** a filesystem-backed `SpecRepository` for workspace `core`
- **WHEN** `reindex()` is called
- **THEN** the spec list index under `{configPath}/tmp/fs-cache/specs/core/` is fully rebuilt from disk

### Requirement: saveMetadata persists metadata with conflict detection

#### Scenario: Read-only workspace throws error

- **GIVEN** a `SpecRepository` with ownership `readOnly`
- **WHEN** `saveMetadata(spec, content)` is called
- **THEN** `ReadOnlyWorkspaceError` is thrown before any filesystem operation

#### Scenario: Write with conflict detection

- **GIVEN** a `SpecRepository` with ownership `owned`
- **AND** existing metadata file with a different hash than `content.originalHash`
- **WHEN** `saveMetadata(spec, content)` is called
- **THEN** `ArtifactConflictError` is thrown

#### Scenario: Force write skips conflict detection

- **GIVEN** a `SpecRepository` with ownership `owned`
- **AND** existing metadata with different hash
- **WHEN** `saveMetadata(spec, content, { force: true })` is called
- **THEN** the file is written without error

### Requirement: Abstract class with abstract methods

#### Scenario: Port is an abstract class with abstract storage methods

- **WHEN** `SpecRepository` is examined
- **THEN** it is declared as `abstract class`
- **AND** `get`, `list`, `count`, `reindex`, `artifact`, `save`, `delete`, `resolveFromPath`, `metadata`, `saveMetadata`, and `search` are declared as `abstract` methods
- **AND** a concrete implementation can extend it and implement these methods

### Requirement: Workspace scoping

#### Scenario: Operations are limited to the bound workspace

- **GIVEN** a `SpecRepository` bound to workspace `billing`
- **WHEN** `list()` is called
- **THEN** only specs within the `billing` workspace are returned

### Requirement: get returns a Spec or null

#### Scenario: Spec exists

- **WHEN** `get(SpecPath.parse("auth/oauth"))` is called and the spec exists in this workspace
- **THEN** a `Spec` is returned with workspace, name, and filenames populated
- **AND** no artifact content is loaded

#### Scenario: Spec does not exist

- **WHEN** `get(SpecPath.parse("nonexistent/spec"))` is called and no such spec exists
- **THEN** `null` is returned

### Requirement: list returns spec metadata with optional prefix filter

#### Scenario: List all specs as SpecListEntry rows

- **GIVEN** a workspace with specs `auth/login`, `auth/oauth`, and `billing/invoices`
- **WHEN** `list()` is called without a prefix
- **THEN** the result is `ListResult<SpecListEntry>` containing all three entries ordered by capability path ascending
- **AND** each item includes resolved `workspace`, `path`, and `title`

#### Scenario: List with prefix filter

- **GIVEN** a workspace with specs `auth/login`, `auth/oauth`, and `billing/invoices`
- **WHEN** `list(SpecPath.parse("auth"))` is called
- **THEN** only `auth/login` and `auth/oauth` are returned

#### Scenario: Empty workspace

- **WHEN** `list()` is called on an empty workspace
- **THEN** `{ items: [], meta: { total: 0, count: 0, limit: 0 } }` is returned

### Requirement: SpecListEntry port shape

#### Scenario: Title falls back to path segment

- **GIVEN** a spec with no valid metadata title
- **WHEN** the repository projects a `SpecListEntry`
- **THEN** `title` equals the last segment of `path`

#### Scenario: Summary and metadataStatus respect include flags

- **GIVEN** a cached spec list entry payload with resolvable summary and metadata status
- **WHEN** `list(undefined, { includeSummary: true, includeMetadataStatus: true })` is called
- **THEN** returned items include projected `summary` and `metadataStatus`
- **WHEN** the same call omits both include flags
- **THEN** returned items omit `summary` and `metadataStatus`

#### Scenario: Resolution errors still return an entry with title fallback

- **GIVEN** a spec whose summary or status resolution encounters an I/O error during indexing
- **WHEN** `list()` is called
- **THEN** the spec still appears with a title fallback
- **AND** the list call does not fail because of that individual spec

### Requirement: artifact loads a single artifact file

#### Scenario: Artifact exists

- **GIVEN** a spec with artifact file `spec.md` on disk
- **WHEN** `artifact(spec, "spec.md")` is called
- **THEN** a `SpecArtifact` is returned with the file content and `originalHash` set

#### Scenario: Artifact does not exist

- **WHEN** `artifact(spec, "nonexistent.md")` is called
- **THEN** `null` is returned

### Requirement: Spec artifact access is limited to expected artifact files

#### Scenario: Expected spec artifact file can be read

- **GIVEN** `spec.md` is a valid artifact file for the target spec
- **WHEN** `artifact(spec, "spec.md")` is called
- **THEN** the repository returns that artifact

#### Scenario: Unexpected extra file is rejected

- **GIVEN** an extra file exists in the spec directory but is not a valid artifact or adapter-owned metadata file
- **WHEN** `artifact(spec, "<extra-file>")` or `save(spec, artifact("<extra-file>"))` is called
- **THEN** the repository rejects the operation

#### Scenario: spec-lock is not exposed as a normal artifact

- **GIVEN** a persisted spec directory contains `spec-lock.json`
- **WHEN** `get()` or `list()` returns the spec metadata
- **THEN** `spec-lock.json` does not appear in `Spec.filenames`
- **AND** `artifact(spec, "spec-lock.json")` is rejected

### Requirement: Spec artifact path confinement

#### Scenario: Read rejects escaping path

- **WHEN** `artifact(spec, "../other-spec/spec.md")` or an equivalent escape path is requested
- **THEN** the repository rejects the request

#### Scenario: Save rejects escaping path

- **WHEN** `save(spec, artifact("../other-spec/spec.md"))` or an equivalent escape path is requested
- **THEN** the repository rejects the request

### Requirement: Spec artifact resolution debug logging

#### Scenario: Debug logs cover expected-file resolution and rejection

- **WHEN** debug logging is enabled for `SpecRepository`
- **THEN** successful expected-artifact resolution emits debug output
- **AND** unsupported filename rejection or path-confinement rejection also emits debug output

### Requirement: save persists a single artifact with conflict detection

#### Scenario: ReadOnly workspace rejects save

- **GIVEN** a `SpecRepository` bound to a workspace with `readOnly` ownership
- **WHEN** `save(spec, artifact)` is called
- **THEN** `ReadOnlyWorkspaceError` is thrown
- **AND** no file is written to disk

#### Scenario: First write creates spec directory

- **GIVEN** a spec whose directory does not yet exist
- **AND** the workspace ownership is `owned`
- **WHEN** `save(spec, artifact)` is called
- **THEN** the directory is created and the artifact file is written

#### Scenario: Conflict detected on save

- **GIVEN** an artifact loaded with `originalHash` and the file on disk was modified by another process
- **WHEN** `save(spec, artifact)` is called without `force`
- **THEN** `ArtifactConflictError` is thrown

#### Scenario: Force save bypasses conflict detection

- **GIVEN** an artifact whose `originalHash` does not match the current file on disk
- **WHEN** `save(spec, artifact, { force: true })` is called
- **THEN** the file is overwritten without error

### Requirement: delete removes the entire spec directory

#### Scenario: Spec directory is fully removed

- **GIVEN** a spec with multiple artifact files
- **WHEN** `delete(spec)` is called
- **THEN** the entire spec directory and all its files are removed

### Requirement: resolveFromPath resolves storage paths to spec identity

#### Scenario: Absolute path resolves within workspace

- **GIVEN** an absolute path pointing to a spec in this workspace
- **WHEN** `resolveFromPath(absolutePath)` is called
- **THEN** `{ specPath, specId }` is returned

#### Scenario: Relative path resolves within workspace

- **GIVEN** a relative spec link `../storage/spec.md` and a reference spec
- **WHEN** `resolveFromPath("../storage/spec.md", fromSpecPath)` is called
- **THEN** `{ specPath, specId }` is returned if the resolved path is within this workspace

#### Scenario: Relative path escapes workspace

- **GIVEN** a relative spec link that escapes the current workspace boundary
- **WHEN** `resolveFromPath("../../other-workspace/auth/spec.md", fromSpecPath)` is called
- **THEN** `{ crossWorkspaceHint }` is returned with hint segments for the caller

#### Scenario: Invalid spec link

- **WHEN** `resolveFromPath("not-a-spec-link")` is called and the path does not resolve to any spec
- **THEN** `null` is returned

### Requirement: metadata returns parsed metadata or null

#### Scenario: ReadOnly workspace rejects saveMetadata

- **GIVEN** a `SpecRepository` bound to a workspace with `readOnly` ownership
- **WHEN** `saveMetadata(spec, content)` is called
- **THEN** `ReadOnlyWorkspaceError` is thrown
- **AND** no file is written to disk

#### Scenario: Metadata exists

- **GIVEN** a spec `core:config` with a `metadata.json` in the metadata storage
- **WHEN** `metadata(spec)` is called
- **THEN** the result contains the parsed JSON content with `originalHash`
- **AND** `saveMetadata(spec, '{"title":"Config"}')` persists the JSON content
- **AND** the file can be read back via `metadata(spec)` with `title: "Config"`

#### Scenario: Metadata does not exist

- **GIVEN** a spec with no metadata on disk
- **WHEN** `metadata(spec)` is called
- **THEN** `null` is returned

### Requirement: search returns specs matching a text query

#### Scenario: Matching specs returned with score

- **GIVEN** a workspace with a spec whose `spec.md` contains the word "authentication"
- **WHEN** `search("authentication")` is called
- **THEN** the result array contains a `SpecSearchResult` with that spec
- **AND** the `score` is a positive number
- **AND** `matches` contains at least one entry with `filename: "spec.md"`

#### Scenario: No matching specs returns empty array

- **GIVEN** a workspace with no specs containing "zzzznonexistent"
- **WHEN** `search("zzzznonexistent")` is called
- **THEN** the result array is empty

#### Scenario: Results sorted by score descending

- **GIVEN** a workspace with two specs matching the query with different relevance
- **WHEN** `search("test")` is called
- **THEN** results are ordered with the higher-scoring spec first

#### Scenario: Limit option respected

- **GIVEN** a workspace with 5 specs matching the query
- **WHEN** `search("test", { limit: 2 })` is called
- **THEN** at most 2 results are returned

#### Scenario: Search scoped to single workspace

- **GIVEN** a `SpecRepository` bound to workspace `billing`
- **WHEN** `search("invoice")` is called
- **THEN** only specs within the `billing` workspace are returned

### Requirement: persisted spec semantics and stable spec hash

#### Scenario: specHash remains stable when state is unchanged

- **GIVEN** a persisted spec with unchanged artifacts, persisted dependencies, and implementation links
- **WHEN** the repository is asked for its stable spec hash twice
- **THEN** both calls return the same hash

#### Scenario: specHash changes when state is modified

- **GIVEN** a persisted spec with an initial stable spec hash
- **WHEN** the repository updates persisted dependencies or implementation state for that spec
- **THEN** the returned hash differs from the previous value

#### Scenario: persisted dependency state is read semantically

- **GIVEN** a persisted spec with archived dependency state
- **WHEN** application logic needs the canonical persisted `dependsOn` list
- **THEN** it reads that value through `readPersistedDependsOn(spec)`
- **AND** it does not need `Spec.filenames` or generic artifact reads to discover the sidecar

### Requirement: Filesystem-backed specs capability

#### Scenario: Filesystem-backed repository exposes canonical specsPath

- **GIVEN** a repository backed by filesystem directories
- **WHEN** the repository is constructed
- **THEN** it exposes an absolute `specsPath` identifying its canonical spec root

#### Scenario: Non-filesystem repository does not require specsPath

- **GIVEN** a repository implementation not backed by a directly addressable filesystem
- **WHEN** it implements the `SpecRepository` contract
- **THEN** it is not required to expose `specsPath`

#### Scenario: Stale metadata remains readable

- **GIVEN** a spec has persisted `metadata.json`
- **AND** staleness detection marks it stale
- **WHEN** `metadata(spec)` is called
- **THEN** the repository returns the parsed persisted metadata
- **AND** the result includes `freshness: 'stale'`
- **AND** the repository does not regenerate metadata implicitly
