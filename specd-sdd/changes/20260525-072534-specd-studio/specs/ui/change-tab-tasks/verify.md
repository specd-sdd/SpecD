# Verification: Change Tab Tasks

## Requirements

### Requirement: change tab refetches status tasks + `tasks.md` content when needed when updatedAt advances

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

#### Scenario: Tasks tab loads tasks.md when visible

- **GIVEN** active (non-archived) change with `tasks.md`
- **WHEN** user selects Tasks tab
- **THEN** UI loads artifact via `getChangeArtifact`
- **AND** displays tasks artifact status from `getChangeStatus` when present

#### Scenario: Archived change shows read-only message

- **GIVEN** shell context is archived
- **WHEN** user selects Tasks tab
- **THEN** UI does not call `getChangeArtifact`
- **AND** shows read-only archived messaging

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
