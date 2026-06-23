# Verification: Inspector Delta Preview

## Requirements

### Requirement: preview uses saved preview when clean

#### Scenario: Clean state uses GET preview

- **GIVEN** buffer matches disk content
- **WHEN** Preview tab is selected
- **THEN** `previewChange` (GET) is used
- **AND** POST preview is not called

### Requirement: preview uses draft when dirty

#### Scenario: Dirty delta shows draft merge

- **GIVEN** user edited delta YAML in editor without save
- **WHEN** Preview tab is selected
- **THEN** `previewChangeDraft` is invoked with override for open filename
- **AND** merged markdown reflects unsaved delta

### Requirement: non-spec-preview artifacts preview raw buffer

#### Scenario: Proposal preview is buffer markdown

- **GIVEN** `proposal.md` open with local edits
- **WHEN** Preview is selected
- **THEN** rendered content equals editor buffer
- **AND** no spec-preview API call

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: view uses SpecdDataPort hooks only — primary path

- **WHEN** Components MUST consume data through SpecdDataPort hooks and
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: view uses SpecdDataPort hooks only — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented
