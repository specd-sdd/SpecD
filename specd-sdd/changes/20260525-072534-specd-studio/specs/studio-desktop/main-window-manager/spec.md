# Main Window Manager

## Purpose

Electron desktop host concern — **Main Window Manager**. Local mode runs `createKernel` in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack. Create and manage the primary Electron `BrowserWindow` hosting the Studio renderer.

## Requirements

### Requirement: window title reflects the active project or connection

When a local project is open, the title MUST include the project name; for remote-only sessions, the title MUST include the API host or profile label.

### Requirement: window close prompts when dirty editors exist

If the artifact editor has unsaved buffers, closing the window MUST prompt the user before discarding (delegate to UI state).

## Spec Dependencies

_none_
