# Verification: Inspector Edit Preview

## Requirements

### Requirement: inspector mode selects preview delta or read-only canonical

#### Scenario: Preview mode shows merged delta

- **GIVEN** change artifact has pending delta
- **WHEN** user selects preview in inspector
- **THEN** inspector shows merged preview
- **AND** editor is read-only in preview

#### Scenario: Canonical workspace spec is read-only

- **GIVEN** workspace canonical `spec.md` is open
- **WHEN** user attempts to edit in inspector
- **THEN** save is disabled
- **AND** content is display-only

#### Scenario: Delta edit mode enables save hook

- **GIVEN** editable change artifact is open
- **WHEN** user edits and saves
- **THEN** `hooks-inspector-save` runs
- **AND** hash conflict surfaces 409 UI

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
