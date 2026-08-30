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

### Requirement: Abstract class with abstract methods

#### Scenario: Port declares its full abstract storage method roster

- **WHEN** `SpecRepository` is examined
- **THEN** it is declared as `abstract class`
- **AND** `get`, `list`, `count`, `reindex`, `artifact`, `save`, `delete`, `resolveFromPath`, `readMetadataSnapshot`, `writeMetadataSnapshot`, `readPersistedState`, `writePersistedState`, `artifactMeta`, `persistedStateMeta`, `generatedMetadataMeta`, `specFingerprint`, and `search` are declared as `abstract` methods
- **AND** a concrete implementation can extend it and implement these methods

#### Scenario: Removed field-wise and hash-only methods are not part of the abstract roster

- **WHEN** `SpecRepository` is examined
- **THEN** the abstract roster does not declare `metadata`, `saveMetadata`, `readPersistedSchema`, `readPersistedDependsOn`, `readPersistedImplementation`, `updatePersistedState`, or `persistedStateHash`

### Requirement: Workspace scoping

#### Scenario: Operations are limited to the bound workspace

- **GIVEN** a `SpecRepository` bound to workspace `billing`
- **WHEN** `list()` is called
- **THEN** only specs within the `billing` workspace are returned

### Requirement: get returns a Spec or null

#### Scenario: Spec exists

- **WHEN** `get(SpecPath.parse("auth/oauth"))` is called and the spec exists in this
  workspace
- **THEN** a `Spec` is returned with `workspace`, `name`, `artifacts`
  (`SpecArtifactEntry` with `filename` + `lastModified`), `persistedStateStamp`, and
  `generatedMetadataStamp` populated
- **AND** derived `filenames` and `hasArtifact(filename)` reflect the same presence set
- **AND** no artifact content is loaded

#### Scenario: Spec does not exist

- **WHEN** `get(SpecPath.parse("nonexistent/spec"))` is called and no such spec exists
- **THEN** `null` is returned

#### Scenario: SpecArtifactEntry carries byte-size from the adapter stat

- **GIVEN** an adapter family with cheap file metadata (filesystem-backed)
- **WHEN** `get(name)` builds `Spec.artifacts`
- **THEN** each `SpecArtifactEntry` includes `size` in bytes observed from the same stat as `lastModified`
- **AND** adapter families without cheap metadata MAY omit `size`

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

#### Scenario: Summary and Meta respect include flags

- **GIVEN** a cached spec list entry payload with resolvable summary and Meta stamps
- **WHEN** `list(undefined, { includeSummary: true, includeMeta: true })` is called
- **THEN** returned items include projected `summary`, `artifacts`, `persistedStateMeta`, and `generatedMetadataMeta`
- **AND** none of the Meta fields include `hash`
- **WHEN** the same call omits both include flags
- **THEN** returned items omit `summary`, `artifacts`, `persistedStateMeta`, and `generatedMetadataMeta`

#### Scenario: includeMeta omitted leaves Meta fields absent

- **GIVEN** `list()` is called without `includeMeta`
- **THEN** `artifacts`, `persistedStateMeta`, and `generatedMetadataMeta` are omitted from each entry

#### Scenario: Resolution errors still return an entry with title fallback

- **GIVEN** a spec whose summary or Meta resolution encounters an I/O error during indexing
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

- **GIVEN** an extra file exists in the spec directory but is not a valid artifact or
  adapter-owned metadata file
- **WHEN** `artifact(spec, "<extra-file>")` or `save(spec, artifact("<extra-file>"))`
  is called
- **THEN** the repository rejects the operation

#### Scenario: spec-lock is not exposed as a normal artifact

- **GIVEN** a persisted spec directory contains `spec-lock.json`
- **WHEN** `get()` or `list()` returns the spec metadata
- **THEN** `spec-lock.json` does not appear in `Spec.artifacts`
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

### Requirement: readMetadataSnapshot and writeMetadataSnapshot

#### Scenario: Missing metadata reports kind missing

- **WHEN** `readMetadataSnapshot(spec)` is called and no metadata is persisted for the spec
- **THEN** it returns `{ kind: 'missing', revision: null }`

#### Scenario: Invalid persisted metadata reports kind invalid

- **GIVEN** persisted metadata content that fails to parse
- **WHEN** `readMetadataSnapshot(spec)` is called
- **THEN** it returns `{ kind: 'invalid', revision, error: SpecMetadataParseError }`

#### Scenario: Present metadata reports kind present with revision

- **GIVEN** persisted metadata content that parses successfully
- **WHEN** `readMetadataSnapshot(spec)` is called
- **THEN** it returns `{ kind: 'present', metadata, revision }`

#### Scenario: writeMetadataSnapshot creates metadata when expectedRevision is null

- **GIVEN** no metadata is currently persisted for the spec
- **WHEN** `writeMetadataSnapshot(spec, metadata, { expectedRevision: null })` is called
- **THEN** the metadata is created
- **AND** the newly persisted `MetadataSnapshot` is returned

#### Scenario: writeMetadataSnapshot replaces metadata when expectedRevision matches

- **GIVEN** metadata persisted at a known revision
- **WHEN** `writeMetadataSnapshot(spec, metadata, { expectedRevision: <that revision> })` is called
- **THEN** the previously observed revision is replaced with the new complete `SpecMetadata` projection

#### Scenario: writeMetadataSnapshot rejects a stale expectedRevision

- **GIVEN** metadata persisted at a revision different from the caller's `expectedRevision`
- **WHEN** `writeMetadataSnapshot(spec, metadata, { expectedRevision: <stale revision> })` is called
- **THEN** the write is rejected with the repository's conflict error rather than silently rebasing

#### Scenario: writeMetadataSnapshot is not subject to the readOnly guard

