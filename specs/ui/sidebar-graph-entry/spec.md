# Sidebar Graph Entry

## Purpose

Studio UI for **Sidebar Graph Entry**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Sidebar Graph Entry**.

## Requirements

### Requirement: sidebar renders global poll data and wires actions

The sidebar MUST render lists from global poll hooks (`hooks-changes-collection`, `hooks-workspaces-specs`, etc.). The Graph entry MUST be implemented using a shadcn **`Button`** (variant ghost) and a shadcn **`Badge`** to indicate status (ready, stale, etc.). Row actions (open, restore, discard) MUST call the appropriate mutate port methods.

### Requirement: graph activity rail icon reflects stale index state

When the sidebar is collapsed to the activity rail, the Graph icon MUST show a stale
indicator (amber dot or equivalent badge) when `projectStatus.graph.stale` from the project poll session store is true.

Clicking the Graph activity-rail icon MUST switch the central workspace to **Graph
Main View**. It MUST NOT open a Graph sidebar body panel.

Stale state MUST use a corner badge on the rail icon (not inline text overlapping the
icon). Fingerprint mismatch MUST NOT add a separate rail indicator in v1.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
