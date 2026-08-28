# Verification: FsChangeRepository

## Requirements

### Requirement: Validate options at construction

#### Scenario: Valid constructor options pass validation

- **GIVEN** a valid configuration object with `path` and context with `draftsPath` and `discardedPath`
- **AND** all directories exist on disk
- **WHEN** `FsChangeRepository` is constructed
- **THEN** it successfully instantiates without error

#### Scenario: Missing path in config throws error

- **GIVEN** a configuration object with a missing `path`
- **WHEN** `FsChangeRepository` is constructed
- **THEN** Zod validation throws a validation error identifying the missing configuration field

#### Scenario: Non-existent active changes directory throws error

- **GIVEN** a valid configuration object with `path`
- **AND** the active changes directory does not exist on disk
- **WHEN** `FsChangeRepository` is constructed
- **THEN** it throws a `StorageDirectoryNotFoundError` indicating the directory does not exist

### Requirement: Storage factory registration

#### Scenario: Factory builds repository correctly

- **GIVEN** a `ChangeStorageFactory` created by `createFsChangeStorageFactory()`
- **WHEN** `create` is invoked with valid repository context and filesystem options
- **THEN** it returns an instance of `FsChangeRepository` configured with those options

### Requirement: FsChangeIndexCache helper

#### Scenario: Active list delegates to changes bucket helper

- **GIVEN** active changes exist under the configured changes directory
- **WHEN** `FsChangeRepository.list()` is called
- **THEN** results are served from `{configPath}/tmp/fs-cache/changes/`
- **AND** items are `ActiveChangeListEntry` rows ordered by `createdAt` ascending

#### Scenario: Draft and discarded lists use separate bucket helpers

- **GIVEN** drafted and discarded changes exist on disk
- **WHEN** `listDrafts()` and `listDiscarded()` are called
- **THEN** drafts are served from `{configPath}/tmp/fs-cache/drafts/` ordered by `draftedAt` descending
- **AND** discarded rows are served from `{configPath}/tmp/fs-cache/discarded/` ordered by `discardedAt` descending

#### Scenario: Reindex methods rebuild bucket indexes

- **WHEN** `reindexActive()`, `reindexDrafts()`, or `reindexDiscarded()` is invoked
- **THEN** the corresponding bucket helper performs a full rebuild
- **AND** `reindex()` rebuilds all three buckets

### Requirement: Revision timestamp serialization and backward compatibility

#### Scenario: Persisting updatedAt to manifest

- **GIVEN** a `Change` with a specific `updatedAt`
- **WHEN** `save` is called on `FsChangeRepository`
- **THEN** `manifest.json` contains `updatedAt` matching `change.updatedAt.toISOString()`

#### Scenario: Deriving updatedAt for legacy manifest

- **GIVEN** a legacy `manifest.json` without an `updatedAt` property
- **WHEN** `FsChangeRepository` loads the change
- **THEN** `loadedChange.updatedAt` equals the maximum timestamp found in `createdAt` or `history` events

### Requirement: Index helper mutate and lock

#### Scenario: Index writes go through mutate under bucket lock

- **WHEN** a bucket helper upserts an entry or rebuilds its index
- **THEN** the write occurs inside `mutate(fn)` after acquiring the per-bucket lock
- **AND** the lock is released after `fn` completes or fails

#### Scenario: Concurrent mutators wait rather than fail

- **GIVEN** one mutator holds the bucket lock
- **WHEN** a second mutator attempts an index write on the same bucket
- **THEN** the second mutator waits until the lock is released
- **AND** it does not fail with lock contention

#### Scenario: Reads do not take the write lock

- **WHEN** `list()` or `count()` is called while a mutator is publishing
- **THEN** the read observes a complete prior or complete next snapshot
- **AND** it does not acquire the bucket write lock

### Requirement: Index freshness model

#### Scenario: Invalidated meta triggers rebuild

- **GIVEN** bucket meta has `isInvalidated: true`
- **WHEN** `list()` or `count()` is called
- **THEN** the helper rebuilds the index before serving results

#### Scenario: Manifest mtime mismatch triggers rebuild

- **GIVEN** a cached change row with `sourceMtime` older than the on-disk `manifest.json` mtime
- **WHEN** `list()` is called
- **THEN** the helper incrementally rebuilds that bucket

#### Scenario: Fresh stamps serve without time-based rebuild

- **GIVEN** bucket meta is not invalidated and on-disk manifest mtimes match cached `sourceMtime` values
- **AND** `generatedAt` is more than five minutes ago
- **WHEN** `list()` is called
- **THEN** the helper serves from the existing index without rebuilding solely because of index age

#### Scenario: invalidateCache marks all change buckets invalidated

- **WHEN** `FsChangeRepository.invalidateCache()` is called
- **THEN** active, drafts, and discarded bucket helpers are marked invalidated

### Requirement: Write-path index maintenance

#### Scenario: create upserts when projected list entry is new

- **WHEN** `create(change)` persists a new active change
- **THEN** the active list-index row is inserted (or the bucket invalidated) accordingly

#### Scenario: mutate persist upserts when projected list entry changes

- **GIVEN** an internal manifest write from `mutate` changes history-derived list fields
- **WHEN** the write completes
- **THEN** the bucket helper upserts the projected row

#### Scenario: mutate persist skips index write when projection unchanged

- **GIVEN** an internal manifest write whose projected list entry equals the cached row
- **WHEN** the write completes
- **THEN** no list-index file write occurs

#### Scenario: Move between buckets updates both indexes

- **WHEN** a change moves between `changes` ↔ `drafts` ↔ `discarded` during `mutate` / `mutateDraft`
- **THEN** both affected bucket indexes are updated or invalidated

#### Scenario: saveArtifact does not update list indexes

- **WHEN** `saveArtifact` writes artifact file content inside a mutate window
- **THEN** list-index files are not updated for that write alone

### Requirement: create delegates to internal first persist

#### Scenario: create refuses colliding names across buckets

- **GIVEN** a change name already present under `drafts/`
- **WHEN** `create(change)` is called with that name
- **THEN** the operation fails without creating a second directory

### Requirement: mutate and mutateDraft reconcile after persist

#### Scenario: mutate .change matches a following get after in-callback file write

- **GIVEN** `mutate` writes different artifact bytes via `saveArtifact` then finishes
- **WHEN** the caller inspects `.change` and then calls `get(name)`
- **THEN** artifact/file statuses on `.change` match the `get` result regarding drift classification

### Requirement: saveArtifact requires mutate window and does not touch Change

#### Scenario: Outside mutate window saveArtifact does not write

- **GIVEN** no mutation-in-progress entry for the change name
- **WHEN** `saveArtifact` is invoked
- **THEN** no artifact file is written
- **AND** the call is rejected

#### Scenario: Inside mutate window bytes are written without setFileStatus

- **GIVEN** an active `mutate` window and a complete tracked file
- **WHEN** `saveArtifact` overwrites the file
- **THEN** disk content changes
- **AND** the supplied `Change` object's file status is unchanged by `saveArtifact`

### Requirement: Filesystem exploration persistence

#### Scenario: Repository materializes optional initial exploration

- **GIVEN** a new change and non-empty `explorationContent`
- **WHEN** `FsChangeRepository.create` succeeds
- **THEN** `.specd-exploration.md` contains that content
- **AND** `get` stats but does not read the file

#### Scenario: Exploration failure leaves no partial change

- **GIVEN** exploration persistence fails during first create
- **WHEN** `FsChangeRepository.create` rejects
- **THEN** the newly created directory is cleaned up
- **AND** `get(name)` returns `null`
