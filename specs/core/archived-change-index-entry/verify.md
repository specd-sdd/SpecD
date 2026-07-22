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

### Requirement: No manifest-only data

#### Scenario: ArchiveListEntry is sufficient for listing without manifest reads

- **GIVEN** an archive with many indexed entries
- **WHEN** an archive listing is produced from `ArchiveListEntry` values
- **THEN** the listing does not require loading `manifest.json` for every entry
- **AND** artifact inventories are not present on list rows
