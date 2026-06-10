# Sidebar Changes In Progress

## Purpose

Studio UI for **Sidebar Changes In Progress**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Sidebar Changes In Progress**.

## Requirements

### Requirement: sidebar renders global poll data — navigation only

The sidebar MUST render a list of active in-progress changes from global poll hooks. Sections MUST be enclosed in shadcn **`Card`** components. Each row MUST be implemented using a shadcn **`Button`** (variant ghost) that navigates to the change Overview — the sidebar MUST NOT expose per-row action buttons (Draft, Discard, Archive, etc.). All lifecycle actions are surfaced in the change **Overview** tab after opening the change.

### Requirement: rows must truncate long change names

Each change row MUST support text truncation ("...") when the sidebar width is constrained, using flexbox-based `min-w-0` and `truncate` rules applied to the button and its children.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
