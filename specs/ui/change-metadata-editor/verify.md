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

#### Scenario: Shelved and archived changes hide scope edit affordances

- **GIVEN** a change open from **draft**, **discarded**, or **archived** sidebar list
- **WHEN** Overview renders the **Specs & dependencies** card
- **THEN** `studio-change-specs-readonly` is visible
- **AND** `studio-edit-spec-scope` is not visible
- **AND** copy about using a dialog to edit scope on Overview is not shown

#### Scenario: Active change shows scope edit helper and button

- **GIVEN** active change on Overview
- **WHEN** the **Specs & dependencies** card renders
- **THEN** helper copy **Read-only on Overview — use the dialog to edit scope safely.** is visible
- **AND** `studio-edit-spec-scope` is visible

### Requirement: metadata saves append to Output panel

#### Scenario: Scope dialog save logs to Output

- **GIVEN** user saved scope dialog successfully
- **WHEN** shell handles `onScopeSaved`
- **THEN** Output tab is selected with a success line

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: No core in metadata components

- **WHEN** `@specd/ui` change metadata modules are inspected
- **THEN** none import `@specd/core`
