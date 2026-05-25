# Verification: Change Tab Validation

## Requirements

### Requirement: no dedicated Validation change tab

#### Scenario: Change tab strip omits Validation

- **GIVEN** an active change is open in the center panel
- **WHEN** the change tab strip renders
- **THEN** tabs are Overview, Artifacts, Tasks, Events, Context, and Impact only
- **AND** no Validation tab is shown

### Requirement: overview owns status polling semantics

#### Scenario: Workflow status visible on Overview

- **GIVEN** Overview is the active change tab
- **WHEN** `getChangeStatus` returns blockers or next action
- **THEN** Overview shows a workflow section with that data
- **AND** switching to another tab does not require opening Validation
