# Hooks Changes Read

## Purpose

Open change tabs need fresh status and artifacts when an agent edits `manifest.json`, but refetching the full DAG every second is wasteful. These hooks poll change status with `ifModifiedSince` against manifest `updatedAt` and only reload the data each tab actually displays.

Shelved drafts and discarded changes live outside the active change store; read hooks MUST call the dedicated port methods (`getDraft` / `getDiscarded`, etc.) instead of `getChange`, which returns 404 for those names.

## Requirements

### Requirement: read hooks route by sidebar list section

`useChangesRead`, `useChangeArtifact`, `useChangeArtifactList`, and multi-file change artifact readers MUST accept an optional `listSection` (`active` | `draft` | `discarded` | null). When `listSection` is `draft`, hooks MUST call `getDraft`, `getDraftStatus`, `listDraftArtifacts`, and `getReadOnlyChangeArtifact` with `readOnlyOrigin` `draft`. When `listSection` is `discarded`, hooks MUST call `getDiscarded`, `getDiscardedStatus`, `listDiscardedArtifacts`, and `getReadOnlyChangeArtifact` with `readOnlyOrigin` `discarded`. Otherwise hooks MUST call the active-change methods (`getChange`, `getChangeStatus`, `listChangeArtifacts`, `getChangeArtifact`).

Archived change detail remains loaded through `getArchivedChange`, but artifact body reads for archived snapshots MUST route through `getReadOnlyChangeArtifact(..., 'archived')`. Archived artifact lists MAY come directly from archived detail instead of `listChangeArtifacts`.

Artifact list hooks MUST preserve task metadata (`hasTasks`, optional task counters) from the port so downstream UI can resolve task-capable files without relying on a fixed filename.

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

### Requirement: hooks MUST prevent infinite render loops through stable results

Hooks that return arrays or complex objects from async resources (e.g. `useChangeArtifactList`, `useChangeArtifacts`) SHALL ensure the returned references are stable when data is unchanged. They MUST avoid returning new array/object literals on every render when data sources or dependencies have not logically changed.

Multi-artifact readers MUST memoize their normalized parameter sets (e.g. filenames) using stringified representations (e.g. `join('|')`) to prevent re-triggering loads when a parent component passes a new array reference containing identical content.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`client:port-changes-read`](../../client/port-changes-read/spec.md) — port methods
