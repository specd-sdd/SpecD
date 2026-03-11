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

- **WHEN** an artifact file is modified after `ValidateArtifacts` ran and stored its hash
- **THEN** `FsChangeRepository` recomputes the hash on next load and returns `in-progress`

#### Scenario: Artifact file missing

- **WHEN** an artifact file does not exist on disk and `validatedHash` is `null`
- **THEN** its status is `missing`

#### Scenario: Artifact skipped — sentinel in manifest

- **GIVEN** an `optional: true` artifact with `validatedHash: "__skipped__"` in the manifest and no file on disk
- **WHEN** `FsChangeRepository` loads the change
- **THEN** its status is `skipped`

#### Scenario: validatedHash cleared on rollback — skipped becomes missing

- **GIVEN** an artifact with `validatedHash: "__skipped__"` in the manifest
- **WHEN** an `invalidated` event is appended and all `validatedHash` values are cleared
- **THEN** its status becomes `missing` — the sentinel is gone and there is no file

#### Scenario: validatedHash cleared on rollback — complete becomes in-progress

- **GIVEN** an artifact with `validatedHash: "sha256:abc"` and its file still present
- **WHEN** all `validatedHash` values are cleared
- **THEN** its status becomes `in-progress` — file present but no valid hash

### Requirement: Artifact dependency cascade

#### Scenario: Upstream artifact edited

- **WHEN** artifact A is `complete` but its upstream dependency B is edited (becomes `in-progress`)
- **THEN** `Change.effectiveStatus('a')` returns `in-progress`

#### Scenario: Upstream artifact skipped — downstream unblocked

- **GIVEN** artifact A requires optional artifact B, and B has `validatedHash: "__skipped__"`
- **WHEN** `Change.effectiveStatus('a')` is called
- **THEN** it returns A's own derived status — B's `skipped` state does not block A

### Requirement: ValidateArtifacts is the sole path to `complete`

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

### Requirement: Change manifest format

#### Scenario: Manifest structure matches specification

- **GIVEN** an active change with history events
- **WHEN** the change is persisted to disk
- **THEN** `manifest.json` contains the fields and structure defined in the change-manifest spec

> Full scenarios are in [`specs/core/change-manifest/verify.md`](../change-manifest/verify.md).
