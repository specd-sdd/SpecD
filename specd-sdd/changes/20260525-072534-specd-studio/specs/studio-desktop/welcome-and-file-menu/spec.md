# Welcome And File Menu

## Purpose

Electron desktop host concern — **Welcome And File Menu**. Local mode runs `createKernel` in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack. Entry flows to open a local project folder or connect to a remote API.

## Requirements

### Requirement: welcome offers local open and remote connect

First run and File menu MUST offer “Open local project” (directory with `specd.yaml`) and “Connect to remote API” (URL + optional token).

### Requirement: recent connections are reachable from the menu

File menu MUST list recent local paths and remote profiles from `studio-desktop:recent-connections`.

## Spec Dependencies

_none_
