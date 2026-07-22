# Verification: Storage

## Requirements

### Requirement: Change directory naming

#### Scenario: Change created

- **WHEN** a new change named `add-auth` is created at `2024-03-15T10:30:00`
- **THEN** its directory is named `20240315-103000-add-auth`

#### Scenario: Change resolved by name

- **WHEN** `FsChangeRepository.get('add-auth')` is called
- **THEN** it resolves the directory by globbing `*-add-auth`, not by storing the full path

### Requirement: Change directory listing order

#### Scenario: Multiple changes listed in createdAt order

- **GIVEN** two active changes with `createdAt` timestamps where `alpha` is older than `beta`
- **WHEN** `ChangeRepository.list()` is called through the fs adapter
- **THEN** `alpha` appears before `beta` in canonical sort order
- **AND** the order is produced by the active-changes index helper under `{configPath}/tmp/fs-cache/changes/` without re-sorting at list time

#### Scenario: List order matches index helper not directory walk

- **GIVEN** change directories on disk whose lexical order differs from `createdAt` ascending
- **WHEN** `ChangeRepository.list()` is called
- **THEN** returned items follow `createdAt` ascending from the fs-cache index
- **AND** the adapter does not sort directory entries at list time

### Requirement: Artifact status derivation

#### Scenario: Valid hash matches file content

- **GIVEN** an artifact was validated with content `some content` (hash stored as `validatedHash`)
- **WHEN** the file is loaded
- **THEN** its status becomes `complete`

#### Scenario: Hash mismatch triggers in-progress status

- **GIVEN** an artifact was validated with content `some content`
- **WHEN** the file is edited to `different content`
- **THEN** its status becomes `in-progress`

#### Scenario: Missing validatedHash defaults to in-progress

- **GIVEN** a file present on disk
- **WHEN** all `validatedHash` values are cleared
- **THEN** its status becomes `in-progress` — file present but no valid hash

#### Scenario: preHashCleanup normalized edit preserves complete status

- **GIVEN** an artifact type with `preHashCleanup: [{ pattern: "- \\[x\\]", replacement: "- [ ]" }]`
- **AND** the artifact was validated with content `- [ ] task one` (cleaned hash stored as `validatedHash`)
- **WHEN** the file is edited to `- [x] task one`
- **THEN** `FsChangeRepository` applies the cleanup before hashing, producing the same hash
- **AND** the derived status is `complete`

#### Scenario: Non-normalized edit still triggers in-progress

- **GIVEN** an artifact type with `preHashCleanup: [{ pattern: "- \\[x\\]", replacement: "- [ ]" }]`
- **AND** the artifact was validated with content `- [ ] task one`
- **WHEN** the file is edited to `- [ ] task one\n- [ ] task two`
- **THEN** the cleaned hash differs from `validatedHash`
- **AND** the derived status is `in-progress`

#### Scenario: No preHashCleanup rules hashes raw content

- **GIVEN** an artifact type with no `preHashCleanup` rules
- **AND** the artifact was validated with content `some content`
- **WHEN** the file content is unchanged
- **THEN** `sha256(rawContent) === validatedHash`
- **AND** the derived status is `complete`

#### Scenario: Status derivation bypassed when repository is uninitialized

- **GIVEN** a repository initialized without artifact types (`artifactTypes.length === 0`)
- **WHEN** a change is loaded
- **THEN** drift detection and status derivation are bypassed
- **AND** files do not report drift or trigger auto-invalidations

### Requirement: Artifact dependency cascade

#### Scenario: Upstream artifact edited

- **WHEN** artifact A is `complete` but its upstream dependency B is edited (becomes `in-progress`)
- **THEN** `Change.effectiveStatus('a')` returns `in-progress`

#### Scenario: Upstream artifact skipped — downstream unblocked

- **GIVEN** artifact A requires optional artifact B, and B has `validatedHash: "__skipped__"`
- **WHEN** `Change.effectiveStatus('a')` is called
- **THEN** it returns A's own derived status — B's `skipped` state does not block A

### Requirement: ValidateArtifacts is the sole path to complete

#### Scenario: Attempt to mark complete outside ValidateArtifacts

- **WHEN** any code other than `ValidateArtifacts` calls `artifact.markComplete(hash)`
- **THEN** it violates this requirement — the call must be removed

#### Scenario: Attempt to mark skipped outside skip use case

