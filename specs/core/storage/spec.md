# Storage

## Overview

specd's storage layer is defined by port interfaces in `@specd/core`. All storage behavior is adapter-specific; the domain and application layers have no knowledge of where data lives. The v1 implementation ships one adapter for all storage ports: `fs` (local filesystem).

## Requirements

### Requirement: Change directory naming

Active change directories must use the format `YYYYMMDD-HHmmss-<name>`, where the timestamp is the moment the change was created. The prefix must be a filesystem convention only — it must not appear in the domain model, the change manifest, or any CLI argument. `FsChangeRepository` must resolve a change by name using a glob pattern `*-<name>`.

#### Scenario: Change created

- **WHEN** a new change named `add-auth` is created at `2024-03-15T10:30:00`
- **THEN** its directory is named `20240315-103000-add-auth`

#### Scenario: Change resolved by name

- **WHEN** `FsChangeRepository.get('add-auth')` is called
- **THEN** it resolves the directory by globbing `*-add-auth`, not by storing the full path

### Requirement: Change directory listing order

`ChangeRepository.list()` must return changes in creation order (oldest first). With the `fs` adapter, this is achieved by sorting directory entries by name, which is chronological given the timestamp prefix.

#### Scenario: Multiple changes listed

- **WHEN** `list()` is called with two changes created at different times
- **THEN** the older change appears first in the result

### Requirement: Artifact status derivation

Artifact status (`missing`, `in-progress`, `complete`) must be derived at load time — it must not be stored directly in the manifest. The manifest stores only `validatedHash` per artifact. `FsChangeRepository` must compute status by comparing the current SHA-256 hash of each artifact file against the stored `validatedHash`.

#### Scenario: Artifact edited after validation

- **WHEN** an artifact file is modified after `ValidateSpec` ran and stored its hash
- **THEN** `FsChangeRepository` recomputes the hash on next load and returns `in-progress`

#### Scenario: Artifact file missing

- **WHEN** an artifact file does not exist on disk
- **THEN** its status is `missing`

### Requirement: Artifact dependency cascade

`Change.effectiveStatus(type)` must cascade through the artifact dependency graph. An artifact whose own hash matches its `validatedHash` must still be reported as `in-progress` if any artifact in its `requires` chain is not `complete`.

#### Scenario: Upstream artifact edited

- **WHEN** artifact A is `complete` but its upstream dependency B is edited (becomes `in-progress`)
- **THEN** `Change.effectiveStatus('a')` returns `in-progress`

### Requirement: ValidateSpec is the sole path to `complete`

`Artifact.markComplete(hash)` must only be called by the `ValidateSpec` use case. No other use case, adapter, or external code path may mark an artifact as complete.

#### Scenario: Attempt to mark complete outside ValidateSpec

- **WHEN** any code other than `ValidateSpec` calls `artifact.markComplete(hash)`
- **THEN** it violates this requirement — the call must be removed

### Requirement: Archive pattern configuration

The `fs` archive adapter must support a configurable `pattern` field in `specd.yaml` under `storage.archive.pattern`. The pattern controls the directory structure within the archive root. Supported variables: `{{year}}`, `{{month}}`, `{{day}}`, `{{change.name}}`, `{{change.archivedName}}`. The default pattern must be `{{change.archivedName}}`.

#### Scenario: Custom archive pattern

- **WHEN** `specd.yaml` sets `storage.archive.pattern: "{{year}}/{{change.archivedName}}"`
- **THEN** archived changes are placed under `<archive-root>/2024/<archivedName>/`

#### Scenario: Default archive pattern

- **WHEN** no pattern is configured in `specd.yaml`
- **THEN** archives use `{{change.archivedName}}` as the directory name

### Requirement: Scope excluded from archive pattern

`{{change.scope}}` must not be a supported archive pattern variable. Scope paths use `/` as a segment separator, which produces ambiguous slugs when normalized for use in directory names.

#### Scenario: Pattern uses scope variable

- **WHEN** `storage.archive.pattern` contains `{{change.scope}}`
- **THEN** `FsArchiveRepository` must reject it as an unsupported variable

### Requirement: Archive index

`FsArchiveRepository` must maintain an `index.jsonl` at the archive root. Each line must be a JSON object with `name` and `path` fields. The file must be kept in chronological order (oldest first, newest last) so that git diffs only show lines added at the bottom or lines removed — never reorderings. `archive(change)` must append one line at the end (O(1)). `get(name)` must scan the file from the end without loading it fully into memory; if not found, it must fall back to a recursive glob `**/*-<name>` and append the recovered entry. `reindex()` must be declared on the `ArchiveRepository` port. The `fs` adapter implements it by globbing all `manifest.json` files under the archive root, sorting entries by `archivedAt`, and writing a clean `index.jsonl` in chronological order. Other adapters implement it according to their storage mechanism. `specd storage reindex` calls the port method — it has no knowledge of the underlying implementation.

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

`{{month}}` and `{{day}}` must be zero-padded to two digits. `{{year}}` is four digits. This ensures lexicographic sort produces chronological order.

#### Scenario: January archive

- **WHEN** a change is archived on January 5th
- **THEN** `{{month}}` resolves to `"01"` and `{{day}}` resolves to `"05"`

## Constraints

- Manifest files must be written atomically (write to temp file, then rename) to prevent partial reads
- `FsChangeRepository` must not store `ArtifactStatus` in the manifest — only `validatedHash`
- Archive index entries must use forward slashes as path separators regardless of host OS
- The timestamp in a change directory name must be derived from `change.createdAt`, not from the system clock at write time

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — infrastructure layer constraints

## ADRs

- [ADR-0007: Archive Organization](../../../docs/adr/0007-archive-organization.md)
- [ADR-0008: Change Directory Naming](../../../docs/adr/0008-change-directory-naming.md)
- [ADR-0009: Artifact Status Derivation](../../../docs/adr/0009-artifact-status-derivation.md)
