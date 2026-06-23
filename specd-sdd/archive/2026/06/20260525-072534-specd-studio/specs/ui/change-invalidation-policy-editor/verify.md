# Verification: Change Invalidation Policy Editor

## Requirements

### Requirement: select policy and save when dirty

#### Scenario: Save sends invalidationPolicy

- **GIVEN** user selected `surgical` differing from saved
- **WHEN** user clicks Save
- **THEN** `patchChange` includes `{ invalidationPolicy: "surgical" }`

### Requirement: helper copy explains non-invalidating save

#### Scenario: Copy visible

- **WHEN** editor renders
- **THEN** helper text mentions future drift only

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: No core import

- **WHEN** package boundary is checked
- **THEN** component has no `@specd/core` import
