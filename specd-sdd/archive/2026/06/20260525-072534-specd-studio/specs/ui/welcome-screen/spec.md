# Spec: Welcome Screen

## Purpose

Define the shared project-entry UI shown when there is no active connection in `@specd/ui`, and reused by the desktop host as an overlay dialog when opening or switching projects.

## Requirements

### Requirement: Render welcome screen when no active connection

The `@specd/ui` package SHALL export a `WelcomeScreen` component.
`SpecdApp` SHALL render the `WelcomeScreen` component when there is no active connection profile.
The same shared UI SHALL also be reusable as a desktop modal dialog for project switching while a session is already mounted.

### Requirement: Compact open-project chooser

The `WelcomeScreen` SHALL render a compact chooser with separate actions for opening a local workspace and opening the remote connection flow.
The initial chooser MUST fit within the desktop viewport without requiring page scroll.

### Requirement: Remote server connection dialog

The `WelcomeScreen` SHALL open the remote connection flow in a secondary dialog that allows specifying a server URL and an optional access token, delegating connection logic to `ConnectPanel`.

### Requirement: Electron local project action

The `WelcomeScreen` SHALL detect whether it is running within Electron (via checking for `window.specd` bridge).
If `window.specd` is present, the component SHALL render an "Open local project" button to trigger directory selection via Electron's dialog.

### Requirement: Display recent connections and projects

The `WelcomeScreen` SHALL retrieve the list of recent connection profiles and local projects using the injected `IUserStorage` port and display them as clickable items to quickly restore a session.
When the recent list exceeds the available height, it SHALL remain scrollable within the chooser rather than expanding beyond the dialog bounds.

## Constraints

- The `WelcomeScreen` MUST NOT import `@specd/core`.
- Visual styling MUST use Studio design system tokens and follow dark IDE theme principles (density, anti-SaaS color palettes).
- Desktop hosts SHALL be able to control the chooser as a modal without forking a desktop-specific alternate project-entry component.

## Spec Dependencies

- [`default:_global/architecture`](../../../default/_global/architecture/spec.md) — UI boundaries
- [`client:user-storage-port`](../../client/user-storage-port/spec.md) — retrieve recent profiles/projects
- [`ui:connect-panel`](../connect-panel/spec.md) — connect setup delegation
