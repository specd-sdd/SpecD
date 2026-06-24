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

#### Scenario: Tree refetches on global poll tick when Workspaces visible

- **GIVEN** sidebar expanded and Workspaces section active
- **WHEN** global poll runs
- **THEN** tree metadata hook refetches
- **AND** new spec file appears as node

#### Scenario: Collapsed sidebar skips tree poll

- **GIVEN** sidebar collapsed to activity rail
- **WHEN** poll fires
- **THEN** no tree refetch
- **AND** cache retained until Workspaces section shown expanded

#### Scenario: Re-expanding sidebar retains cached tree

- **GIVEN** sidebar collapsed after tree loaded
- **WHEN** user expands sidebar before next poll tick
- **THEN** cached tree data is still available
- **AND** Workspaces list renders without a loading flash

#### Scenario: Selection preserved across refresh

- **GIVEN** spec `core:foo` selected
- **WHEN** tree poll completes without structural change
- **THEN** selection remains on `core:foo`
- **AND** scroll position stable
