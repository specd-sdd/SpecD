# Verification: Hooks Changes Collection

## Requirements

### Requirement: hooks load change lists through port-changes-collection

#### Scenario: Sidebar hooks call list methods

- **WHEN** `hooks-changes-collection` mounts
- **THEN** `listChanges`, `listDrafts`, `listDiscarded`, `listArchived` are invoked
- **AND** results render in sidebar sections

#### Scenario: Global poll refreshes lists

- **GIVEN** shell poll is active
- **WHEN** poll interval elapses
- **THEN** lists refetch
- **AND** new agent-created change appears without reload

#### Scenario: Overlap detection surfaces warnings

- **WHEN** `detectOverlaps` returns overlaps
- **THEN** UI shows overlap badge
- **AND** user can inspect conflicting changes

### Requirement: hooks refresh change lists on global poll

#### Scenario: Global poll triggers list refetch

- **GIVEN** shell global poll active
- **WHEN** poll interval elapses
- **THEN** `listChanges` and related hooks refetch
- **AND** sidebar rows update

#### Scenario: Poll paused when window blurred

- **GIVEN** window not focused
- **WHEN** interval would fire
- **THEN** collection hooks do not refetch
- **AND** last data remains

#### Scenario: New change appears after external edit

- **GIVEN** agent creates change on disk
- **WHEN** next poll tick runs
- **THEN** in-progress list includes new row
- **AND** no full page reload