- **GIVEN** a `SpecRepository` bound to a workspace with `readOnly` ownership
- **WHEN** `writeMetadataSnapshot(spec, metadata, options)` is called
- **THEN** the write proceeds without throwing `ReadOnlyWorkspaceError`

#### Scenario: readMetadataSnapshot never reports freshness

- **WHEN** `readMetadataSnapshot(spec)` is called
- **THEN** the returned `kind` is one of `missing`, `invalid`, or `present`
- **AND** the repository does not infer or encode `fresh` or `stale`

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

### Requirement: Aggregate persisted state, Meta observations, and specFingerprint

#### Scenario: persistedStateMeta hash remains stable when state is unchanged

- **GIVEN** a persisted spec with unchanged persisted lock state
- **WHEN** `persistedStateMeta(spec, { includeHash: true })` is called twice
- **THEN** both calls return the same `hash`

#### Scenario: persistedStateMeta hash changes when lock state is modified

- **GIVEN** a persisted spec with an initial `persistedStateMeta(..., { includeHash: true }).hash`
- **WHEN** the repository updates persisted dependencies or implementation state for
  that spec
- **THEN** the returned hash differs from the previous value

#### Scenario: persistedStateMeta without includeHash omits hash

- **GIVEN** a present persisted-state sidecar
- **WHEN** `persistedStateMeta(spec)` is called without `includeHash`
- **THEN** the result includes `lastModified` and does not include `hash`

#### Scenario: persistedStateMeta returns null when sidecar is absent

- **GIVEN** a lock-less spec
- **WHEN** `persistedStateMeta(spec)` is called
- **THEN** `null` is returned

#### Scenario: there is no persistedStateHash method on the port

- **WHEN** `SpecRepository` is examined
- **THEN** it does not declare `persistedStateHash` as a method
- **AND** callers that need the hash use `persistedStateMeta(spec, { includeHash: true })?.hash ?? null`

#### Scenario: specFingerprint orders artifact hashes by filename

- **GIVEN** a spec with multiple present artifacts whose contents are unchanged
- **WHEN** `specFingerprint` is computed twice
- **THEN** both calls return the same digest
- **AND** the digest incorporates per-artifact content hashes ordered by filename
  alphabetically plus `persistedStateMeta(..., { includeHash: true })?.hash` (or an absent sentinel)

#### Scenario: readPersistedState returns the complete persisted snapshot

- **GIVEN** a persisted spec with archived schema, dependsOn, implementation, and optional optimizations
- **WHEN** `readPersistedState(spec)` is called
- **THEN** it returns the complete `PersistedSpecStateSnapshot` including `schema`, `dependsOn`, `implementation`, `optimizations`, and the sidecar's `originalHash`
- **AND** application logic does not need `Spec.artifacts` or generic artifact reads to discover the sidecar

#### Scenario: readPersistedState returns null when no persisted state exists

- **GIVEN** a lock-less spec
- **WHEN** `readPersistedState(spec)` is called
- **THEN** `null` is returned

#### Scenario: writePersistedState creates state when expectedRevision is null

- **GIVEN** no persisted state exists for the spec
- **WHEN** `writePersistedState(spec, state, { expectedRevision: null })` is called
- **THEN** the complete persisted state is created
- **AND** the newly persisted `PersistedSpecStateSnapshot` is returned

#### Scenario: writePersistedState replaces state when expectedRevision matches

- **GIVEN** persisted state observed at a known revision
- **WHEN** `writePersistedState(spec, state, { expectedRevision: <that revision> })` is called
- **THEN** the complete persisted state is replaced atomically

#### Scenario: writePersistedState rejects a stale expectedRevision

- **GIVEN** persisted state at a revision different from the caller's `expectedRevision`
- **WHEN** `writePersistedState(spec, state, { expectedRevision: <stale revision> })` is called
- **THEN** the write is rejected with the repository's conflict error rather than silently rebasing

#### Scenario: artifactMeta returns lastModified without hash by default

- **GIVEN** a schema-declared artifact present on disk
- **WHEN** `artifactMeta(spec, filename)` is called without `includeHash`
- **THEN** it returns `{ lastModified, size }` without `hash`
- **AND** the artifact's content is not loaded or returned

#### Scenario: artifactMeta returns hash only when includeHash is true

- **GIVEN** a schema-declared artifact present on disk
- **WHEN** `artifactMeta(spec, filename, { includeHash: true })` is called
- **THEN** it returns `{ hash, lastModified }`
- **AND** the artifact's content is not returned to the caller beyond hashing

#### Scenario: generatedMetadataMeta observes the metadata cache file

- **GIVEN** a present or absent generated metadata cache file
- **WHEN** `generatedMetadataMeta(spec)` is called
- **THEN** it returns `GeneratedMetadataMeta` with `lastModified` when present, or `null` when absent
- **AND** it does not include `hash` unless `includeHash: true`

#### Scenario: artifactMeta exposes size without hashing

- **GIVEN** a schema-declared artifact present on disk
- **WHEN** `artifactMeta(spec, filename)` is called without options
- **THEN** the returned `ArtifactMeta` includes `lastModified` and `size`
- **AND** `hash` is absent unless `options.includeHash === true`

### Requirement: Filesystem-backed specs capability

#### Scenario: Filesystem-backed repository exposes canonical specsPath

- **GIVEN** a repository backed by filesystem directories
- **WHEN** the repository is constructed
- **THEN** it exposes an absolute `specsPath` identifying its canonical spec root

#### Scenario: Non-filesystem repository does not require specsPath

- **GIVEN** a repository implementation not backed by a directly addressable filesystem
- **WHEN** it implements the `SpecRepository` contract
- **THEN** it is not required to expose `specsPath`
