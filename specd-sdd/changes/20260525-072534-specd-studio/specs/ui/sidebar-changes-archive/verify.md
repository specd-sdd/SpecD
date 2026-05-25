# Verification: Sidebar Changes Archive

## Requirements

### Requirement: sidebar renders global poll data and wires actions

#### Scenario: Sidebar lists refresh on global poll

- **GIVEN** shell global poll is running
- **WHEN** poll tick fires
- **THEN** changes/drafts/discarded lists update
- **AND** row actions stay wired to ports

#### Scenario: Archive row opens archived snapshot port

- **WHEN** user clicks a row in the Archive section
- **THEN** shell calls `getArchivedChange(name)` on `port-archived-changes`
- **AND** does not call `getChange` for that name

#### Scenario: In Progress row opens active change read port

- **WHEN** user clicks a row in In Progress
- **THEN** shell calls `port-changes-read` (`getChange` / status)
- **AND** center context is not marked archived

#### Scenario: Discard calls mutate port

- **WHEN** user discards a draft from sidebar
- **THEN** `port-changes-mutate` discard runs
- **AND** list refreshes on success

### Requirement: archive rows show name only without per-row state or archive action chrome

#### Scenario: Archive row shows name without archived badge

- **GIVEN** Archive section lists changes
- **WHEN** sidebar renders each row
- **THEN** row shows change name only
- **AND** does not show per-row `archived` state text

#### Scenario: Archive row has no hover archive icon

- **WHEN** user hovers an Archive row
- **THEN** no archive action icon appears
- **AND** row remains a single open action

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
