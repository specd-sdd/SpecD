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

#### Scenario: Multiple changes listed

- **WHEN** `list()` is called with two changes created at different times
- **THEN** the older change appears first in the result

### Requirement: Artifact status derivation

#### Scenario: Artifact edited after validation

- **WHEN** an artifact file is modified after `ValidateSpec` ran and stored its hash
- **THEN** `FsChangeRepository` recomputes the hash on next load and returns `in-progress`

#### Scenario: Artifact file missing

- **WHEN** an artifact file does not exist on disk
- **THEN** its status is `missing`

### Requirement: Artifact dependency cascade

#### Scenario: Upstream artifact edited

- **WHEN** artifact A is `complete` but its upstream dependency B is edited (becomes `in-progress`)
- **THEN** `Change.effectiveStatus('a')` returns `in-progress`

### Requirement: ValidateSpec is the sole path to `complete`

#### Scenario: Attempt to mark complete outside ValidateSpec

- **WHEN** any code other than `ValidateSpec` calls `artifact.markComplete(hash)`
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

### Requirement: Archive index

#### Scenario: Change archived

- **WHEN** `archive(change)` is called
- **THEN** one line is appended to `index.jsonl` — existing lines are not modified

#### Scenario: Change not in index

- **WHEN** `get(name)` scans `index.jsonl` and finds no match
- **THEN** it falls back to globbing `**/*-<name>` and appends the recovered entry to the index

#### Scenario: reindex called

- **WHEN** `specd storage reindex` is run after manual filesystem changes
- **THEN** `index.jsonl` is rewritten in chronological order based on each manifest's `archivedAt`

### Requirement: Archive pattern date variables are zero-padded

#### Scenario: January archive

- **WHEN** a change is archived on January 5th
- **THEN** `{{month}}` resolves to `"01"` and `{{day}}` resolves to `"05"`

### Requirement: Schema version recorded in change manifest

#### Scenario: Schema unchanged

- **WHEN** a change is loaded and its manifest schema matches the active schema name and version
- **THEN** no warning is emitted

#### Scenario: Schema version bumped

- **WHEN** a change is loaded and the active schema has a higher version than recorded in the manifest
- **THEN** specd emits a warning indicating the schema has changed since the change was created and the user should review whether the change artifacts are still compatible

#### Scenario: Schema name changed

- **WHEN** a change is loaded and the active schema name differs from the one recorded in the manifest
- **THEN** specd emits a warning indicating the change was created under a different schema

#### Scenario: Archiving with schema mismatch

- **WHEN** `specd archive` is run on a change with a schema version mismatch
- **THEN** the warning is shown and the user is asked to confirm before proceeding; archiving is not blocked

### Requirement: Change manifest format

#### Scenario: Manifest written on creation

- **WHEN** a new change `add-auth-flow` is created
- **THEN** a `manifest.json` is written containing `name`, `createdAt`, `schema`, `workspaces`, `specIds`, `artifacts` (empty or schema-defined), and a `history` array with a single `created` event

#### Scenario: No state field in manifest

- **WHEN** a manifest is read from disk
- **THEN** there is no top-level `state` field; the current state is derived by reading the `to` field of the last `transitioned` event in `history`

#### Scenario: History events appended atomically

- **WHEN** a state transition occurs
- **THEN** the new `transitioned` event is appended to `history` and the entire manifest is written atomically (temp file + rename); no partial writes are visible

#### Scenario: History never shrinks

- **WHEN** a manifest is loaded, modified (e.g. workspace added), and saved
- **THEN** the `history` array on disk has more entries than before — no existing events are missing or reordered

#### Scenario: Artifact validated hash stored

- **WHEN** `ValidateSpec` marks an artifact complete with hash `sha256:abc`
- **THEN** the manifest's `artifacts` entry for that type has `validatedHash: "sha256:abc"` and no `status` field

#### Scenario: validatedHash is null for unvalidated artifact

- **WHEN** an artifact exists in `artifacts` but has never been validated
- **THEN** its `validatedHash` is `null` in the manifest
