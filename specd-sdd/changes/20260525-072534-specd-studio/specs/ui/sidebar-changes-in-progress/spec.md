# Sidebar Changes In Progress

## Purpose

Studio UI for **Sidebar Changes In Progress**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Sidebar Changes In Progress**.

## Requirements

### Requirement: sidebar renders global poll data — navigation only

The sidebar MUST render a list of active in-progress changes from global poll hooks. Each row navigates to the change Overview — the sidebar MUST NOT expose per-row action buttons (Draft, Discard, Archive, etc.). All lifecycle actions are surfaced in the change **Overview** tab after opening the change.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
