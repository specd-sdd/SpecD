# Hooks Inspector Save

## Purpose

React data hooks for **Hooks Inspector Save**: loading state, error propagation, and polling rules for `SpecdDataPort`. Hooks keep components free of transport details and `@specd/core` imports.

## Requirements

### Requirement: save hook sends content originalHash and optional force

Save MUST call `saveChangeArtifact` with the editor buffer, the last `originalHash` from GET, and `force: true` only after explicit user confirmation when approvals are active.

### Requirement: save hook shows conflict UI on HTTP 409

On `ArtifactConflictError`, the hook MUST stop spinners and present conflict resolution UI without discarding local edits silently.

### Requirement: successful save triggers artifact and status refetch

After success, the hook MUST refetch artifact content and preview and signal `ui:hooks-changes-read` to refresh status immediately.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`client:port-changes-mutate`](../../client/port-changes-mutate/spec.md) — port methods
