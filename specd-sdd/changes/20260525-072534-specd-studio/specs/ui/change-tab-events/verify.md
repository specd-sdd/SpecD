# Verification: Change Tab Events

## Requirements

### Requirement: events tab renders change detail history

#### Scenario: Active change shows history from getChange

- **GIVEN** an active change with lifecycle history
- **WHEN** user selects the Events tab
- **THEN** rows reflect `ChangeDetailDto.history`
- **AND** no artifact or graph port methods are invoked from the tab component

#### Scenario: Archived change shows snapshot history

- **GIVEN** an archived change context
- **WHEN** user selects Events
- **THEN** history renders from `getArchivedChange` detail
- **AND** no live change-status polling runs for that context

#### Scenario: Shell refetches detail while Events is visible

- **GIVEN** active change and Events tab visible
- **WHEN** global change poll tick advances
- **THEN** shell reloads change detail (history may update)
- **AND** Events tab receives the new `detail` prop

### Requirement: history list is newest first

#### Scenario: Latest event appears at top

- **GIVEN** `history` ordered oldest-to-newest on the wire
- **WHEN** Events tab renders
- **THEN** the first visible row is the most recent event
- **AND** older events appear below

### Requirement: events render as expandable accordions

#### Scenario: Collapsed row shows summary only

- **GIVEN** Events tab is open
- **WHEN** user has not expanded a row
- **THEN** row shows event `type`, `at`, and actor line when `by` exists
- **AND** detail fields are hidden

#### Scenario: Click expands full event payload

- **GIVEN** a `transitioned` event with `from` and `to` on the DTO
- **WHEN** user clicks the row header
- **THEN** expanded panel lists `from`, `to`, and `by`
- **AND** chevron indicates open state (`aria-expanded=true`)

#### Scenario: Complex values use scrollable monospace block

- **GIVEN** an event field whose value serializes to multi-line JSON (e.g. `artifactHashes`)
- **WHEN** user expands the row
- **THEN** that field renders in a bounded scrollable monospace block
- **AND** single-line scalars stay inline

#### Scenario: Event with only base fields shows empty detail message

- **GIVEN** a history event whose DTO has only `type`, `at`, and optional `by`
- **WHEN** user expands the row
- **THEN** panel shows that no additional fields are present
- **AND** summary remains visible

#### Scenario: Click again collapses row

- **GIVEN** an expanded event row
- **WHEN** user clicks the header again
- **THEN** detail panel hides
- **AND** summary line remains visible

#### Scenario: Multiple rows may stay expanded

- **GIVEN** at least two history events
- **WHEN** user expands two different row headers
- **THEN** both detail panels are visible
- **AND** collapsing one does not collapse the other

#### Scenario: Events tab exposes stable test ids

- **GIVEN** Events tab with at least one event
- **WHEN** UI renders
- **THEN** container has `data-testid="studio-events-tab"`
- **AND** each row has `data-testid="studio-event-row-{index}"` with zero-based index

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: Component consumes SpecdDataPort hooks only

- **WHEN** UI package dependency graph is inspected
- **THEN** `@specd/ui` does not import `@specd/core`
- **AND** `ChangeEventsTab` does not call the port directly

#### Scenario: Hook delegates to configured adapter

- **WHEN** shell loads change detail for Events
- **THEN** calls go through `SpecdDataPort` (`getChange` or `getArchivedChange`)
- **AND** no direct repository or kernel import in the tab

### Requirement: view surfaces loading and error states

#### Scenario: Loading without detail shows spinner text

- **GIVEN** detail request in flight and no cached detail
- **WHEN** Events tab is shown
- **THEN** UI shows `Loading history…`

#### Scenario: Failed fetch shows human-readable error

- **GIVEN** detail hook rejects with an error
- **WHEN** Events tab is shown
- **THEN** UI renders the error message
- **AND** does not show a stale history list

#### Scenario: Missing detail shows empty state

- **GIVEN** no detail object after load settled
- **WHEN** Events tab is shown
- **THEN** UI shows `No change detail`
