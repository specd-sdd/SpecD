# Verification: Spec Tab Outline

## Requirements

### Requirement: tab label is Outline

#### Scenario: Tab strip shows Outline

- **GIVEN** workspace spec is open
- **WHEN** center tabs render
- **THEN** tab named Outline is present
- **AND** tab named Schema is not present

### Requirement: spec tab polls outline while visible

#### Scenario: Outline tab loads outline JSON

- **GIVEN** workspace spec with `spec.md`
- **WHEN** user selects Outline tab
- **THEN** UI calls `getSpecOutline`
- **AND** renders JSON outline or error state