- **WHEN** any code other than the skip use case sets `validatedHash` to `"__skipped__"`
- **THEN** it violates this requirement — the call must be removed

### Requirement: Archive pattern configuration

#### Scenario: Custom archive pattern

- **WHEN** `specd.yaml` sets `storage.archive.pattern: "{{year}}/{{change.archivedName}}"`
- **THEN** archived changes are placed under `<archive-root>/2024/<archivedName>/`

#### Scenario: Default archive pattern

- **WHEN** no pattern is configured in `specd.yaml`
- **THEN** archives use `{{change.archivedName}}` as the directory name

### Requirement: Scope excluded from archive pattern

#### Scenario: Pattern uses scope variable

- **WHEN** `storage.archive.pattern` contains `{{change.scope}}`
- **THEN** `FsArchiveRepository` must reject it as an unsupported variable

### Requirement: Workspace excluded from archive pattern

#### Scenario: Pattern uses workspace variable

- **WHEN** `storage.archive.pattern` contains `{{change.workspace}}`
- **THEN** `FsArchiveRepository` must reject it as an unsupported variable, throwing `UnsupportedPatternError` at construction time — the same as `{{change.scope}}`

#### Scenario: Normative catalog omits any workspace token

- **GIVEN** the normative supported-variable catalog for `storage.archive.pattern`
- **WHEN** the catalog is inspected
- **THEN** it contains only `{{year}}`, `{{month}}`, `{{day}}`, `{{change.name}}`, `{{change.archivedName}}`
- **AND** it contains no per-change workspace token

### Requirement: Archive index

#### Scenario: Change archived upserts fs-cache index entry

- **WHEN** `archive(change)` completes successfully
- **THEN** an `ArchiveListEntry` row is upserted in `{configPath}/tmp/fs-cache/archive/.specd-index.jsonl`
- **AND** no root-local `.specd-index.jsonl` is written at the archive storage root

#### Scenario: Archive list serves from fs-cache index

- **GIVEN** archived changes exist on disk and the fs-cache archive index is fresh
- **WHEN** `ArchiveRepository.list()` is called
- **THEN** entries are returned from `{configPath}/tmp/fs-cache/archive/` without reading every manifest
- **AND** results are ordered by `archivedAt` descending (newest first)

#### Scenario: Archive reindex rebuilds fs-cache index

- **WHEN** `ArchiveRepository.reindex()` is invoked after manual filesystem changes
- **THEN** `{configPath}/tmp/fs-cache/archive/.specd-index.jsonl` is rebuilt from archived manifests
- **AND** `meta.totalCount` reflects the full archive count

#### Scenario: Legacy root index migrated on rebuild

- **GIVEN** legacy `.specd-index.jsonl` exists at the archive storage root
- **WHEN** `ArchiveRepository.reindex()` or the first full rebuild materializes `fs-cache/archive/`
- **THEN** the legacy root-local index files are deleted (ENOENT ignored)
- **AND** listing uses only the fs-cache index thereafter

#### Scenario: get does not depend on root-local index

- **GIVEN** no root-local archive index file exists
- **WHEN** `ArchiveRepository.get(name)` is called for an archived change
- **THEN** the change is resolved without requiring a root-local JSONL index

### Requirement: Archive runtime ignore hygiene

#### Scenario: Runtime archive behavior ensures staging is ignored

- **GIVEN** the archive root exists without an archive-local `.gitignore`
- **WHEN** `FsArchiveRepository` performs archive creation or index rebuild that touches the archive root
- **THEN** the archive root `.gitignore` is created or updated
- **AND** it contains an entry for `.staging`
- **AND** it does not require entries for `.specd-index.jsonl` or `.specd-index-meta.json`

#### Scenario: Shared helper preserves staging ignore across runtime paths

- **WHEN** archive creation, `reindex()`, or staged commit paths prepare the archive directory
- **THEN** each path preserves the archive-local ignore entry for `.staging`

### Requirement: Named storage factories

#### Scenario: Repository capability selects a factory by adapter name

- **GIVEN** registered storage factories for `fs` and `git`
- **WHEN** kernel composition resolves a workspace configured with `adapter: git`
- **THEN** the `git` storage factory is used to create that repository-backed capability
- **AND** the `fs` factory remains available for workspaces still configured with `fs`

#### Scenario: Workspace-specific VCS handling stays inside the selected factory

