# Remote Bootstrap

## Purpose

Browser host for standalone Studio — **Remote Bootstrap**. Does not load a project kernel; users supply an API base URL and optional token before the shared `@specd/ui` IDE mounts.

## Requirements

### Requirement: connection is required before SpecdApp mounts

On cold start, the app MUST show `ui:connect-panel` until `GET /v1/project` (or health) succeeds against the configured base URL.

### Requirement: connection profile persists locally

API base URL and optional token MUST persist in browser storage and restore on reload.

## Spec Dependencies

_none_
