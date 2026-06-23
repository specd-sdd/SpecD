# Verification: Spec Tab Context

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

### Requirement: view renders structured spec context entries

#### Scenario: Structured context entry is visible

- **GIVEN** port returns a root entry with title, description, and grouped rules
- **WHEN** user opens the spec Context tab
- **THEN** the spec id/source metadata is shown
- **AND** rules are rendered as grouped lists instead of hidden raw JSON

#### Scenario: Entry fields are separated into accordions

- **GIVEN** a context entry includes description, constraints, and scenarios
- **WHEN** the tab renders that entry
- **THEN** each field group is shown in its own collapsible section
- **AND** the user can expand one group without forcing all other groups open

#### Scenario: Sections start open and missing fields stay visible

- **GIVEN** a context entry is missing optimized content or description
- **WHEN** the tab renders
- **THEN** those sections still appear at the top of the entry
- **AND** each missing section explicitly states that the field is unavailable
- **AND** the sections start expanded by default

#### Scenario: Markdown fields render as Markdown

- **GIVEN** description or optimized content includes Markdown lists or emphasis
- **WHEN** the field accordion is opened
- **THEN** the content is rendered as Markdown
- **AND** the user does not see the field as a raw plain-text blob

#### Scenario: Grouped rule and scenario text render as Markdown

- **GIVEN** rules, constraints, or scenario clause lines include Markdown formatting
- **WHEN** the corresponding accordion sections are opened
- **THEN** those grouped entries are rendered as Markdown too
- **AND** formatting is preserved consistently across all structured content fields

#### Scenario: Constraints render as a normal list

- **GIVEN** a context entry contains multiple constraints
- **WHEN** the Constraints section is rendered
- **THEN** the constraints appear as a list
- **AND** each item still preserves its Markdown formatting
- **AND** the UI does not wrap each constraint inside a separate padded card

#### Scenario: Warnings are shown separately from entry bodies

- **GIVEN** context response includes warnings
- **WHEN** the tab renders
- **THEN** warnings appear in a dedicated warning area
- **AND** entry content remains visible below
