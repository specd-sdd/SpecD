# Verification: FsSpecRepository

## Requirements

### Requirement: Validate options at construction

#### Scenario: Valid constructor options pass validation

- **GIVEN** a valid configuration object with `path` and `metadataPath`
- **AND** the spec and metadata directories exist on disk
- **WHEN** `FsSpecRepository` is constructed with valid context
- **THEN** it successfully instantiates without error

#### Scenario: Missing path in options throws error

- **GIVEN** a configuration object with a missing `path`
- **WHEN** `FsSpecRepository` is constructed
- **THEN** Zod validation throws a validation error identifying the missing configuration field

#### Scenario: Non-existent spec directory throws error

- **GIVEN** a valid configuration object with `path`
- **AND** the spec directory does not exist on disk
- **WHEN** `FsSpecRepository` is constructed
- **THEN** it throws a `StorageDirectoryNotFoundError` indicating the directory does not exist

### Requirement: Storage factory registration

#### Scenario: Factory builds repository correctly

- **GIVEN** a `SpecStorageFactory` created by `createFsSpecStorageFactory()`
- **WHEN** `create` is invoked with valid repository context and filesystem options
- **THEN** it returns an instance of `FsSpecRepository` configured with those options

### Requirement: FsSpecIndexCache helper

#### Scenario: list delegates to workspace fs-cache bucket

- **GIVEN** specs exist under a workspace spec tree
- **WHEN** `FsSpecRepository.list()` is called
- **THEN** results are served from `{configPath}/tmp/fs-cache/specs/<workspace>/`
- **AND** items are ordered by capability path ascending

#### Scenario: count reads totalCount from spec bucket meta

- **GIVEN** the spec bucket meta reports `totalCount: 12`
- **WHEN** `FsSpecRepository.count()` is called with a fresh index
- **THEN** the returned count is `12`

#### Scenario: reindex rebuilds workspace spec bucket

- **WHEN** `FsSpecRepository.reindex()` is invoked
- **THEN** the workspace spec bucket under `fs-cache/specs/<workspace>/` is fully rebuilt from disk

#### Scenario: invalidateCache marks spec bucket invalidated

- **WHEN** `FsSpecRepository.invalidateCache()` is called
- **THEN** the workspace spec index helper is marked invalidated

#### Scenario: Fresh sourceFiles serve without time-based rebuild

- **GIVEN** spec bucket meta is not invalidated and on-disk file mtimes match cached `sourceFiles`
- **AND** `generatedAt` is more than five minutes ago
- **WHEN** `list()` is called
- **THEN** the helper serves from the existing index without rebuilding solely because of index age

### Requirement: SpecListEntry materialization in index

#### Scenario: Index stores full CLI-usable SpecListEntry payload

- **GIVEN** a spec with metadata title and resolvable summary/status fields
- **WHEN** the spec bucket index is built or refreshed
- **THEN** the cached row materializes `workspace`, `path`, `title`, `summary`, and `metadataStatus` according to port rules

#### Scenario: Title resolution errors fall back to path segment

- **GIVEN** a spec whose metadata title resolution throws or yields empty trimmed text
- **WHEN** the index row is materialized
- **THEN** the entry still appears with `title` equal to the last path segment

#### Scenario: include flags project cached fields without extra reads

- **GIVEN** a cached row with stored summary and metadataStatus
- **WHEN** `list({ includeSummary: false, includeMetadataStatus: false })` is called
- **THEN** returned items omit `summary` and `metadataStatus`
- **AND** no supplementary metadata or spec.md reads occur at list time

### Requirement: Spec stamp population on get

#### Scenario: get populates artifact and sidecar stamps without content reads

- **GIVEN** a spec directory with `spec.md`, a lock sidecar, and generated metadata
- **WHEN** `FsSpecRepository.get()` is called
- **THEN** `Spec.artifacts` includes `spec.md` with a `lastModified` stamp
- **AND** `persistedStateStamp.present` and `generatedMetadataStamp.present` are `true`
- **AND** artifact file contents are not read to build those stamps

#### Scenario: get exposes derived filenames for artifact presence

- **GIVEN** a spec with only `spec.md` present
- **WHEN** `get()` returns the `Spec`
- **THEN** `Spec.filenames` includes `spec.md`
- **AND** `Spec.hasArtifact('spec.md')` is `true`

#### Scenario: get stamps include byte-size from the same stat

- **GIVEN** a spec directory with `spec.md` and sidecar files
- **WHEN** `FsSpecRepository.get()` is called
- **THEN** every `SpecArtifactEntry` includes `size` equal to the file byte length
- **AND** `lastModified` and `size` come from the same single `stat` observation
- **AND** no artifact content is read to build the stamps

### Requirement: Aggregate persisted-state operations and canonical lock serialization

#### Scenario: readPersistedState returns null for a lock-less spec without a placeholder schema

- **GIVEN** a spec with no `spec-lock.json`
- **WHEN** `readPersistedState(spec)` is called
- **THEN** it returns `null`
- **AND** it does not construct a placeholder lock with `schema: { name: 'unknown', version: 0 }`

#### Scenario: writePersistedState creates the lock via the canonical serializer

