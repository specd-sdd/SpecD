# Verification: Hooks Changes Read

## Requirements

### Requirement: read hooks route by sidebar list section

#### Scenario: Drafted change loads via getDraft

- **GIVEN** change `dummy-draft` exists only under drafts
- **WHEN** shell opens it with `listSection` `draft`
- **THEN** `useChangesRead` calls `getDraft("dummy-draft")`
- **AND** does not call `getChange` for that name

#### Scenario: Discarded change loads via getDiscarded

- **GIVEN** change exists only under discarded
- **WHEN** shell opens it with `listSection` `discarded`
- **THEN** `useChangesRead` calls `getDiscarded`
- **AND** does not call `getChange`

#### Scenario: Active change still uses getChange

- **GIVEN** change is in the active list
- **WHEN** shell opens it with `listSection` `active` or null
- **THEN** `useChangesRead` calls `getChange` and `getChangeStatus`

#### Scenario: Draft artifact list uses listDraftArtifacts

- **GIVEN** drafted change and Artifacts tab visible
- **WHEN** `useChangeArtifactList` loads
- **THEN** port receives `listDraftArtifacts(name)`
- **AND** not `listChangeArtifacts`

#### Scenario: Inspector artifact body uses draft route when drafted

- **GIVEN** drafted change and user selects an artifact file
- **WHEN** `useChangeArtifact` loads content
- **THEN** port receives `getDraftArtifact(name, filename)`

### Requirement: shelved and archived views do not poll change status or artifacts

#### Scenario: Drafted detail loads once (no poll refreshKey)

- **GIVEN** drafted change open in the shell
- **WHEN** global poll ticks
- **THEN** shell does not refetch drafted detail or status automatically

#### Scenario: Discarded view does not poll status

- **GIVEN** discarded change open in the shell
- **WHEN** global poll ticks
- **THEN** shell does not call `getDiscardedStatus` for that name

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
