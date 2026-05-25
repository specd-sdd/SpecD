# Verification: Change Metadata Editor

## Requirements

### Requirement: overview composes metadata child components

#### Scenario: Active change shows editors and read-only specs

- **GIVEN** active change on Overview
- **WHEN** tab renders
- **THEN** `studio-change-description-editor` is visible
- **AND** `studio-change-invalidation-policy-editor` is visible
- **AND** `studio-change-specs-readonly` is visible
- **AND** `studio-edit-spec-scope` is visible

#### Scenario: Archived change hides editors

- **GIVEN** archived change
- **WHEN** Overview renders
- **THEN** no description editor or Edit spec scope button

### Requirement: metadata saves append to Output panel

#### Scenario: Scope dialog save logs to Output

- **GIVEN** user saved scope dialog successfully
- **WHEN** shell handles `onScopeSaved`
- **THEN** Output tab is selected with a success line

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: No core in metadata components

- **WHEN** `@specd/ui` change metadata modules are inspected
- **THEN** none import `@specd/core`