- **GIVEN** no `spec-lock.json` exists for the spec
- **WHEN** `writePersistedState(spec, state, { expectedRevision: null })` is called
- **THEN** the canonical serializer validates the complete `PersistedSpecState` and writes stable, deterministic JSON through the existing atomic file writer

#### Scenario: writePersistedState rejects a stale expectedRevision

- **GIVEN** a `spec-lock.json` exists with a known hash
- **WHEN** `writePersistedState(spec, state, { expectedRevision: <a different hash> })` is called
- **THEN** the write fails with the repository's conflict error

#### Scenario: writePersistedState reuses the same serializer as staged publish

- **WHEN** `writePersistedState` and staged `publish()` both write `spec-lock.json`
- **THEN** both go through the same canonical serializer/writer, not two independent implementations

#### Scenario: readPersistedState and writePersistedState enforce the readOnly guard like save()

- **GIVEN** a `FsSpecRepository` bound to a workspace with `readOnly` ownership
- **WHEN** `readPersistedState(spec)` or `writePersistedState(spec, state, options)` is called
- **THEN** `ReadOnlyWorkspaceError` is thrown before any I/O, consistent with `save()`

### Requirement: Metadata snapshot persistence

#### Scenario: readMetadataSnapshot reports missing, invalid, and present persistence kinds only

- **GIVEN** a metadata file that does not exist, one that fails to parse, and one that parses successfully
- **WHEN** `readMetadataSnapshot(spec)` is called for each
- **THEN** it returns `{ kind: 'missing', revision: null }`, `{ kind: 'invalid', revision, error }`, and `{ kind: 'present', metadata, revision }` respectively
- **AND** `FsSpecRepository` does not compute or return freshness

#### Scenario: revision may be the raw-byte SHA-256 of serialized metadata JSON

- **WHEN** metadata is written
- **THEN** `FsSpecRepository` may use the raw-byte SHA-256 of the serialized metadata JSON as `revision`

#### Scenario: writeMetadataSnapshot rejects a stale expectedRevision

- **GIVEN** metadata persisted at a known revision
- **WHEN** `writeMetadataSnapshot(spec, metadata, { expectedRevision: <a different revision> })` is called
- **THEN** the write fails with the repository's conflict error

#### Scenario: writeMetadataSnapshot is exempt from the readOnly ownership guard

- **GIVEN** a `FsSpecRepository` bound to a workspace with `readOnly` ownership
- **WHEN** `writeMetadataSnapshot(spec, metadata, options)` is called
- **THEN** it does not throw `ReadOnlyWorkspaceError`

#### Scenario: artifactMeta reuses the existing stat/hash path

- **WHEN** `artifactMeta(spec, filename, { includeHash: true })` is called
- **THEN** it reuses the same stat/hash path used elsewhere on this adapter rather than a second hashing routine
- **AND** without `includeHash` it returns `lastModified` and `size`

#### Scenario: artifactMeta exposes size from stat without hashing

- **GIVEN** an existing `spec.md` artifact
- **WHEN** `artifactMeta(spec, 'spec.md')` is called without options
- **THEN** it returns `lastModified` and `size`
- **AND** it does not include `hash`
- **WHEN** `artifactMeta(spec, 'spec.md', { includeHash: true })` is called
- **THEN** it additionally returns the SHA-256 content `hash`

### Requirement: Meta observations and specFingerprint on FS

#### Scenario: persistedStateMeta hashes lock bytes when includeHash is set

- **GIVEN** a lock sidecar with known content
- **WHEN** `persistedStateMeta(spec, { includeHash: true })` is called
- **THEN** the digest equals SHA-256 of those bytes

#### Scenario: persistedStateMeta omits hash without includeHash

- **GIVEN** a present lock sidecar
- **WHEN** `persistedStateMeta(spec)` is called without `includeHash`
- **THEN** the result includes `lastModified` and does not include `hash`

#### Scenario: there is no persistedStateHash method on FsSpecRepository

- **WHEN** `FsSpecRepository` is examined
- **THEN** it does not expose `persistedStateHash`

#### Scenario: specFingerprint excludes generated metadata

- **GIVEN** a spec whose artifact contents and lock state are unchanged while
  `metadata.json` content changes
- **WHEN** `specFingerprint(spec)` is computed before and after the metadata change
- **THEN** both digests are equal

#### Scenario: persistedStateMeta hash uses the canonical serializer's exact bytes

- **WHEN** `persistedStateMeta(spec, { includeHash: true })` is computed
- **THEN** it is the SHA-256 of the exact bytes written by the canonical lock serializer, not a second independently implemented serialization path

#### Scenario: includeMeta projects sourceFiles without extra I/O or hash

- **GIVEN** a fresh list index whose `sourceFiles` already carry artifact and sidecar mtimes
- **WHEN** `list(undefined, { includeMeta: true })` is called
- **THEN** Meta fields are projected from those stamps without additional filesystem reads
- **AND** no Meta field includes `hash`

#### Scenario: FsSpecRepository does not own the validate-specs cache bucket

- **WHEN** `FsSpecRepository` operates
- **THEN** it does not read or write `{configPath}/tmp/fs-cache/validate-specs/<workspace>/` rows
- **AND** that bucket remains owned by the `ValidationResultCache` filesystem adapter
