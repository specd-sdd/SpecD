# Change Tab Context

## Purpose

Studio UI for **Change Tab Context**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Change Tab Context**.

## Requirements

### Requirement: change tab refetches compiled context for selected step when updatedAt advances

While this change tab is visible for an **active** change, the view MUST load compiled context via `getChangeContext(name, { includeChangeSpecs: true, step: change.state })` and refresh on tab-scoped poll ticks. The rendered body MUST include change-scoped spec content (full or catalogue), not only project-level `context:` entries from `specd.yaml`. Polling MUST pause when the tab is hidden or the window lacks focus. Archived changes MUST NOT call `getChangeContext` (read-only messaging only).

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
