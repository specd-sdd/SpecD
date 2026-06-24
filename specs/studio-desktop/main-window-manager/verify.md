# Verification: Main Window Manager

## Requirements

### Requirement: window title reflects the active project or connection

#### Scenario: Local project name in title bar

- **GIVEN** folder `my-app` open
- **WHEN** window renders
- **THEN** title includes project folder name
- **AND** Specd branding prefix present

#### Scenario: Remote connection shows host

- **GIVEN** connected to `https://ci.example`
- **WHEN** window renders
- **THEN** title includes host
- **AND** not local folder name

#### Scenario: Title updates on profile switch

- **WHEN** user switches from local to remote
- **THEN** title changes without restart
- **AND** matches active profile

### Requirement: window close prompts when dirty editors exist

#### Scenario: Close blocked while editor dirty

- **GIVEN** unsaved artifact buffer
- **WHEN** user closes window
- **THEN** confirmation dialog shown
- **AND** close aborted if user cancels

#### Scenario: Clean buffers allow immediate close

- **GIVEN** no dirty editors
- **WHEN** user closes window
- **THEN** app exits without prompt
- **AND** buffers were saved or pristine

#### Scenario: Save-all option in close dialog

- **WHEN** user chooses save all on close prompt
- **THEN** pending saves run
- **AND** window closes only after success

### Requirement: main window uses integrated custom titlebar on desktop

#### Scenario: macOS window uses hiddenInset titlebar

- **GIVEN** platform is darwin
- **WHEN** main window is created
- **THEN** `titleBarStyle` is `hiddenInset`
- **AND** `trafficLightPosition` is set for a ~44px titlebar
- **AND** traffic light position leaves room for traffic slot and sidebar toggle

#### Scenario: Windows window uses titleBarOverlay

- **GIVEN** platform is win32
- **WHEN** main window is created
- **THEN** `titleBarOverlay` is configured with Studio titlebar height of 44px

#### Scenario: Preload exposes platform to renderer

- **WHEN** renderer reads host metadata from preload
- **THEN** `platform` is `darwin`, `win32`, or `linux`
- **AND** document root receives `data-platform`
