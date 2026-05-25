# Verification: Shell Layout

## Requirements

### Requirement: shell provides sidebar tabs inspector and bottom panel regions

#### Scenario: Layout renders sidebar tabs and inspector regions

- **WHEN** `<SpecdApp>` mounts
- **THEN** left sidebar visible
- **AND** central tabs and right inspector hosts exist

#### Scenario: Bottom panel host is available

- **WHEN** shell mounts
- **THEN** bottom panel renders with tabs in order Output, Problems, Logs
- **AND** **Output** is the initially selected tab

#### Scenario: Bottom panel tab order is Output Problems Logs

- **WHEN** user inspects bottom tab strip
- **THEN** left-to-right order is Output, Problems, Logs
- **AND** no other tab precedes Output

#### Scenario: Regions survive route navigation

- **WHEN** user switches change tabs
- **THEN** chrome persists
- **AND** only tab content swaps

### Requirement: shell orchestrates global polling while focused

#### Scenario: Global poll refreshes project and sidebars

- **GIVEN** window focused
- **WHEN** 2–3s poll elapses
- **THEN** project hooks refetch
- **AND** sidebar lists refetch

#### Scenario: Poll does not require open change tab

- **GIVEN** no change tab open
- **WHEN** global poll runs
- **THEN** workspace tree still updates
- **AND** drafts list still updates

#### Scenario: Unfocused window pauses poll

- **GIVEN** window blurred
- **WHEN** interval elapses
- **THEN** no global poll requests fire

### Requirement: global polling pauses when the window is unfocused

#### Scenario: Blur stops global poll interval

- **WHEN** user switches to another application
- **THEN** timers for global poll are cleared or skipped

#### Scenario: Focus resumes polling

- **WHEN** user returns to Studio window
- **THEN** next poll tick schedules
- **AND** data refreshes

#### Scenario: Hidden change tab does not restart global poll

- **GIVEN** global poll paused by blur
- **WHEN** user shows hidden tab
- **THEN** global poll remains paused until focus returns

### Requirement: shell routes archived changes through archived read port

#### Scenario: Archive selection uses getArchivedChange

- **WHEN** user opens a change from Archive sidebar section
- **THEN** shell loads via `getArchivedChange`
- **AND** inspector save and validate are disabled

#### Scenario: Archived change skips getChange polling

- **GIVEN** archived center context
- **WHEN** global poll ticks
- **THEN** shell does not call `getChange` or `getChangeStatus` for that name

### Requirement: bottom panel polls only the visible channel

#### Scenario: Logs tab does not poll studio output

- **GIVEN** user selects bottom **Logs** tab
- **WHEN** global poll ticks
- **THEN** `listStudioOutput` is not invoked
- **AND** `readProjectLogs` may run

#### Scenario: Output tab does not poll project logs

- **GIVEN** user selects bottom **Output** tab
- **WHEN** global poll ticks
- **THEN** `readProjectLogs` is not invoked
- **AND** `listStudioOutput` may run

#### Scenario: Switching bottom tabs does not append output

- **GIVEN** studio output has N entries
- **WHEN** user toggles between **Output** and **Logs**
- **THEN** entry count stays N until an explicit user action appends

### Requirement: shell delegates tab-scoped polling to visible center tabs

#### Scenario: Hidden change tab does not refetch on global tick

- **GIVEN** user is on Overview tab only
- **WHEN** global poll increments
- **THEN** Artifacts tab hooks do not refetch
- **AND** visible Overview may refetch detail when applicable

### Requirement: shell applies design-system theme at application root

#### Scenario: SpecdApp imports theme before chrome

- **WHEN** `SpecdApp` mounts
- **THEN** design-system theme module is loaded at root
- **AND** `--studio-bg-primary` or equivalent tokens apply to the app shell

#### Scenario: Shell regions use token backgrounds

- **WHEN** sidebar and tab strip render
- **THEN** backgrounds use secondary/elevated tokens from design-system
- **AND** not hard-coded marketing card colors

#### Scenario: Status bar uses design-system chrome

- **WHEN** shell is complete
- **THEN** status bar uses thin IDE strip styling from tokens
- **AND** border separator uses `#30363D` token

### Requirement: shell never imports @specd/core

#### Scenario: Shell package has no core dependency

- **WHEN** dependency graph of `@specd/ui` is inspected
- **THEN** no import from `@specd/core`
- **AND** ports used via hooks

#### Scenario: Command palette uses hooks only

- **WHEN** palette action runs
- **THEN** invokes SpecdDataPort path
- **AND** no direct kernel import

#### Scenario: Adding core import fails boundary check

- **WHEN** contributor adds `@specd/core` import to shell
- **THEN** lint or architectural test fails
