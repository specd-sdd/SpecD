# Change Tab Tasks

## Purpose

Studio UI for **Change Tab Tasks**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Change Tab Tasks**.

## Requirements

### Requirement: change tab refetches task-capable artifacts when needed when updatedAt advances

While this change tab is visible, the view MUST call `getChangeStatus(name, { ifModifiedSince })` using the last seen `updatedAt`. When the API returns `unchanged: true`, the view MUST skip heavy refetch. When `updatedAt` advances, the view MUST refetch task-capable artifact content when needed through the matching change read route. Polling MUST pause when the tab is hidden or the window lacks focus. After a successful Save, the view MUST refetch immediately.

Task-capable artifacts are not identified by a fixed filename. The view MUST resolve them from API metadata (`hasTasks`) and MUST render every tracked file belonging to task-capable artifacts, not just the first file.

The tasks summary shown for a change MUST use API-provided aggregate counters (`totalTasks`, `completedTasks`) that represent the sum across all task-capable artifacts in that change.

For **archived** changes, the tab MUST derive task-capable artifact presence from the archived snapshot detail (`getArchivedChange`) and MUST load each tracked body through the archived read-only artifact route instead of showing a blanket unavailable message.

When a rendered tasks file ends with `.md`, the body MUST be rendered as Markdown. Other file formats MAY be rendered as plain text. Each rendered file MUST show its filename in the section header.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