- **GIVEN** a storage mode whose repository creation needs VCS detection or null-VCS fallback
- **WHEN** the named storage factory is invoked
- **THEN** the factory owns that VCS or null-VCS decision internally
- **AND** unrelated kernel composition paths do not hardcode storage-specific VCS handling

### Requirement: Archive pattern date variables are zero-padded

#### Scenario: January archive

- **WHEN** a change is archived on January 5th
- **THEN** `{{month}}` resolves to `"01"` and `{{day}}` resolves to `"05"`

### Requirement: Change manifest format

#### Scenario: Manifest structure matches specification

- **GIVEN** an active change with history events
- **WHEN** the change is persisted to disk
- **THEN** `manifest.json` contains the fields and structure defined in the change-manifest spec

> Full scenarios are in [`core:change-manifest`](../change-manifest/verify.md).

### Requirement: Repository path confinement

#### Scenario: Change storage rejects paths outside the change root

- **WHEN** a change-storage operation derives a path outside its configured root
- **THEN** the operation is rejected

#### Scenario: Spec storage rejects untracked or escaping artifact paths

- **WHEN** a spec-storage operation targets an artifact path outside the permitted artifact set or outside the spec root
- **THEN** the operation is rejected

#### Scenario: Archive storage rejects archive paths outside the archive root

- **WHEN** an archive-storage operation derives a path outside the configured archive root
- **THEN** the operation is rejected

### Requirement: Staged archive persistence

#### Scenario: Failure before staged commit leaves no partially visible archive result

- **GIVEN** fs-backed archive persistence has prepared some intermediate data
- **AND** a failure occurs before commit
- **WHEN** the archive attempt aborts
- **THEN** the permanent archive view does not expose a partially committed result

#### Scenario: Permanent archive view changes only after successful commit

- **WHEN** fs-backed archive persistence completes successfully
- **THEN** the permanent archive view changes only after the staged commit succeeds

### Requirement: Storage debug logging

#### Scenario: Debug logs cover storage diagnostics

- **WHEN** debug logging is enabled for fs-backed storage adapters
- **THEN** logs include tracked artifact resolution, path-confinement rejections, staged archive commit progress, and archive failure diagnostics

### Requirement: Change locks directory placement

#### Scenario: Locks derived from configPath field

- **GIVEN** `ChangeRepositoryConfig` includes `configPath: /project/.specd/config`
- **WHEN** a change lock is acquired
- **THEN** the lock file is created under `/project/.specd/config/tmp/change-locks/`

#### Scenario: Default configPath

- **GIVEN** `specd.yaml` without explicit `configPath`
- **AND** config loader defaults to `.specd/config`
- **WHEN** `FsChangeRepository` is composed
- **THEN** locks resolve to `{configPath}/tmp/change-locks`

#### Scenario: Locks separated from changes storage

- **GIVEN** `storage.changes.path: .specd/changes`
- **AND** `configPath: .specd/config` (default)
- **WHEN** locks are acquired
- **THEN** lock files are under `.specd/config/tmp/change-locks/`
- **AND** not under `.specd/changes/`

### Requirement: Filesystem list index cache layout

#### Scenario: List indexes stored under fs-cache buckets

- **GIVEN** an fs-backed project with active changes, drafts, discarded changes, archive entries, and workspace specs
- **WHEN** list/count operations populate derived indexes
- **THEN** index files exist under `{configPath}/tmp/fs-cache/` in bucket directories `changes/`, `drafts/`, `discarded/`, `archive/`, and `specs/<workspace>/`
- **AND** each bucket contains `.specd-index.jsonl` and `.specd-index-meta.json`

#### Scenario: Index meta exposes totalCount for count operations

- **GIVEN** a populated fs-cache bucket with `totalCount: 5` in meta
- **WHEN** the corresponding repository `count()` is called with a fresh index
- **THEN** the returned count is `5` without materializing full list entries

### Requirement: configPath tmp gitignore

#### Scenario: Runtime ensures tmp gitignore contents

- **GIVEN** `{configPath}/tmp/` is first used by an fs-backed repository
- **WHEN** runtime tmp hygiene runs
- **THEN** `{configPath}/tmp/.gitignore` exists with contents ignoring `*` and un-ignoring `!.gitignore`

#### Scenario: Fs-cache artifacts remain gitignored

- **GIVEN** `{configPath}/tmp/.gitignore` is present
- **WHEN** `{configPath}/tmp/fs-cache/` indexes are generated
- **THEN** those cache files are ignored by git via the tmp gitignore rule
