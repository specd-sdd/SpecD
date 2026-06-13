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

Overview MUST embed `getChangeStatus` results for the open **active** or **drafted** change: next action, blockers, and lifecycle transitions. Overview MUST NOT duplicate the Artifacts tab (no per-artifact file list on Overview). Next actions and blockers MUST be displayed using shadcn **`Card`** or **`Alert`** components as appropriate for their severity.

For **archived** and **discarded** changes, the shell MUST NOT poll workflow status. The **Workflow & validation** card MUST show the embedded message **Workflow status unavailable.** (same copy as archived), not an API error from `getChangeStatus`.

### Requirement: overview hosts change metadata editor

Overview MUST delegate description, invalidation policy, read-only specs/deps, and scope dialog to [`ui:change-metadata-editor`](../change-metadata-editor/spec.md). Layout order: title → lifecycle actions → metadata block → workflow & validation → summary cards → specs & dependencies → recent events.

### Requirement: overview surfaces lifecycle actions

The Overview header MUST render a `ChangeLifecycleActions` block immediately below the change title. The block's content depends on which sidebar list the open change belongs to:

- **active** — shows **Shelf to drafts**, **Discard** (destructive), and **Archive** (only when state is `archivable` or `signed-off`). Overview editors (description, scope, invalidation) are enabled.
- **draft** / **discarded** — shelved read-only: same banner pattern as archived (distinct copy), no Overview editors, no Validate All, inspector Monaco read-only without Save/Validate, lifecycle actions only where applicable (restore/discard on draft; none on discarded).
- **draft** — shows **Restore to active** and **Discard** (destructive).
- **discarded** — shows a read-only notice ("permanently discarded, cannot be restored").
- **archived** or `null` — no lifecycle block is rendered.

Each lifecycle action MUST open a Studio confirmation modal (`ChangeLifecycleConfirmDialog`) before calling the port. Discard MUST use a destructive-styled modal that states the action is irreversible. Lifecycle actions MUST be disabled while `lifecycleBusy` is true to prevent double-submission. After each action the shell MUST refetch both `getChange` detail and `getChangeStatus` for the open change.

The **Discard permanently** control MUST be visually separated from reversible actions (right-aligned with a divider when other actions are present).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`ui:change-metadata-editor`](../change-metadata-editor/spec.md) — metadata UX
