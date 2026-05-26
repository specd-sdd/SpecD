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

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: view uses SpecdDataPort hooks only — primary path

- **WHEN** Components MUST consume data through SpecdDataPort hooks and
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: view uses SpecdDataPort hooks only — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: view surfaces loading and error states

#### Scenario: view surfaces loading and error states — primary path

- **WHEN** While requests are in flight or fail, the
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: view surfaces loading and error states — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented
