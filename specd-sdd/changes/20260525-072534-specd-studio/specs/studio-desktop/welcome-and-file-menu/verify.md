# Verification: Welcome And File Menu

## Requirements

### Requirement: welcome offers local open and remote connect

#### Scenario: Welcome shows open folder action

- **WHEN** app launches without project
- **THEN** Open Folder control visible
- **AND** triggers native directory picker

#### Scenario: Welcome shows remote connect form

- **WHEN** welcome screen renders
- **THEN** URL and token fields available
- **AND** Test Connection runs health check

#### Scenario: Successful local open dismisses welcome

- **WHEN** user picks valid project folder
- **THEN** main window shows IDE
- **AND** welcome hidden

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
