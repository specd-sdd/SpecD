# Verification: ArchivedChangeIndexEntry

## Requirements

### Requirement: Index entry fields

#### Scenario: ArchiveListEntry contains required fields

- **GIVEN** an archive list entry loaded from the fs-cache index
- **WHEN** it is represented as an `ArchiveListEntry`
- **THEN** it contains `name`, `archivedName`, `archivedAt`, `specIds`, `schemaName`, and `schemaVersion`
- **AND** it does not contain `artifacts`
- **AND** it does not contain `workspaces`

#### Scenario: archivedBy appears only when includeArchivedBy is set

- **GIVEN** an archive list entry whose cached payload includes `archivedBy`
- **WHEN** the entry is projected with `includeArchivedBy: true`
- **THEN** `archivedBy` may appear on the returned entry
- **WHEN** the entry is projected without `includeArchivedBy`
- **THEN** `archivedBy` is not present on the returned entry

#### Scenario: Spec workspaces are derived through the validator

- **GIVEN** the spec IDs `core:auth/login`, `core:auth/session`, and `default:_global/x`
- **WHEN** `workspacesFromSpecIds` is called
- **THEN** it returns `core` then `default`, unique and in encounter order

#### Scenario: Invalid ID in the input is rejected

- **GIVEN** the spec IDs `core:auth/login` and `auth/a,b`
- **WHEN** `workspacesFromSpecIds` is called
- **THEN** it throws `InvalidSpecIdError` quoting `auth/a,b`

#### Scenario: List rows do not claim a change workspace

- **WHEN** an archive listing is produced
- **THEN** list rows carry no `workspaces` field
- **AND** no singular or primary workspace is assigned to the archived change

### Requirement: No manifest-only data

#### Scenario: ArchiveListEntry is sufficient for listing without manifest reads

- **GIVEN** an archive with many indexed entries
- **WHEN** an archive listing is produced from `ArchiveListEntry` values
- **THEN** the listing does not require loading `manifest.json` for every entry
- **AND** artifact inventories are not present on list rows
