# Verification: Change Manifest

## Requirements

### Requirement: Manifest structure

#### Scenario: Manifest written on creation

- **WHEN** a new change `add-auth-flow` is created
- **THEN** a `manifest.json` is written containing `name`, `createdAt`, `schema`, `workspaces`, `specIds`, `contextSpecIds`, `artifacts`, and a `history` array with a single `created` event

#### Scenario: No state field in manifest

- **WHEN** a manifest is read from disk
- **THEN** there is no top-level `state` field; the current state is derived by reading the `to` field of the last `transitioned` event in `history`

#### Scenario: History never shrinks

- **WHEN** a manifest is loaded, modified (e.g. workspace added), and saved
- **THEN** the `history` array on disk has more entries than before — no existing events are missing or reordered

#### Scenario: Artifact validated hash stored

- **WHEN** `ValidateSpec` marks an artifact complete with hash `sha256:abc`
- **THEN** the manifest's `artifacts` entry for that type has `validatedHash: "sha256:abc"` and no `status` field

#### Scenario: validatedHash is null for unvalidated artifact

- **WHEN** an artifact exists in `artifacts` but has never been validated
- **THEN** its `validatedHash` is `null` in the manifest

#### Scenario: contextSpecIds does not invalidate approvals

- **WHEN** `contextSpecIds` is updated on a change that has an active `spec-approved` event
- **THEN** no `invalidated` event is appended and the approval remains active

### Requirement: Schema version

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

### Requirement: Atomic writes

#### Scenario: History events appended atomically

- **WHEN** a state transition occurs
- **THEN** the new `transitioned` event is appended to `history` and the entire manifest is written atomically (temp file + rename); no partial writes are visible
