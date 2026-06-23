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

### Requirement: editor area tabs support horizontal scrolling and navigation arrows

#### Scenario: Tabs scroll when overflowing container

- **GIVEN** editor area has more tabs than fit in view
- **WHEN** user uses scroll wheel or trackpad over tabs
- **THEN** tabs scroll horizontally

#### Scenario: Navigation arrows appear when overflowing

- **GIVEN** editor area has overflowing tabs
- **WHEN** tab bar renders
- **THEN** left and right navigation arrows are present
- **AND** arrows are disabled when scrolled to extreme ends

### Requirement: tab views display context via breadcrumbs

#### Scenario: Context breadcrumbs render above tabs

- **GIVEN** a change or spec tab is open
- **WHEN** the main view renders
- **THEN** a breadcrumb header displays the context (e.g. `CHANGES / my-change`) above the tab bar

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

### Requirement: shell routes archived changes through archived read port

#### Scenario: Archive selection uses getArchivedChange

- **WHEN** user opens a change from Archive sidebar section
- **THEN** shell loads via `getArchivedChange`
- **AND** inspector save and validate are disabled
- **AND** archived artifact reads use the read-only archived artifact path rather than active `getChangeArtifact`

#### Scenario: Archived change skips getChange polling

- **GIVEN** archived center context
- **WHEN** global poll ticks
- **THEN** shell does not call `getChange` or `getChangeStatus` for that name

### Requirement: read-only change tabs load once (no per-change polling)

#### Scenario: Drafted change does not poll status or artifacts

- **GIVEN** drafted change open in the shell
- **WHEN** global poll ticks
- **THEN** shell does not call `getDraftStatus` repeatedly
- **AND** change artifact list does not refetch on every tick

### Requirement: shell routes drafted and discarded changes through read-only ports

#### Scenario: Draft sidebar selection uses getDraft

- **GIVEN** change `dummy-draft` is listed under Drafts only
- **WHEN** user opens it from the sidebar
- **THEN** shell passes `listSection` `draft` to `useChangesRead`
- **AND** overview loads without `Change 'dummy-draft' not found`

#### Scenario: Discarded sidebar selection uses getDiscarded

- **GIVEN** change is listed under Discarded only
- **WHEN** user opens it from the sidebar
- **THEN** shell passes `listSection` `discarded`
- **AND** does not call `getChange` for that name

#### Scenario: Active change keeps getChange

- **GIVEN** change is in the In progress list
- **WHEN** user opens it
- **THEN** shell passes `listSection` `active` or null
- **AND** `useChangesRead` calls `getChange`

### Requirement: validate requires drift confirmation

#### Scenario: validate requires drift confirmation — primary path

- **WHEN** Validate and Validate All MUST show [ui:validate-confirm-dialog](../validate-confirm-dialog/spec.md) before
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: validate requires drift confirmation — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: shell delegates tab-scoped polling to visible center tabs

#### Scenario: Hidden change tab does not refetch on global tick

- **GIVEN** user is on Overview tab only
- **WHEN** global poll increments
- **THEN** Artifacts tab hooks do not refetch
- **AND** visible Overview may refetch detail when applicable

### Requirement: opening a spec auto-selects the primary artifact

#### Scenario: Opening a spec preselects spec.md in the inspector

- **GIVEN** workspace spec `ui:foo` exposes canonical `spec.md`
- **WHEN** user opens that spec from the workspace tree
- **THEN** the right inspector opens automatically
- **AND** the selected file is `spec.md`

### Requirement: bottom panel polls only the remote logs channel

#### Scenario: Logs tab does not poll studio output

- **GIVEN** user selects bottom **Logs** tab
- **WHEN** global poll ticks
- **THEN** no dedicated studio-output poll is invoked
- **AND** `readProjectLogs` may run

#### Scenario: Output tab does not poll project logs

- **GIVEN** user selects bottom **Output** tab
- **WHEN** global poll ticks
- **THEN** `readProjectLogs` is not invoked
- **AND** Output still renders local buffered entries

#### Scenario: Switching bottom tabs does not append output

- **GIVEN** local output buffer has N entries
- **WHEN** user toggles between **Output** and **Logs**
- **THEN** entry count stays N until an explicit user action appends

### Requirement: metadata and artifact saves log to Output

#### Scenario: successful actions append local output and optional debug trace

- **WHEN** artifact save, description/policy PATCH, successful scope dialog save, or validation succeeds
- **THEN** a local output entry is appended
- **AND** a remote debug trace may be written via `appendProjectLog`

#### Scenario: output buffer discards oldest rows beyond the cap

- **GIVEN** the shell already holds 400 local output entries
- **WHEN** another action appends a new output entry
- **THEN** the oldest entry is discarded
- **AND** total retained entries remain 400

### Requirement: graph sidebar opens central overview

#### Scenario: Opening graph sidebar entry switches center workspace

- **WHEN** the user opens the graph entry from the sidebar
- **THEN** the shell switches to the central **Graph Main View**
- **AND** local output entry count is unchanged

### Requirement: shell orchestrates global command and search navigation

#### Scenario: Navigating to a spec from palette

- **WHEN** user selects a Specification from the Command Palette
- **THEN** the central workspace switches to the selected spec

#### Scenario: Navigating to a symbol logs to output

- **WHEN** user selects a Code Symbol from the Command Palette
- **THEN** the shell appends a navigation log to the Output panel

#### Scenario: Navigating to a document logs to output

- **WHEN** user selects a Document from the Command Palette
- **THEN** the shell appends a navigation log to the Output panel
