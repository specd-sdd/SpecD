# Verification: Spec Tab Overview

## Requirements

### Requirement: spec tab polls metadata while visible

#### Scenario: Visible spec tab refreshes metadata

- **GIVEN** spec tab for `core:kernel` is active
- **WHEN** light poll interval elapses
- **THEN** spec metadata hook refetches
- **AND** tree discovery still uses global poll

#### Scenario: Overview replaces a dedicated metadata tab

- **GIVEN** a loaded spec
- **WHEN** user stays on Overview
- **THEN** the user can read the current spec summary there
- **AND** no separate **Metadata** tab is required

#### Scenario: Hidden spec tab stops metadata poll

- **GIVEN** user switches away from spec tab
- **WHEN** poll would have fired
- **THEN** no metadata request is sent
- **AND** last data remains rendered

#### Scenario: New spec appears via workspace tree poll

- **GIVEN** agent adds a spec file on disk
- **WHEN** global workspace poll runs
- **THEN** tree shows new node
- **AND** spec tab poll does not scan filesystem directly

### Requirement: linked changes tab lists active changes referencing the current spec

#### Scenario: Linked Changes filters active changes by specId

- **GIVEN** open spec `core:kernel`
- **AND** active changes include one that contains `core:kernel` and another that does not
- **WHEN** user selects Linked Changes tab
- **THEN** UI lists only the change that references `core:kernel`
- **AND** the data comes from the current spec detail payload
- **AND** unrelated active changes are excluded

#### Scenario: Linked Changes hidden tab pauses overlap poll

- **GIVEN** user leaves Linked Changes tab
- **WHEN** global poll ticks
- **THEN** linked-change list does not refetch until tab visible again

#### Scenario: Linked Changes shows description and colored state

- **GIVEN** a referenced active change has a description and lifecycle state
- **WHEN** user selects Linked Changes
- **THEN** the row shows the description text
- **AND** the state badge uses the state color

#### Scenario: No referencing active changes shows empty state

- **GIVEN** no active change contains the current spec's `specId`
- **WHEN** user selects Linked Changes
- **THEN** the UI renders an explicit empty state

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: Component consumes SpecdDataPort hooks only

- **WHEN** UI package dependency graph is inspected
- **THEN** `@specd/ui` does not import `@specd/core`
- **AND** components call `client:port-*` hooks

#### Scenario: Hook delegates to configured adapter

- **WHEN** component mounts and requests change data
- **THEN** calls go through `SpecdDataPort`
- **AND** no direct repository or kernel import

#### Scenario: Adding a core import fails the boundary

- **WHEN** author introduces `import` from `@specd/core` under `@specd/ui`
- **THEN** lint or build fails
- **AND** data must flow through the port surface

### Requirement: view surfaces loading and error states

#### Scenario: Hook exposes loading while port call is in flight

- **WHEN** port method is invoked from the component
- **THEN** consumers observe loading state until the promise settles

#### Scenario: Failed fetch shows human-readable error

- **GIVEN** port returns a network or HTTP error
- **WHEN** hook promise rejects
- **THEN** consumers receive an error object
- **AND** UI renders the message instead of stale data

#### Scenario: Save conflict shows HTTP 409 to the user

- **GIVEN** save returns 409 problem+json
- **WHEN** inspector save hook completes with error
- **THEN** UI shows the conflict message
- **AND** editor buffer is not silently replaced
