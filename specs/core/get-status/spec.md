# GetStatus

## Purpose

Users and tooling need a quick way to see where a change stands — both its lifecycle state and which artifacts are actually ready — without loading file content. The `GetStatus` use case loads a single change by name and reports its current lifecycle state along with the effective status of each artifact, cascading through dependency chains so that an artifact whose hashes match may still show `in-progress` if any of its required dependencies are not `complete`.

## Requirements

### Requirement: Accepts a change name as input

`GetStatus.execute()` MUST accept a `GetStatusInput` containing a `name` string that identifies the change to look up.

### Requirement: Returns the change and its artifact statuses

On success, `execute()` MUST return a `GetStatusResult` containing:

- `change` -- the loaded `Change` entity with its current artifact state
- `artifactStatuses` -- an array of `ArtifactStatusEntry` objects, one per artifact attached to the change

Each `ArtifactStatusEntry` MUST contain:

- `type` -- the artifact type identifier (e.g. `'proposal'`, `'spec'`)
- `effectiveStatus` -- the effective `ArtifactStatus` after cascading through required dependencies via `Change.effectiveStatus(type)`
- `files` -- an array of `ArtifactFileStatus` objects, one per file in the artifact

Each `ArtifactFileStatus` MUST contain:

- `key` -- the file key (artifact type id for `scope: change`, spec ID for `scope: spec`)
- `filename` -- the relative filename within the change directory
- `status` -- the `ArtifactStatus` of that individual file

### Requirement: Throws ChangeNotFoundError for unknown changes

If no change with the given name exists in the repository, `execute()` MUST throw a `ChangeNotFoundError` with code `CHANGE_NOT_FOUND`. It MUST NOT return `null`.

### Requirement: Constructor accepts a ChangeRepository

`GetStatus` MUST accept a `ChangeRepository` as its sole constructor argument. It MUST delegate to `ChangeRepository.get(name)` to load the change.

### Requirement: Reports effective status for every artifact

The `artifactStatuses` array MUST contain exactly one entry per artifact in the change's artifact map. It MUST NOT omit artifacts and MUST NOT include entries for artifacts that do not exist on the change.

## Constraints

- The use case does not modify the change -- it is a read-only query
- Artifact content is not loaded; only status metadata is returned
- The effective status computation is delegated to the `Change` entity, not performed by the use case itself

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md)
- [`specs/core/kernel/spec.md`](../kernel/spec.md)
