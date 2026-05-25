# Desktop Remote Profile

## Purpose

Electron desktop host concern — **Desktop Remote Profile**. Local mode runs `createKernel` in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack. Desktop renderer path that talks to a remote `@specd/api` like `specd-studio-web`.

## Requirements

### Requirement: remote profile uses HTTP SpecdDataPort

When the user connects to a remote API base URL, the renderer MUST use `client:adapter-remote-specd-data` with URL and optional token from connect/recents.

## Spec Dependencies

_none_
