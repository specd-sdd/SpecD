# Verification: Hooks Workspaces Specs

## Requirements

### Requirement: hooks load workspaces and spec tree metadata

#### Scenario: Workspaces hook calls list endpoint

- **WHEN** workspace sidebar mounts
- **THEN** `listWorkspaces` via port invoked
- **AND** tree receives workspace ids

#### Scenario: Spec tree metadata loads per workspace

- **GIVEN** workspace `core` selected
- **WHEN** tree expands
- **THEN** metadata fetched without inline bodies
- **AND** nodes show titles from metadata

#### Scenario: Search uses workspaces port filter

- **WHEN** user searches specs scoped to workspace
- **THEN** `searchSpecs` includes workspace param
- **AND** results limited to scope

#### Scenario: Spec hook preserves structured context payload

- **WHEN** spec detail hook requests context for the selected spec
- **THEN** it calls `getSpecContext`
- **AND** the returned `entries[]` and `warnings[]` remain available to the view without markdown flattening

### Requirement: workspace tree refreshes on global poll

#### Scenario: Tree refetches on global poll tick

- **GIVEN** workspace sidebar visible
- **WHEN** global poll runs
- **THEN** tree metadata hook refetches
- **AND** new spec file appears as node

#### Scenario: Hidden sidebar skips tree poll

- **GIVEN** user collapsed workspace panel
- **WHEN** poll fires
- **THEN** no tree refetch
- **AND** cache retained until panel shown

#### Scenario: Selection preserved across refresh

- **GIVEN** spec `core:foo` selected
- **WHEN** tree poll completes without structural change
- **THEN** selection remains on `core:foo`
- **AND** scroll position stable
