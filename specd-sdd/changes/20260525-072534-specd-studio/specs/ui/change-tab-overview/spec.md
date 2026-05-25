# Change Tab Overview

## Purpose

Studio UI for **Change Tab Overview**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Change Tab Overview**.

## Requirements

### Requirement: change tab refetches conditional status when updatedAt advances

While this change tab is visible, the view MUST call `getChangeStatus(name, { ifModifiedSince })` using the last seen `updatedAt`. When the API returns `unchanged: true`, the view MUST skip heavy refetch. When `updatedAt` advances, the view MUST refetch **conditional status**. Polling MUST pause when the tab is hidden or the window lacks focus. After a successful Save, the view MUST refetch immediately.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

### Requirement: overview includes workflow and validation status

Overview MUST embed `getChangeStatus` results for the open change: next action, blockers, and lifecycle transitions. Overview MUST NOT duplicate the Artifacts tab (no per-artifact file list on Overview).

### Requirement: overview hosts change metadata editor

Overview MUST delegate description, invalidation policy, read-only specs/deps, and scope dialog to [`ui:change-metadata-editor`](../change-metadata-editor/spec.md). Layout order: title → metadata block → summary cards → workflow → specs & dependencies → recent events.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`ui:change-metadata-editor`](../change-metadata-editor/spec.md) — metadata UX
