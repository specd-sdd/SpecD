# Main Kernel Lifecycle

## Purpose

Electron desktop host concern — **Main Kernel Lifecycle**. Local mode runs `createKernel` in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack. Electron main process owns `createKernel` for locally opened projects.

## Requirements

### Requirement: one kernel per open local project

Opening a project directory MUST construct exactly one `Kernel` for that `specd.yaml` root until the project is closed or switched.

### Requirement: project switch tears down kernel and graph state

Switching projects MUST dispose the previous kernel/graph provider before creating a new one to avoid cross-project leakage.

### Requirement: desktop startup prepares the Electron SQLite graph runtime

The desktop host MUST prepare its Electron-native SQLite graph runtime before the
app starts local graph work.

The desktop package MUST:

- depend on `@specd/code-graph-electron` for desktop-local graph execution
- expose `rebuild:graph-sqlite-electron` for rebuilding the vendored Electron SQLite addon
- expose `rebuild:graph-electron` as an alias of that rebuild
- run the Electron SQLite rebuild from `prestart`

This wiring isolates the native SQLite runtime required by the Electron desktop
host without retargeting CLI or API away from `@specd/code-graph`.

### Requirement: desktop kernel configures plain-text logs

The desktop kernel MUST receive `logFormatter: createLogFormatter({ colorize: false })` so that log readback through local IPC returns plain text without ANSI escape sequences.

## Spec Dependencies

_none_
