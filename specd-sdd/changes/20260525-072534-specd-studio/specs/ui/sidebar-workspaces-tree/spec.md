# Sidebar Workspaces Tree

## Purpose

Studio UI for **Sidebar Workspaces Tree**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Sidebar Workspaces Tree**.

## Requirements

### Requirement: sidebar renders global poll data and wires actions

The sidebar MUST render lists from global poll hooks (`hooks-changes-collection`, `hooks-workspaces-specs`, etc.). Row actions (open, restore, discard) MUST call the appropriate mutate port methods.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
