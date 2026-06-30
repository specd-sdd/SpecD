# Recent Connections

## Purpose

Electron desktop host concern — **Recent Connections**. Local mode bootstraps an SDK host context (`createSdkContext`) in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack. Persist most-recently used local project paths and remote API profiles.

## Requirements

### Requirement: recents are stored in app user data

The module MUST persist an ordered MRU list on disk under the Electron app user data directory.

### Requirement: tokens are stored with explicit user consent

Remote profile tokens MUST NOT be written to logs; storage policy MUST match connect-panel (local encrypted store or OS secret store in future; v1 MAY use app-local storage with clear UX).

## Spec Dependencies

- [`client:specd-data-port`](../../../../../../specs/client/specd-data-port/spec.md) — IPC data contract implemented by the desktop adapter
