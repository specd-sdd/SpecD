# Change Tab Tasks

## Purpose

Studio UI for **Change Tab Tasks**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Change Tab Tasks**.

## Requirements

### Requirement: change tab refetches status tasks + `tasks.md` content when needed when updatedAt advances

While this change tab is visible, the view MUST call `getChangeStatus(name, { ifModifiedSince })` using the last seen `updatedAt`. When the API returns `unchanged: true`, the view MUST skip heavy refetch. When `updatedAt` advances, the view MUST refetch **status tasks + `tasks.md` content when needed** via `getChangeArtifact(changeName, 'tasks.md')`. Polling MUST pause when the tab is hidden or the window lacks focus. After a successful Save, the view MUST refetch immediately. Archived changes MUST NOT load tasks content (read-only shell messaging only).

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
