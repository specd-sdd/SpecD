# Verification: Inspector Delta Full Diff

## Requirements

### Requirement: diff uses same preview source as Preview tab

#### Scenario: Dirty diff shows base vs draft merge

- **GIVEN** dirty delta artifact and preview hook loaded with overrides
- **WHEN** Diff tab is selected
- **THEN** diff compares `base` to `merged` from draft preview
- **AND** not from saved-on-disk merge only

### Requirement: diff tab only for change deltas

#### Scenario: Proposal has no Diff tab

- **GIVEN** `proposal.md` selected on an active change
- **WHEN** inspector renders mode tabs
- **THEN** Diff tab is not present in the strip

#### Scenario: Workspace spec has no Diff tab

- **GIVEN** a canonical workspace spec artifact is open
- **WHEN** inspector renders mode tabs
- **THEN** Diff tab is not present

#### Scenario: Archived change artifact has no Diff tab

- **GIVEN** an archived change artifact is open
- **WHEN** inspector renders mode tabs
- **THEN** Diff tab is not present

#### Scenario: New spec under specs/ in change has no Diff tab

- **GIVEN** `specs/ui/foo/spec.md` on an active change
- **WHEN** inspector renders mode tabs
- **THEN** Diff tab is not present
- **AND** Preview may still use spec-preview merge

#### Scenario: Delta artifact shows Diff tab

- **GIVEN** `deltas/core/foo/spec.md.delta.yaml` on an active change
- **WHEN** inspector renders mode tabs
- **THEN** Diff tab is present and selectable
