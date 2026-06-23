# Verification: Welcome And File Menu

## Requirements

### Requirement: welcome offers local open and remote connect

#### Scenario: Welcome shows open folder and remote chooser actions

- **WHEN** app launches without project
- **THEN** local open and remote connect controls are visible
- **AND** triggers native directory picker

#### Scenario: File menu opens the shared chooser

- **GIVEN** the desktop window is already open
- **WHEN** the user selects `Open SpecD Project...` from the File menu
- **THEN** the shared project chooser opens
- **AND** there are no separate File menu entries for local and remote flows

#### Scenario: Welcome opens remote dialog on demand

- **WHEN** welcome screen renders
- **AND** the user chooses the remote action
- **THEN** URL and token fields become available in a secondary dialog
- **AND** Test Connection runs health check

#### Scenario: Successful local open dismisses welcome

- **WHEN** user picks valid project folder
- **THEN** main window shows IDE
- **AND** welcome hidden

### Requirement: switching projects is confirmation-driven

#### Scenario: Opening chooser does not discard current session

- **GIVEN** a project is already open in the desktop host
- **WHEN** the user opens `Open SpecD Project...`
- **THEN** the current project remains visible behind the chooser
- **AND** it is not closed immediately

#### Scenario: Failed replacement keeps current session

- **GIVEN** a project is already open in the desktop host
- **WHEN** the user attempts to switch projects and the new local or remote target fails validation
- **THEN** the current session remains active
- **AND** the chooser reports the failure without forcing a close

### Requirement: recent connections are reachable from the menu

#### Scenario: File menu lists recent hosts

- **GIVEN** stored recents exist
- **WHEN** user opens File menu
- **THEN** recent entries shown
- **AND** selecting one reconnects

#### Scenario: Menu recents match welcome list

- **WHEN** recents updated from welcome connect
- **THEN** same hosts appear in menu
- **AND** order consistent

#### Scenario: Empty recents hides submenu items

- **GIVEN** no stored recents
- **WHEN** File menu opens
- **THEN** recents section empty or disabled
- **AND** no broken placeholders
