# Sidebar Workspaces Tree

## Purpose

Studio UI for **Sidebar Workspaces Tree**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Sidebar Workspaces Tree**.

## Requirements

### Requirement: sidebar renders global poll data and wires actions

The sidebar MUST render lists from global poll hooks (`hooks-changes-collection`, `hooks-workspaces-specs`, etc.). Workspaces MUST be grouped using shadcn **`Card`** components. Rows MUST be implemented using shadcn **`Button`** (variant ghost). Row actions (open, restore, discard) MUST call the appropriate mutate port methods.

### Requirement: workspace tree renders in stacked Workspaces panel when sidebar expanded

The workspace spec tree MUST render in the stacked **Workspaces – Specs** sidebar
block whenever the primary sidebar is expanded (alongside the Changes block), regardless
of which activity-rail section is selected in the center.

Poll-driven tree hooks MUST be disabled when the sidebar is collapsed unless the center
is **workspaces-hub** or an open **spec** (delegated to shell visibility flags per
[`ui:hooks-workspaces-specs`](../hooks-workspaces-specs/spec.md)).

### Requirement: rows must truncate long spec paths

Each workspace and spec row MUST support text truncation ("...") when the sidebar width is constrained, using flexbox-based `min-w-0` and `truncate` rules applied to the button and its children.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
