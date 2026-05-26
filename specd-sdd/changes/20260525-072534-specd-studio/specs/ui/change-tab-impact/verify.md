# Verification: Change Tab Impact

## Requirements

### Requirement: impact tab loads manifest tracking and graph view

#### Scenario: Impact tab calls review and graph endpoints

- **GIVEN** active change with manifest tracking
- **WHEN** user selects Impact tab
- **THEN** UI calls `getImplementationReview` and `getChangeGraphView`
- **AND** waits for both before rendering sections

#### Scenario: Hidden tab pauses polling

- **GIVEN** Impact tab was visible then hidden
- **WHEN** poll interval fires
- **THEN** no tab-scoped review or graph request is sent

#### Scenario: Archived change skips data fetch

- **GIVEN** archived shell context
- **WHEN** user selects Impact tab
- **THEN** UI does not call `getImplementationReview` or `getChangeGraphView`
- **AND** shows read-only archived messaging

### Requirement: impact is grouped by spec

#### Scenario: One card per spec with accepted links inside

- **GIVEN** change has links for `ui:foo` and `core:bar`
- **WHEN** Impact tab renders
- **THEN** two spec cards are shown with `specId` headers
- **AND** each card lists only links for that spec

#### Scenario: Graph not linked appears under the same spec card

- **GIVEN** graph coverage for `ui:foo` includes files without accepted links
- **WHEN** Impact tab renders
- **THEN** **Graph (not linked)** subsection appears inside the `ui:foo` card

#### Scenario: Tracked files appear under assigned spec

- **GIVEN** tracked file uniquely matches a link for one spec
- **WHEN** Impact tab renders
- **THEN** file appears under that spec’s tracked subsections (resolved / open / ignored)

#### Scenario: Ambiguous tracked files use unassigned section

- **GIVEN** tracked file matches no spec or multiple specs
- **WHEN** Impact tab renders
- **THEN** file appears in **Tracked files (unassigned)** at the bottom

### Requirement: empty specs are omitted

#### Scenario: empty specs are omitted — primary path

- **WHEN** Spec cards with no accepted links, no graph-only
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: empty specs are omitted — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: Component consumes SpecdDataPort hooks only

- **WHEN** UI package dependency graph is inspected
- **THEN** `@specd/ui` does not import `@specd/core`

### Requirement: view surfaces loading and error states

#### Scenario: Loading shows single progress message

- **WHEN** review or graph request is in flight
- **THEN** UI shows loading text before sections render

#### Scenario: Failed fetch shows human-readable error

- **GIVEN** port returns an error
- **WHEN** hook promise rejects
- **THEN** UI renders the error message
