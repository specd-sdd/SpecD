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

### Requirement: persistedStateHash and specFingerprint on FS

#### Scenario: persistedStateHash hashes lock bytes

- **GIVEN** a lock sidecar with known content
- **WHEN** `persistedStateHash(spec)` is called
- **THEN** the digest equals SHA-256 of those bytes

#### Scenario: specFingerprint excludes generated metadata

- **GIVEN** a spec whose artifact contents and lock state are unchanged while
  `metadata.json` content changes
- **WHEN** `specFingerprint(spec)` is computed before and after the metadata change
- **THEN** both digests are equal
