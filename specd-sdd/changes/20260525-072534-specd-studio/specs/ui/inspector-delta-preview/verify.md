# Verification: Inspector Delta Preview

## Requirements

### Requirement: preview uses draft when dirty

#### Scenario: Dirty delta shows draft merge

- **GIVEN** user edited delta YAML in editor without save
- **WHEN** Preview tab is selected
- **THEN** `previewChangeDraft` is invoked with override for open filename
- **AND** merged markdown reflects unsaved delta

### Requirement: preview uses saved preview when clean

#### Scenario: Clean state uses GET preview

- **GIVEN** buffer matches disk content
- **WHEN** Preview tab is selected
- **THEN** `previewChange` (GET) is used
- **AND** POST preview is not called

### Requirement: non-spec-preview artifacts preview raw buffer

#### Scenario: Proposal preview is buffer markdown

- **GIVEN** `proposal.md` open with local edits
- **WHEN** Preview is selected
- **THEN** rendered content equals editor buffer
- **AND** no spec-preview API call
