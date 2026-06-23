# Verification: Sidebar Workspaces Tree

## Requirements

### Requirement: sidebar renders global poll data and wires actions

#### Scenario: Sidebar lists refresh on global poll

- **GIVEN** shell global poll is running
- **WHEN** poll tick fires
- **THEN** changes/drafts/discarded lists update
- **AND** row actions stay wired to ports

#### Scenario: Open action calls read port

- **WHEN** user clicks open on a change row
- **THEN** `port-changes-read` opens the change tab
- **AND** no direct core import

#### Scenario: Discard calls mutate port

- **WHEN** user discards a draft from sidebar
- **THEN** `port-changes-mutate` discard runs
- **AND** list refreshes on success

### Requirement: rows must truncate long spec paths

#### Scenario: Long spec paths truncate

- **GIVEN** a spec with a deeply nested path exceeding sidebar width
- **WHEN** sidebar tree renders
- **THEN** path truncates with an ellipsis
- **AND** full path is visible via native browser tooltip

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
