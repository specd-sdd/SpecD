# Verification: Welcome Screen

## Requirements

### Requirement: Render welcome screen when no active connection

#### Scenario: App renders WelcomeScreen when activeProfile is null

- **GIVEN** `SpecdApp` is initialized with no active connection profile
- **WHEN** the main shell mounts
- **THEN** the `WelcomeScreen` component is visible

#### Scenario: Desktop host reuses shared project chooser as modal

- **GIVEN** a desktop session is already mounted
- **WHEN** the host requests project switching
- **THEN** the same shared project-entry UI is rendered as a modal overlay
- **AND** no desktop-only alternate chooser component is required

### Requirement: Compact open-project chooser

#### Scenario: WelcomeScreen renders separate local and remote entry actions

- **GIVEN** the `WelcomeScreen` is mounted
- **THEN** it renders a local workspace action and a remote connection action
- **AND** the first view remains bounded within the desktop viewport

### Requirement: Remote server connection dialog

#### Scenario: Remote connection opens in second dialog

- **GIVEN** the `WelcomeScreen` is mounted
- **WHEN** the user chooses the remote connection action
- **THEN** a secondary dialog opens with server URL and token fields
- **AND** submitting delegates the values to `ConnectPanel`

### Requirement: Electron local project action

#### Scenario: Open local project shown in Electron

- **GIVEN** `window.specd` bridge is defined (running in Electron)
- **WHEN** `WelcomeScreen` renders
- **THEN** the "Open local project" button is visible and interactive

#### Scenario: Open local project hidden in browser

- **GIVEN** `window.specd` is undefined (running in browser)
- **WHEN** `WelcomeScreen` renders
- **THEN** the "Open local project" button is NOT rendered

### Requirement: Display recent connections and projects

#### Scenario: WelcomeScreen loads and lists recent items

- **GIVEN** `IUserStorage` contains saved recent connections
- **WHEN** `WelcomeScreen` mounts
- **THEN** it queries `IUserStorage`
- **AND** displays the items as clickable shortcuts

#### Scenario: Recent list scrolls within chooser bounds

- **GIVEN** enough recent entries to exceed the chooser height
- **WHEN** `WelcomeScreen` renders
- **THEN** the recent items remain accessible via internal scrolling
- **AND** the dialog height stays fixed within the viewport
