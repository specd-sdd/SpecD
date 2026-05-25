# Desktop Local Data Adapter

## Purpose

Electron desktop host concern — **Desktop Local Data Adapter**. Local mode runs `createKernel` in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack. Renderer-side `SpecdDataPort` that calls IPC instead of HTTP for the local desktop profile.

## Requirements

### Requirement: local adapter is selected for opened project folders

When the user opens a local project in desktop, the renderer MUST use this adapter instead of `adapter-remote-specd-data`.

### Requirement: local adapter does not attach Authorization headers

The local profile MUST NOT use `client:adapter-bearer-auth`.

## Spec Dependencies

_none_
