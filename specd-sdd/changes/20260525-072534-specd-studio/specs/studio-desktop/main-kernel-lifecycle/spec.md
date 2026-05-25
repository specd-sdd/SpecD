# Main Kernel Lifecycle

## Purpose

Electron desktop host concern — **Main Kernel Lifecycle**. Local mode runs `createKernel` in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack. Electron main process owns `createKernel` for locally opened projects.

## Requirements

### Requirement: one kernel per open local project

Opening a project directory MUST construct exactly one `Kernel` for that `specd.yaml` root until the project is closed or switched.

### Requirement: project switch tears down kernel and graph state

Switching projects MUST dispose the previous kernel/graph provider before creating a new one to avoid cross-project leakage.

## Spec Dependencies

_none_
