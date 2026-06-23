# Welcome And File Menu

## Purpose

Electron desktop host concern — **Welcome And File Menu**. Local mode runs `createKernel` in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack. Entry flows use the shared `@specd/ui` project chooser to open a local project folder or connect to a remote API.

## Requirements

### Requirement: welcome offers local open and remote connect

First run MUST show the shared project chooser with local workspace and remote API options.
The File menu MUST expose a single `Open SpecD Project...` command that opens the same chooser rather than separate local and remote entries.
Within that chooser, remote configuration MUST open in a secondary dialog and local opening MUST trigger the native directory picker.

### Requirement: switching projects is confirmation-driven

Opening the chooser from the File menu while a project is already mounted MUST keep the current session visible in the background.
The current session MUST remain active until the newly selected local workspace or remote connection has been validated successfully.

### Requirement: recent connections are reachable from the menu

File menu MUST list recent local paths and remote profiles from `studio-desktop:recent-connections`.

## Spec Dependencies

- [`client:specd-data-port`](../../../../../../specs/client/specd-data-port/spec.md) — IPC data contract implemented by the desktop adapter
