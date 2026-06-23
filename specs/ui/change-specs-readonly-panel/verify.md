# Verification: Change Specs Readonly Panel

## Requirements

### Requirement: panel lists each spec in scope with dependencies

#### Scenario: Spec with dependencies shows arrows

- **GIVEN** `specDependsOn` contains `core:auth` → `[default:architecture]`
- **WHEN** panel renders
- **THEN** `studio-change-specs-readonly` shows `core:auth` and `→ default:architecture`

#### Scenario: Spec without dependencies shows empty copy

- **GIVEN** a spec in `specIds` with no `dependsOn` entry
- **WHEN** panel renders
- **THEN** panel shows “No declared dependencies” under that spec

#### Scenario: No specs in scope

- **GIVEN** `specIds` is empty
- **WHEN** panel renders
- **THEN** panel shows “No specs in scope.”

### Requirement: panel is read-only

#### Scenario: No mutate controls

- **WHEN** panel is rendered on Overview
- **THEN** there are no Add/Remove spec buttons in the panel
- **AND** no PATCH is triggered from this component
