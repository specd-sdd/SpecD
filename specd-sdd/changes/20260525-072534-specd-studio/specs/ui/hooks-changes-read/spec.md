# Hooks Changes Read

## Purpose

Open change tabs need fresh status and artifacts when an agent edits `manifest.json`, but refetching the full DAG every second is wasteful. These hooks poll change status with `ifModifiedSince` against manifest `updatedAt` and only reload the data each tab actually displays.

Shelved drafts and discarded changes live outside the active change store; read hooks MUST call the dedicated port methods (`getDraft` / `getDiscarded`, etc.) instead of `getChange`, which returns 404 for those names.

## Requirements

### Requirement: read hooks route by sidebar list section

`useChangesRead`, `useChangeArtifact`, and `useChangeArtifactList` MUST accept an optional `listSection` (`active` | `draft` | `discarded` | null). When `listSection` is `draft`, hooks MUST call `getDraft`, `getDraftStatus`, `listDraftArtifacts`, and `getDraftArtifact`. When `listSection` is `discarded`, hooks MUST call `getDiscarded`, `getDiscardedStatus`, `listDiscardedArtifacts`, and `getDiscardedArtifact`. Otherwise hooks MUST call the active-change methods (`getChange`, `getChangeStatus`, `listChangeArtifacts`, `getChangeArtifact`).

Shared routing logic MAY live in `change-read-routes` under `@specd/ui`. Cache keys MUST include the section bucket so switching lists does not reuse stale active-change data.

The shell MUST derive `listSection` from which sidebar collection contains the open change name and MUST pass it into these hooks.

### Requirement: shelved and archived views do not poll change status or artifacts

Drafted, discarded, and archived change tabs are read-only and do not change while open. Hooks MUST support disabling polling so the shell can load these resources once and then stop refreshing:

- `useChangesRead` MUST allow the shell to skip `get*Status` polling for drafted/discarded/archived.
- Artifact list and artifact body hooks MUST avoid refresh-key polling for drafted/discarded/archived (selection changes still load once).

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`client:port-changes-read`](../../client/port-changes-read/spec.md) — port methods
