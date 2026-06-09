# Verification: ArchivedChangeIndexEntry

## Requirements

### Requirement: Index entry fields

#### Scenario: Index entry contains required fields

- **GIVEN** an archive index entry loaded from `index.jsonl`
- **WHEN** it is represented as an `ArchivedChangeIndexEntry`
- **THEN** it contains `name`, `archivedName`, `archivedAt`, `specIds`, `schemaName`, and `schemaVersion`
- **AND** it may contain `archivedBy` when recorded
- **AND** it contains `artifacts` as an array of artifact type IDs

### Requirement: No manifest-only data

#### Scenario: Index entry is sufficient for listing without manifest reads

- **GIVEN** an archive with many entries
- **WHEN** an archive listing is produced from `ArchivedChangeIndexEntry` values
- **THEN** the listing does not require loading `manifest.json` for every entry

### Requirement: Derived workspaces

#### Scenario: Workspaces are derived from specIds

- **GIVEN** an `ArchivedChangeIndexEntry` with `specIds` containing `core:change` and `cli:archive-show`
- **WHEN** `workspaces` is derived
- **THEN** it contains `core` and `cli`
