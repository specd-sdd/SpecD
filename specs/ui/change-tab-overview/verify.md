# Verification: Change Tab Overview

## Requirements

### Requirement: change tab refetches conditional status when updatedAt advances

#### Scenario: Unchanged status skips tab refetch

- **GIVEN** tab is visible
- **AND** cached `updatedAt` matches server
- **WHEN** `getChangeStatus` returns `{ unchanged: true }`
- **THEN** tab does not refetch heavy views
- **AND** spinner stops without data swap

#### Scenario: Advanced updatedAt refetches tab data

- **GIVEN** status returns newer `updatedAt`
- **WHEN** tab poll observes revision bump
- **THEN** only this tab data sources reload
- **AND** other tabs are unaffected

#### Scenario: Hidden tab pauses polling

- **GIVEN** change tab was visible then hidden
- **WHEN** poll interval fires
- **THEN** no tab-scoped status request is sent
- **AND** cache is retained until visible again

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

### Requirement: overview includes workflow and validation status

#### Scenario: Blockers appear on Overview

- **GIVEN** `getChangeStatus` returns blockers for the open change
- **WHEN** Overview is visible
- **THEN** blockers are listed in the workflow section on Overview
- **AND** there is no separate Validation tab to open

#### Scenario: Active change keeps workflow status after sidebar switch

- **GIVEN** active changes `alpha` and `beta` where `beta` was updated more recently
- **AND** Overview for `alpha` previously showed blockers or next action
- **WHEN** user selects `beta` then selects `alpha` again
- **THEN** Overview workflow section shows `alpha` status again
- **AND** does not show **Workflow status unavailable.**

### Requirement: overview hosts change metadata editor

#### Scenario: Specs readonly panel on Overview

- **GIVEN** change with multiple specs
- **WHEN** user opens Overview
- **THEN** `studio-change-specs-readonly` lists specs and dependencies
- **AND** inline scope chips are not on Overview

#### Scenario: Draft Overview shows specs without scope dialog affordances

- **GIVEN** a drafted change with multiple specs
- **WHEN** user opens Overview
- **THEN** `studio-change-specs-readonly` lists specs and dependencies
- **AND** `studio-edit-spec-scope` is not visible

### Requirement: overview surfaces lifecycle actions

#### Scenario: Active change shows shelf and discard

- **GIVEN** an active in-progress change is open
- **WHEN** Overview renders
- **THEN** "Shelf to drafts" and "Discard" buttons appear in the header area
- **AND** "Restore to active" is not shown

#### Scenario: Draft change shows restore and discard

- **GIVEN** a drafted change is open
- **WHEN** Overview renders
- **THEN** "Restore to active" and "Discard" buttons appear
- **AND** "Shelf to drafts" is not shown

#### Scenario: Discarded change shows read-only notice

- **GIVEN** a discarded change is open
- **WHEN** Overview renders
- **THEN** a read-only notice is shown instead of action buttons

#### Scenario: Discarded change shows workflow status unavailable

- **GIVEN** a discarded change is open
- **WHEN** Overview renders the Workflow & validation card
- **THEN** UI does not call `getChangeStatus` for that name
- **AND** shows **Workflow status unavailable.**

#### Scenario: Archived change shows workflow status unavailable

- **GIVEN** an archived change is open
- **WHEN** Overview renders the Workflow & validation card
- **THEN** UI does not call `getChangeStatus`
- **AND** shows **Workflow status unavailable.**

#### Scenario: Lifecycle actions require Studio confirmation modal

- **GIVEN** an active change is open
- **WHEN** user clicks "Shelf to drafts" or "Discard permanently"
- **THEN** `studio-change-lifecycle-confirm-dialog` opens before the port call executes

#### Scenario: Discard is separated from safe actions

- **GIVEN** an active change with shelf and discard available
- **WHEN** Overview renders lifecycle actions
- **THEN** "Discard permanently" is right-aligned and separated from shelf/archive controls

#### Scenario: Lifecycle actions disabled while busy

- **GIVEN** a lifecycle action is in flight
- **WHEN** the action is pending
- **THEN** all lifecycle buttons are disabled
- **AND** double-submission is prevented

#### Scenario: Archive shown only when archivable

- **GIVEN** an active change in state `archivable` or `signed-off`
- **WHEN** Overview renders
- **THEN** "Archive" button is shown
- **GIVEN** active change in any other state
- **THEN** "Archive" button is not shown
