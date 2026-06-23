# Verification: Spec Tab Dependencies

## Requirements

### Requirement: spec tab polls metadata while visible

#### Scenario: Visible spec tab refreshes metadata

- **GIVEN** spec tab for `core:kernel` is active
- **WHEN** light poll interval elapses
- **THEN** spec metadata hook refetches
- **AND** tree discovery still uses global poll

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

#### Scenario: Dependencies tab renders dependsOn list

- **WHEN** user selects Dependencies tab
- **THEN** UI lists `dependsOn` spec IDs from `getSpec`
- **AND** shows empty state when none declared

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
